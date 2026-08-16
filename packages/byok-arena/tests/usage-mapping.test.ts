// §9 usage mapping: golden usage objects from all FOUR sources (Anthropic,
// OpenAI-Chat, OpenAI-Responses, Gemini) → the one neutral Usage, including
// reasoningTokens and cachedInputTokens; plus the OpenAI stream guard.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, TEST_KEYS } from "./helpers.ts";
import { weatherTask, openaiResponsesUsage } from "../src/testkit/goldens.ts";
import { normalizeResponsesUsage } from "../src/adapters/openaiResponses.ts";
import { ProbeBus } from "../src/probe/bus.ts";
import { buildCatalog } from "../src/probe/catalog.ts";

test("anthropic usage: input_tokens/output_tokens (+cache_read) → neutral Usage", async () => {
  const cell = makeTestCell();
  const r = await cell.adapters.anthropic.chat({
    apiKey: TEST_KEYS.anthropic, model: "claude-sonnet-5",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const raw = payloadOf(cell, "adapter.anthropic.normalize.usage.raw");
  assert.equal(raw.input_tokens, 420, "the native field names really differ per provider");
  assert.deepEqual(r.usage, { inputTokens: 420, outputTokens: 58, cachedInputTokens: 0 });
  assert.deepEqual(payloadOf(cell, "adapter.anthropic.normalize.usage.normalized"), r.usage);
});

test("openai Chat usage: prompt_/completion_tokens (+details) → neutral Usage incl. reasoning + cached", async () => {
  const cell = makeTestCell();
  const r = await cell.adapters.openai.chat({
    apiKey: TEST_KEYS.openai, model: "gpt-5.6",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const raw = payloadOf(cell, "adapter.openai.normalize.usage.raw");
  assert.equal(raw.prompt_tokens, 410);
  assert.deepEqual(r.usage, { inputTokens: 410, outputTokens: 51, reasoningTokens: 0, cachedInputTokens: 0 });
});

test("openai Responses usage (different field names than Chat, SAME provider) → neutral Usage", () => {
  const bus = new ProbeBus(buildCatalog());
  const usage = normalizeResponsesUsage(bus, openaiResponsesUsage);
  assert.deepEqual(usage, { inputTokens: 400, outputTokens: 60, reasoningTokens: 12, cachedInputTokens: 32 });
  const raw = bus.last("adapter.openai.normalize.usage.raw")!.payload as any;
  assert.equal(raw.input_tokens, 400, "Responses uses input_tokens where Chat uses prompt_tokens");
  assert.equal(raw.input_tokens_details.cached_tokens, 32);
});

test("gemini usage: usageMetadata promptTokenCount/candidatesTokenCount/thoughtsTokenCount → neutral Usage", async () => {
  const cell = makeTestCell();
  const r = await cell.adapters.gemini.chat({
    apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const raw = payloadOf(cell, "adapter.gemini.normalize.usage.raw");
  assert.equal(raw.promptTokenCount, 400);
  assert.equal(raw.thoughtsTokenCount, 12);
  assert.deepEqual(r.usage, { inputTokens: 400, outputTokens: 40, reasoningTokens: 12 });
  assert.equal(r.usage.cachedInputTokens, undefined, "absent native field stays absent — not faked to 0");
});

test("openai stream guard: requesting stream fires usage.streamGuard (+ the logged stream deferral)", async () => {
  const cell = makeTestCell();
  await cell.adapters.openai.chat({
    apiKey: TEST_KEYS.openai, model: "gpt-5.6",
    messages: weatherTask.messages, stream: true,
  });
  const guard = payloadOf(cell, "adapter.openai.normalize.usage.streamGuard");
  assert.equal(guard.stream, true);
  assert.equal(guard.includeUsage, false);
  assert.match(guard.reason, /stream_options\.include_usage/);
  const deferred = payloadOf(cell, "adapter.openai.chat.streamDeferred");
  assert.deepEqual({ requested: deferred.requested, applied: deferred.applied }, { requested: true, applied: false });
  assert.ok(cell.bus.getLogs().some((l) => l.includes("stream requested but deferred")));
});

test("all three streamDeferred caps are logged, never silent", async () => {
  const cell = makeTestCell();
  await cell.adapters.anthropic.chat({ apiKey: TEST_KEYS.anthropic, model: "claude-sonnet-5", messages: weatherTask.messages, stream: true });
  await cell.adapters.gemini.chat({ apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash", messages: weatherTask.messages, stream: true });
  assert.ok(cell.bus.find("adapter.anthropic.chat.streamDeferred").length === 1);
  assert.ok(cell.bus.find("adapter.gemini.chat.streamDeferred").length === 1);
});
