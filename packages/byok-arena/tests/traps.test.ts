// TRAP 1 (args type) + TRAP 2 (call-id field) per provider, asserted on the
// raw→normalized probe pairs (§6.E, §9). Includes: the malformed-OpenAI-
// arguments lead-not-crash case, the Gemini absent-id synthesis branch, the
// OpenAI Responses call_id variant, and Gemini's text+functionCall single turn.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, payloadsOf, TEST_KEYS } from "./helpers.ts";
import { makeFakeFetch, providerHappyRoutes } from "../src/testkit/fakefetch.ts";
import {
  openaiResponsesFunctionCallItem, openaiWeatherResponse, weatherTask,
} from "../src/testkit/goldens.ts";
import { normalizeResponsesToolCall } from "../src/adapters/openaiResponses.ts";
import { GEMINI_SYNTH_ID_PREFIX } from "../src/adapters/gemini.ts";
import { ProbeBus } from "../src/probe/bus.ts";
import { buildCatalog } from "../src/probe/catalog.ts";

test("TRAP 1+2 anthropic: input already an OBJECT (wasString:false, no double-parse); id from `id`, toolu_ prefix", async () => {
  const cell = makeTestCell();
  const r = await cell.adapters.anthropic.chat({
    apiKey: TEST_KEYS.anthropic, model: "claude-sonnet-5",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const norm = payloadOf(cell, "adapter.anthropic.normalize.toolCall.args.normalized");
  assert.equal(norm.wasString, false);
  assert.deepEqual(norm.args, { location: "Paris" });
  const idRaw = payloadOf(cell, "adapter.anthropic.normalize.toolCall.id.raw");
  assert.deepEqual(idRaw, { from: "id", value: "toolu_01A8fGx" });
  assert.deepEqual(r.toolCalls[0], { id: "toolu_01A8fGx", name: "get_weather", args: { location: "Paris" } });
  assert.equal(r.stopReason, "tool_calls");
});

test("TRAP 1+2 openai: arguments is a JSON STRING (wasString:true, parsedOk:true → object); id from `id`, call_ prefix", async () => {
  const cell = makeTestCell();
  const r = await cell.adapters.openai.chat({
    apiKey: TEST_KEYS.openai, model: "gpt-5.6",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const raw = payloadOf(cell, "adapter.openai.normalize.toolCall.args.raw");
  assert.equal(typeof raw.arguments, "string", "the native form really is a string");
  const norm = payloadOf(cell, "adapter.openai.normalize.toolCall.args.normalized");
  assert.equal(norm.wasString, true);
  assert.equal(norm.parsedOk, true);
  assert.deepEqual(norm.args, { location: "Paris" });
  const idRaw = payloadOf(cell, "adapter.openai.normalize.toolCall.id.raw");
  assert.deepEqual(idRaw, { from: "id", value: "call_9f2GOLD" });
  assert.deepEqual(r.toolCalls[0].args, { location: "Paris" });
  assert.equal(typeof r.toolCalls[0].args, "object");
});

test("TRAP 1 openai malformed arguments: parsedOk:false surfaces as a LEAD, not a crash", async () => {
  const broken = structuredClone(openaiWeatherResponse);
  (broken.choices[0].message.tool_calls[0].function as any).arguments = "{ definitely not json";
  const routes = providerHappyRoutes().filter((r) =>
    !r.test(new URL("https://api.openai.com/v1/chat/completions"), { method: "POST", body: "{}" }));
  routes.push({
    test: (u, i) => u.hostname === "api.openai.com" && u.pathname === "/v1/chat/completions" && i.method === "POST",
    respond: () => ({ status: 200, body: broken }),
  });
  const cell = makeTestCell({ fetchImpl: makeFakeFetch(routes) });

  const r = await cell.adapters.openai.chat({
    apiKey: TEST_KEYS.openai, model: "gpt-5.6",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const norm = payloadOf(cell, "adapter.openai.normalize.toolCall.args.normalized");
  assert.equal(norm.wasString, true);
  assert.equal(norm.parsedOk, false, "the failure is a visible lead");
  assert.deepEqual(norm.args, {});
  assert.deepEqual(r.toolCalls[0].args, {}, "still an object — TRAP 1 convention held even on garbage");
  assert.ok(cell.bus.getLogs().some((l) => l.includes("malformed arguments")), "and it hit the log stream");
});

test("TRAP 1+2 gemini (Gemini-3 style): args already an OBJECT; real id carried; NO synthesis branch", async () => {
  const cell = makeTestCell();
  const r = await cell.adapters.gemini.chat({
    apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const norm = payloadOf(cell, "adapter.gemini.normalize.toolCall.args.normalized");
  assert.equal(norm.wasString, false);
  assert.deepEqual(norm.args, { location: "Paris" });
  assert.deepEqual(payloadOf(cell, "adapter.gemini.normalize.toolCall.id.raw"), { from: "id", value: "8f2b1a3c" });
  assert.equal(r.toolCalls[0].id, "8f2b1a3c");
  assert.equal(cell.bus.find("adapter.gemini.normalize.toolCall.id.synthesized").length, 0);
});

test("TRAP 2 gemini (2.5 style): absent id takes the SYNTHESIZE branch with reason + name/order mapping", async () => {
  const cell = makeTestCell({ fetchImpl: makeFakeFetch(providerHappyRoutes({ geminiVariant: "noId" })) });
  const r = await cell.adapters.gemini.chat({
    apiKey: TEST_KEYS.gemini, model: "gemini-2.5-pro",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  assert.deepEqual(payloadOf(cell, "adapter.gemini.normalize.toolCall.id.raw"), { from: "id", value: null });
  const synth = payloadOf(cell, "adapter.gemini.normalize.toolCall.id.synthesized");
  assert.equal(synth.reason, "id absent on 2.5");
  assert.equal(synth.mappedBy, "name/order");
  assert.ok(synth.synthId.startsWith(GEMINI_SYNTH_ID_PREFIX));
  assert.ok(r.toolCalls[0].id.startsWith(GEMINI_SYNTH_ID_PREFIX));
});

test("TRAP 2 openai Responses (stubbed branch): id comes from `call_id`, not `id`", () => {
  const bus = new ProbeBus(buildCatalog());
  const call = normalizeResponsesToolCall(bus, openaiResponsesFunctionCallItem);
  const idRaw = bus.last("adapter.openai.normalize.toolCall.id.raw")!.payload as any;
  assert.deepEqual(idRaw, { from: "call_id", value: "call_resp_GOLD" });
  assert.equal(call.id, "call_resp_GOLD", "the item-level `id` (fc_item_GOLD) is NOT the echoable id");
  assert.deepEqual(call.args, { location: "Paris" });
});

test("gemini single turn with BOTH text and functionCall: textAndCall lead + both populated in ChatResult", async () => {
  const cell = makeTestCell();
  const r = await cell.adapters.gemini.chat({
    apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  assert.deepEqual(payloadOf(cell, "adapter.gemini.normalize.textAndCall"), { hasText: true, hasFunctionCall: true });
  assert.ok(r.text.length > 0, "ChatResult.text non-empty");
  assert.equal(r.toolCalls.length, 1, "AND toolCalls non-empty");
  assert.equal(r.stopReason, "tool_calls", "stop derived from functionCall presence, not just finishReason STOP");
});

test("envelopePath leads: each provider's normalizer walked its own (different) tree path", async () => {
  const cell = makeTestCell();
  await cell.adapters.anthropic.chat({ apiKey: TEST_KEYS.anthropic, model: "claude-sonnet-5", messages: weatherTask.messages, tools: weatherTask.tools });
  await cell.adapters.openai.chat({ apiKey: TEST_KEYS.openai, model: "gpt-5.6", messages: weatherTask.messages, tools: weatherTask.tools });
  await cell.adapters.gemini.chat({ apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash", messages: weatherTask.messages, tools: weatherTask.tools });
  const a = payloadOf(cell, "adapter.anthropic.normalize.envelopePath");
  const o = payloadOf(cell, "adapter.openai.normalize.envelopePath");
  const g = payloadOf(cell, "adapter.gemini.normalize.envelopePath");
  assert.match(a.toolCallPath, /content\[\]/);
  assert.match(o.toolCallPath, /choices\[0\]\.message\.tool_calls/);
  assert.match(g.toolCallPath, /candidates\[0\]\.content\.parts/);
  for (const p of [a, o, g]) {
    assert.equal(p.toolCallsFound, 1, "the path actually FOUND the tool call — a wrong path silently yields zero");
    assert.equal(p.usageFound, true);
  }
});
