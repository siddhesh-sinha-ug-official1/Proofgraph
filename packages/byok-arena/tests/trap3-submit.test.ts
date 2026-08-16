// TRAP 3 — result-message shape per provider (§6.F) + id echo end-to-end.
// Asserts the EXACT native shapes from the resultShape probes and the actual
// continuation request bodies captured on submit.request call probes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, payloadsOf, TEST_KEYS } from "./helpers.ts";
import { makeFakeFetch, providerHappyRoutes } from "../src/testkit/fakefetch.ts";
import { executeWeatherTool, weatherTask } from "../src/testkit/goldens.ts";
import { buildResponsesResultItem } from "../src/adapters/openaiResponses.ts";
import { ProbeBus } from "../src/probe/bus.ts";
import { buildCatalog } from "../src/probe/catalog.ts";

async function chatThenSubmit(cell: any, provider: "anthropic" | "openai" | "gemini", model: string, isError = false) {
  const adapter = cell.adapters[provider];
  const key = TEST_KEYS[provider];
  const first = await adapter.chat({
    apiKey: key, model, messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const call = first.toolCalls[0];
  const cont = await adapter.submitToolResults({
    apiKey: key, model, messages: weatherTask.messages,
    results: [{ toolCallId: call.id, name: call.name, output: executeWeatherTool(), ...(isError ? { isError: true } : {}) }],
    tools: weatherTask.tools,
  });
  return { first, call, cont };
}

test("anthropic TRAP 3: tool_result block in a NEW user message, keyed tool_use_id; id echoed; continuation normalizes", async () => {
  const cell = makeTestCell();
  const { call, cont } = await chatThenSubmit(cell, "anthropic", "claude-sonnet-5");

  const shape = payloadOf(cell, "adapter.anthropic.submit.resultShape");
  assert.equal(shape.role, "user");
  assert.equal(shape.content[0].type, "tool_result");
  assert.equal(shape.content[0].tool_use_id, call.id);
  assert.equal(shape.content[0].content, "15°C, sunny");

  const echo = payloadOf(cell, "adapter.anthropic.submit.idEcho");
  assert.deepEqual(echo, { echoedId: call.id, mappedBy: "id", matchesReceived: true });

  // the actual wire: last message of the continuation body is that user msg
  const body = payloadOf(cell, "adapter.anthropic.submit.request").body;
  const last = body.messages[body.messages.length - 1];
  assert.equal(last.role, "user");
  assert.equal(last.content[0].tool_use_id, call.id);
  // and the assistant tool_use turn precedes it (from the adapter's cache)
  const prev = body.messages[body.messages.length - 2];
  assert.equal(prev.role, "assistant");
  assert.ok(prev.content.some((b: any) => b.type === "tool_use" && b.id === call.id));
  assert.equal(payloadOf(cell, "adapter.anthropic.submit.assistantReconstruction").source, "cache");

  assert.equal(cont.text, "It's 15°C and sunny in Paris.");
  assert.equal(cont.stopReason, "stop");
});

test("anthropic TRAP 3 error case: is_error:true carried on the tool_result block", async () => {
  const cell = makeTestCell();
  await chatThenSubmit(cell, "anthropic", "claude-sonnet-5", true);
  const shape = payloadOf(cell, "adapter.anthropic.submit.resultShape");
  assert.equal(shape.content[0].is_error, true);
});

test("openai TRAP 3: one role:'tool' message PER call, keyed tool_call_id; Responses branch shown NOT taken", async () => {
  const cell = makeTestCell();
  const { call, cont } = await chatThenSubmit(cell, "openai", "gpt-5.6");

  const shape = payloadOf(cell, "adapter.openai.submit.resultShape");
  assert.deepEqual(shape, { role: "tool", tool_call_id: call.id, content: "15°C, sunny" });

  // branch not taken: Responses item uses call_id + OUTPUT (not content)
  const responses = payloadOf(cell, "adapter.openai.submit.resultShape.responses");
  assert.equal(responses.native.type, "function_call_output");
  assert.equal(responses.native.call_id, call.id);
  assert.equal(responses.native.output, "15°C, sunny");
  assert.ok(!("content" in responses.native), "Responses uses `output`, never `content`");

  const echo = payloadOf(cell, "adapter.openai.submit.idEcho");
  assert.deepEqual(echo, { echoedId: call.id, mappedBy: "id", matchesReceived: true });

  const body = payloadOf(cell, "adapter.openai.submit.request").body;
  const toolMsgs = body.messages.filter((m: any) => m.role === "tool");
  assert.equal(toolMsgs.length, 1, "one role:tool message per call");
  assert.equal(toolMsgs[0].tool_call_id, call.id);
  const assistant = body.messages.find((m: any) => m.role === "assistant" && m.tool_calls);
  assert.ok(assistant.tool_calls.some((tc: any) => tc.id === call.id), "assistant tool_calls turn re-sent");

  assert.equal(cont.text, "It's 15°C and sunny in Paris.");
});

test("gemini TRAP 3 (Gemini-3 style): functionResponse part with OBJECT response and echoed id; full contents re-sent", async () => {
  const cell = makeTestCell();
  const { call, cont } = await chatThenSubmit(cell, "gemini", "gemini-3.5-flash");

  const shape = payloadOf(cell, "adapter.gemini.submit.resultShape");
  assert.equal(shape.part.functionResponse.name, "get_weather");
  assert.equal(shape.part.functionResponse.id, call.id, "Gemini 3: echo the real id");
  assert.equal(typeof shape.part.functionResponse.response, "object");
  assert.equal(shape.part.functionResponse.response.output, "15°C, sunny");
  assert.equal(shape.fullContentsResent, true);

  assert.deepEqual(payloadOf(cell, "adapter.gemini.submit.idEcho"),
    { echoedId: call.id, mappedBy: "id", matchesReceived: true });

  const body = payloadOf(cell, "adapter.gemini.submit.request").body;
  assert.ok(body.contents.length >= 3, "full conversation contents re-sent (user + model + functionResponse turn)");
  const last = body.contents[body.contents.length - 1];
  assert.ok(last.parts[0].functionResponse, "last content turn carries the functionResponse part");

  assert.equal(cont.text, "It's 15°C and sunny in Paris.");
});

test("gemini TRAP 3 (2.5 style, synthesized id): map by NAME — no id field on the functionResponse", async () => {
  const cell = makeTestCell({ fetchImpl: makeFakeFetch(providerHappyRoutes({ geminiVariant: "noId" })) });
  const { call } = await chatThenSubmit(cell, "gemini", "gemini-2.5-pro");
  assert.ok(call.id.startsWith("gemini-synth-"));

  const shape = payloadOf(cell, "adapter.gemini.submit.resultShape");
  assert.ok(!("id" in shape.part.functionResponse), "synthetic ids are NEVER echoed to the wire");
  assert.equal(shape.part.functionResponse.name, "get_weather", "mapping falls back to the function name");

  assert.deepEqual(payloadOf(cell, "adapter.gemini.submit.idEcho"),
    { echoedId: null, mappedBy: "name", matchesReceived: true });
});

test("openai Responses stub: buildResponsesResultItem emits the exact item shape", () => {
  const bus = new ProbeBus(buildCatalog());
  const item = buildResponsesResultItem(bus, { toolCallId: "call_resp_GOLD", output: "15°C, sunny" });
  assert.deepEqual(item, { type: "function_call_output", call_id: "call_resp_GOLD", output: "15°C, sunny" });
});

test("submit works standalone (results-only reconstruction) when the adapter never saw the chat", async () => {
  const cell = makeTestCell();
  // no prior chat() on this adapter instance — cache is cold
  const cont = await cell.adapters.anthropic.submitToolResults({
    apiKey: TEST_KEYS.anthropic, model: "claude-sonnet-5", messages: weatherTask.messages,
    results: [{ toolCallId: "toolu_EXTERNAL", name: "get_weather", output: "15°C, sunny" }],
    tools: weatherTask.tools,
  });
  assert.equal(payloadOf(cell, "adapter.anthropic.submit.assistantReconstruction").source, "results-only");
  const echo = payloadOf(cell, "adapter.anthropic.submit.idEcho");
  assert.equal(echo.matchesReceived, false, "honest: the echoed id was never received by THIS adapter");
  assert.equal(cont.text, "It's 15°C and sunny in Paris.");
});
