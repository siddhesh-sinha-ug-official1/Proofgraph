// §6.G — the WHOLE error-mapping matrix, table-driven, per provider. The
// centerpiece: OpenAI 429 disambiguation on error.code (insufficient_quota
// stops, rate_limit_exceeded retries — same status, opposite action) and the
// Gemini RESOURCE_EXHAUSTED rate-vs-spend-cap persistence heuristic. Every
// retryDecision carries the caps (no silent caps).

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, payloadsOf, TEST_KEYS } from "./helpers.ts";
import { sequenceFetch } from "../src/testkit/fakefetch.ts";
import {
  anthropicAuthErrorBody, anthropicBillingErrorBody, anthropicOverloadedBody, anthropicRateLimitBody,
  anthropicWeatherResponse,
  geminiFailedPreconditionBody, geminiKeyInvalidBody, geminiResourceExhaustedBody, geminiUnavailableBody,
  openaiInsufficientQuotaBody, openaiInvalidKeyBody, openaiRateLimitBody, openaiServerErrorBody,
  weatherTask,
} from "../src/testkit/goldens.ts";
import { AdapterFailure } from "../src/interface.ts";
import type { Cell } from "../src/index.ts";

function chatOnce(cell: Cell, provider: "anthropic" | "openai" | "gemini") {
  const models = { anthropic: "claude-sonnet-5", openai: "gpt-5.6", gemini: "gemini-3.5-flash" };
  return cell.adapters[provider].chat({
    apiKey: TEST_KEYS[provider], model: models[provider], messages: weatherTask.messages,
  });
}

async function expectKind(cell: Cell, provider: "anthropic" | "openai" | "gemini", kind: string) {
  await assert.rejects(chatOnce(cell, provider),
    (err: unknown) => err instanceof AdapterFailure && err.adapterError.kind === kind,
    `expected AdapterFailure kind=${kind}`);
}

// ---- the matrix, one row per native failure --------------------------------

test("anthropic 401 authentication_error → invalid_key, stop", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 401, body: anthropicAuthErrorBody }]) });
  await expectKind(cell, "anthropic", "invalid_key");
  const rd = payloadsOf(cell, "adapter.anthropic.error.retryDecision");
  assert.equal(rd.length, 1);
  assert.equal(rd[0].willRetry, false);
  assert.deepEqual(rd[0].cap, { maxRetries: 2, maxBackoffMs: 4 }, "the cap is on the probe even when stopping");
});

test("anthropic 402 billing_error → quota_exhausted (the user's bill — stop, surface add-credit)", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 402, body: anthropicBillingErrorBody }]) });
  await expectKind(cell, "anthropic", "quota_exhausted");
});

test("anthropic 529 overloaded_error → overloaded, retried to the cap, caps logged", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 529, body: anthropicOverloadedBody }]) });
  await expectKind(cell, "anthropic", "overloaded");
  const rd = payloadsOf(cell, "adapter.anthropic.error.retryDecision");
  assert.equal(rd.length, 3, "initial attempt + maxRetries=2");
  assert.deepEqual(rd.map((d) => d.willRetry), [true, true, false]);
  assert.match(rd[2].reason, /retry cap reached/);
  assert.ok(cell.bus.getLogs().some((l) => l.includes("retry cap maxRetries=2")), "no silent caps — cap on the log stream");
});

test("anthropic 429 rate_limit_error → rate_limited with retry-after honored, spikeGuard fires, then SUCCEEDS on retry", async () => {
  const cell = makeTestCell({
    fetchImpl: sequenceFetch([
      { status: 429, body: anthropicRateLimitBody, headers: { "retry-after": "1" } },
      { status: 200, body: anthropicWeatherResponse },
    ]),
  });
  const r = await chatOnce(cell, "anthropic");
  assert.equal(r.toolCalls.length, 1, "the retry actually recovered the call");
  const rd = payloadsOf(cell, "adapter.anthropic.error.retryDecision");
  assert.equal(rd.length, 1);
  assert.equal(rd[0].willRetry, true);
  assert.equal(rd[0].retryAfterSec, 1);
  assert.equal(payloadOf(cell, "adapter.anthropic.error.spikeGuard").note.includes("acceleration"), true);
});

