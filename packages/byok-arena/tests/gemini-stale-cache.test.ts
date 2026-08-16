// Regression for the audit-confirmed failure class: STALE-CACHE REPLAY.
// gemini chat() with a tool call → a later plain-text chat() overwrites
// lastNativeModelContent while callCache still holds the older id → a late
// submitToolResults for that id must NOT replay the text-only turn (which
// would reference a call the resent conversation never made — provider 400).
// It must fall back to results-only reconstruction with the real functionCall.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, TEST_KEYS } from "./helpers.ts";
import { makeFakeFetch } from "../src/testkit/fakefetch.ts";
import {
  executeWeatherTool, geminiContinuationResponse, geminiWeatherResponse, weatherTask,
} from "../src/testkit/goldens.ts";

const textOnlyResponse = {
  candidates: [{
    content: { role: "model", parts: [{ text: "just some prose, no tool call" }] },
    finishReason: "STOP", index: 0,
  }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 },
};

test("gemini submit after an intervening text-only chat: results-only reconstruction, real functionCall re-sent", async () => {
  const cell = makeTestCell({
    fetchImpl: makeFakeFetch([{
      test: (u, i) => u.hostname === "generativelanguage.googleapis.com" &&
        u.pathname.endsWith(":generateContent") && i.method === "POST",
      // 1st call → tool-call golden; 2nd → plain text (overwrites the cached turn); 3rd → continuation
      respond: (_u, _i, nth) => ({
        status: 200,
        body: nth === 0 ? geminiWeatherResponse : nth === 1 ? textOnlyResponse : geminiContinuationResponse,
      }),
    }]),
  });
  const gemini = cell.adapters.gemini;

  const first = await gemini.chat({
    apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const call = first.toolCalls[0];
  assert.equal(call.id, "8f2b1a3c");

  // intervening turn with NO tool call — lastNativeModelContent is now text-only
  const second = await gemini.chat({
    apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash",
    messages: [{ role: "user", content: "unrelated question" }],
  });
  assert.equal(second.toolCalls.length, 0);

  const cont = await gemini.submitToolResults({
    apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash", messages: weatherTask.messages,
    results: [{ toolCallId: call.id, name: call.name, output: executeWeatherTool() }],
  });

  // the stale text-only turn was NOT replayed
  assert.equal(payloadOf(cell, "adapter.gemini.submit.assistantReconstruction").source, "results-only");

  // and the wire carries a model turn with the REAL functionCall the response answers
  const body = payloadOf(cell, "adapter.gemini.submit.request").body;
  const modelTurn = body.contents[body.contents.length - 2];
  assert.equal(modelTurn.role, "model");
  const fc = modelTurn.parts.find((p: any) => p.functionCall)?.functionCall;
  assert.equal(fc.id, call.id);
  assert.equal(fc.name, "get_weather");
  assert.deepEqual(fc.args, { location: "Paris" });
  assert.equal(cont.text, "It's 15°C and sunny in Paris.");
});

test("gemini submit right after its own tool-call chat still uses the faithful cached turn", async () => {
  const cell = makeTestCell();
  const gemini = cell.adapters.gemini;
  const first = await gemini.chat({
    apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  await gemini.submitToolResults({
    apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash", messages: weatherTask.messages,
    results: [{ toolCallId: first.toolCalls[0].id, name: "get_weather", output: executeWeatherTool() }],
  });
  assert.equal(payloadOf(cell, "adapter.gemini.submit.assistantReconstruction").source, "cache");
});
