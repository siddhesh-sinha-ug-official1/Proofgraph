// §6.B validateKey per provider + the honest-ceiling gate (Operating Contract
// rule 7): a 200 from /models proves the key AUTHENTICATES, never that it can
// SPEND — valid ≠ green. A validated key that then hits insufficient_quota is
// surfaced as a distinct non-retryable state.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, payloadsOf, TEST_KEYS } from "./helpers.ts";
import { makeFakeFetch, providerHappyRoutes, sequenceFetch } from "../src/testkit/fakefetch.ts";
import { anthropicAuthErrorBody, openaiInsufficientQuotaBody, weatherTask } from "../src/testkit/goldens.ts";
import { AdapterFailure } from "../src/interface.ts";

test("anthropic validateKey: exact wire (x-api-key redacted + anthropic-version), models returned", async () => {
  const cell = makeTestCell();
  const res = await cell.adapters.anthropic.validateKey(TEST_KEYS.anthropic);
  assert.equal(res.valid, true);
  assert.deepEqual(res.models, ["claude-fable-5", "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5"]);

  const req = payloadOf(cell, "adapter.anthropic.validateKey.request");
  assert.equal(req.method, "GET");
  assert.equal(req.host, "api.anthropic.com");
  assert.equal(req.path, "/v1/models");
  assert.equal(req.headers["anthropic-version"], "2023-06-01");
  assert.equal(req.headers["x-api-key"].present, true);
  assert.equal(req.headers["x-api-key"].last4, TEST_KEYS.anthropic.slice(-4));
  assert.ok(!JSON.stringify(req).includes(TEST_KEYS.anthropic));

  const resp = payloadOf(cell, "adapter.anthropic.validateKey.response");
  assert.equal(resp.status, 200);
  assert.equal(resp.valid, true);
  assert.ok(resp.models.some((m: any) => m.id === "claude-sonnet-5" && m.capabilities !== undefined),
    "Anthropic response carries id + capabilities");
});

test("openai validateKey: Bearer wire, data[].id list", async () => {
  const cell = makeTestCell();
  const res = await cell.adapters.openai.validateKey(TEST_KEYS.openai);
  assert.equal(res.valid, true);
  assert.ok(res.models.includes("gpt-5.6"));

  const req = payloadOf(cell, "adapter.openai.validateKey.request");
  assert.equal(req.host, "api.openai.com");
  assert.equal(req.path, "/v1/models");
  assert.equal(req.headers["Authorization"].scheme, "Bearer");
  assert.equal(req.headers["Authorization"].token.last4, TEST_KEYS.openai.slice(-4));
});

test("gemini validateKey: x-goog-api-key header wire; models filtered on generateContent; token limits visible", async () => {
  const cell = makeTestCell();
  const res = await cell.adapters.gemini.validateKey(TEST_KEYS.gemini);
  assert.equal(res.valid, true);
  assert.deepEqual(res.models, ["gemini-2.5-pro", "gemini-3.5-flash"],
    "embedContent-only models filtered out; models/ prefix stripped");

  const req = payloadOf(cell, "adapter.gemini.validateKey.request");
  assert.equal(req.host, "generativelanguage.googleapis.com");
  assert.equal(req.path, "/v1beta/models");
  assert.equal(req.headers["x-goog-api-key"].present, true);
  assert.ok(!req.url.includes("key="), "key never in the URL");

  const resp = payloadOf(cell, "adapter.gemini.validateKey.response");
  assert.ok(resp.models.every((m: any) => Array.isArray(m.supportedGenerationMethods)));
  assert.ok(resp.models[0].inputTokenLimit > 0, "per-model token limits surfaced");
});

test("honest ceiling: EVERY provider's validateKey 200 reports spendable:'unknown', never billable", async () => {
  const cell = makeTestCell();
  await cell.adapters.anthropic.validateKey(TEST_KEYS.anthropic);
  await cell.adapters.openai.validateKey(TEST_KEYS.openai);
  await cell.adapters.gemini.validateKey(TEST_KEYS.gemini);
  for (const p of ["anthropic", "openai", "gemini"]) {
    const ceiling = payloadOf(cell, `adapter.${p}.validateKey.honestCeiling`);
    assert.equal(ceiling.authenticates, true);
    assert.equal(ceiling.spendable, "unknown", `${p}: valid ≠ spendable — never fake green`);
    assert.ok(!JSON.stringify(ceiling).includes('"spendable":true'));
    assert.match(ceiling.reason, /auth/i);
  }
});

test("bad key: validateKey returns {valid:false, error:{kind:'invalid_key'}} without throwing; ceiling says authenticates:false", async () => {
  const cell = makeTestCell({
    fetchImpl: sequenceFetch([{ status: 401, body: anthropicAuthErrorBody }]),
  });
  const res = await cell.adapters.anthropic.validateKey("sk-ant-bad-key-0000");
  assert.equal(res.valid, false);
  assert.deepEqual(res.models, []);
  assert.equal(res.error?.kind, "invalid_key");
  assert.equal(res.error?.requestId, "req_011GOLDERR");
  const ceiling = payloadOf(cell, "adapter.anthropic.validateKey.honestCeiling");
  assert.equal(ceiling.authenticates, false);
  assert.equal(ceiling.spendable, "unknown");
});

test("valid-then-broke: a key that validates but hits insufficient_quota on first real call surfaces as non-retryable quota_exhausted", async () => {
  // routes: models endpoint happy; chat endpoint always 429 insufficient_quota
  const routes = providerHappyRoutes().filter((r) =>
    !r.test(new URL("https://api.openai.com/v1/chat/completions"), { method: "POST", body: "{}" }));
  routes.push({
    test: (u, i) => u.hostname === "api.openai.com" && u.pathname === "/v1/chat/completions" && i.method === "POST",
    respond: () => ({ status: 429, body: openaiInsufficientQuotaBody }),
  });
  const cell = makeTestCell({ fetchImpl: makeFakeFetch(routes) });

  const v = await cell.adapters.openai.validateKey(TEST_KEYS.openai);
  assert.equal(v.valid, true, "the key authenticates…");

  await assert.rejects(
    cell.adapters.openai.chat({ apiKey: TEST_KEYS.openai, model: "gpt-5.6", messages: weatherTask.messages }),
    (err: unknown) => err instanceof AdapterFailure && err.adapterError.kind === "quota_exhausted",
    "…but cannot spend — a DISTINCT state, not a retry loop");

  const retryDecisions = payloadsOf(cell, "adapter.openai.error.retryDecision");
  assert.equal(retryDecisions.length, 1, "quota_exhausted never retries");
  assert.equal(retryDecisions[0].willRetry, false);
  assert.match(retryDecisions[0].reason, /non-retryable/);
});