test("OPENAI 429 insufficient_quota → quota_exhausted, NON-retryable (exactly one attempt) — the critical BYOK subtlety", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 429, body: openaiInsufficientQuotaBody }]) });
  await expectKind(cell, "openai", "quota_exhausted");
  assert.equal(payloadsOf(cell, "adapter.openai.error.map").length, 1, "never retried");
  const dis = payloadOf(cell, "adapter.openai.error.quotaDisambig");
  assert.equal(dis.code, "insufficient_quota");
  assert.equal(dis.kind, "quota_exhausted");
  assert.match(dis.reason, /error\.code not status/);
});

test("OPENAI 429 rate_limit_exceeded → rate_limited, RETRIES — same status, opposite action", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 429, body: openaiRateLimitBody }]) });
  await expectKind(cell, "openai", "rate_limited");
  const rd = payloadsOf(cell, "adapter.openai.error.retryDecision");
  assert.equal(rd.length, 3, "retried to the cap — the disambiguation switched the branch");
  const dis = payloadsOf(cell, "adapter.openai.error.quotaDisambig");
  assert.ok(dis.every((d) => d.kind === "rate_limited" && d.code === "rate_limit_exceeded"));
});

test("openai 401 invalid_api_key → invalid_key", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 401, body: openaiInvalidKeyBody, headers: { "x-request-id": "req_oai_401" } }]) });
  await expectKind(cell, "openai", "invalid_key");
  assert.equal(payloadOf(cell, "adapter.openai.error.requestId").requestId, "req_oai_401",
    "x-request-id captured on every error for support");
});

test("openai 500 server_error → overloaded, retried", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 500, body: openaiServerErrorBody }]) });
  await expectKind(cell, "openai", "overloaded");
  assert.equal(payloadsOf(cell, "adapter.openai.error.retryDecision").length, 3);
});

test("gemini 400 API_KEY_INVALID → invalid_key (NOT bad_request — the details[].reason wins)", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 400, body: geminiKeyInvalidBody }]) });
  await expectKind(cell, "gemini", "invalid_key");
  const map = payloadOf(cell, "adapter.gemini.error.map");
  assert.deepEqual(map.raw.error.reasons, ["API_KEY_INVALID"]);
});

test("gemini 400 FAILED_PRECONDITION → quota_exhausted (billing not enabled)", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 400, body: geminiFailedPreconditionBody }]) });
  await expectKind(cell, "gemini", "quota_exhausted");
});

test("gemini 503 UNAVAILABLE → overloaded", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 503, body: geminiUnavailableBody }]) });
  await expectKind(cell, "gemini", "overloaded");
});

test("gemini PERSISTENT 429 RESOURCE_EXHAUSTED → escalates to quota_exhausted after the backoff cap (the disambiguation)", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 429, body: geminiResourceExhaustedBody }]) });
  await expectKind(cell, "gemini", "quota_exhausted");
  const dis = payloadsOf(cell, "adapter.gemini.error.quotaDisambig");
  assert.equal(dis.length, 3);
  assert.deepEqual(dis.map((d) => d.kind), ["rate_limited", "rate_limited", "quota_exhausted"],
    "transient → transient → persistent flips the branch");
  assert.deepEqual(dis.map((d) => d.branchNotTaken), ["quota_exhausted", "quota_exhausted", "rate_limited"]);
});

test("gemini TRANSIENT 429 that clears → rate_limited retry succeeds, never touches quota_exhausted", async () => {
  const cell = makeTestCell({
    fetchImpl: sequenceFetch([
      { status: 429, body: geminiResourceExhaustedBody },
      { status: 200, body: { candidates: [{ content: { role: "model", parts: [{ text: "hi" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, totalTokenCount: 4 } } },
    ]),
  });
  const r = await chatOnce(cell, "gemini");
  assert.equal(r.text, "hi");
  const dis = payloadsOf(cell, "adapter.gemini.error.quotaDisambig");
  assert.deepEqual(dis.map((d) => d.kind), ["rate_limited"]);
});

test("every error path also lands in dump().errors (caught-error probe surface)", async () => {
  const cell = makeTestCell({ fetchImpl: sequenceFetch([{ status: 401, body: openaiInvalidKeyBody }]) });
  await expectKind(cell, "openai", "invalid_key");
  const errors = cell.dump().bus.errors;
  assert.ok(errors.length >= 1);
  assert.match(errors[0].message, /invalid_key/);
});
