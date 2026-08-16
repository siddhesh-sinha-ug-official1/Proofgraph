// Operating Contract rule 4: the connectors that die are the elementary-but-
// fiddly ones. Every one-line wire gets a test: the anthropic-version header,
// the non-null max_tokens, the omitted OpenAI-Organization/Project, the
// x-goog-api-key-not-?key= choice, and the host allowlist itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, TEST_KEYS } from "./helpers.ts";
import { weatherTask } from "../src/testkit/goldens.ts";
import { sendRequest, defaultRetryPolicy, HOST_ALLOWLIST } from "../src/adapters/shared.ts";
import { AdapterFailure } from "../src/interface.ts";
import { ProbeBus } from "../src/probe/bus.ts";
import { buildCatalog } from "../src/probe/catalog.ts";

test("anthropic: anthropic-version 2023-06-01 header AND non-null max_tokens on the chat wire", async () => {
  const cell = makeTestCell();
  await cell.adapters.anthropic.chat({
    apiKey: TEST_KEYS.anthropic, model: "claude-sonnet-5",
    messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const req = payloadOf(cell, "adapter.anthropic.chat.request");
  assert.equal(req.headers["anthropic-version"], "2023-06-01", "the classic dropped-wire killer");
  assert.notEqual(req.body.max_tokens, null);
  assert.notEqual(req.body.max_tokens, undefined);
  assert.equal(req.body.max_tokens, 1024);

  const decision = payloadOf(cell, "adapter.anthropic.chat.maxTokens");
  assert.equal(decision.required, true);
  assert.equal(decision.applied, 1024);
  assert.equal(decision.provided, null);
  assert.ok(cell.bus.getLogs().some((l) => l.includes("max_tokens defaulted")),
    "the applied default hit the visible log stream — no silent cap");
});

test("anthropic: caller-provided maxTokens is honored, not overridden", async () => {
  const cell = makeTestCell();
  await cell.adapters.anthropic.chat({
    apiKey: TEST_KEYS.anthropic, model: "claude-sonnet-5",
    messages: weatherTask.messages, maxTokens: 333,
  });
  assert.equal(payloadOf(cell, "adapter.anthropic.chat.request").body.max_tokens, 333);
  assert.equal(payloadOf(cell, "adapter.anthropic.chat.maxTokens").provided, 333);
});

test("openai: OpenAI-Organization and OpenAI-Project are OMITTED for BYOK", async () => {
  const cell = makeTestCell();
  await cell.adapters.openai.chat({
    apiKey: TEST_KEYS.openai, model: "gpt-5.6", messages: weatherTask.messages,
  });
  const req = payloadOf(cell, "adapter.openai.chat.request");
  const headerNames = Object.keys(req.headers).map((h) => h.toLowerCase());
  assert.ok(!headerNames.includes("openai-organization"));
  assert.ok(!headerNames.includes("openai-project"));
  const auth = payloadOf(cell, "adapter.openai.chat.authHeader");
  assert.deepEqual(auth.omittedForByok, ["OpenAI-Organization", "OpenAI-Project"]);
  assert.equal(auth.Authorization.scheme, "Bearer");
});

test("openai: endpointChoice records chat_completions vs responses as NOT wire-compatible", async () => {
  const cell = makeTestCell();
  await cell.adapters.openai.chat({
    apiKey: TEST_KEYS.openai, model: "gpt-5.6", messages: weatherTask.messages,
  });
  const choice = payloadOf(cell, "adapter.openai.chat.endpointChoice");
  assert.equal(choice.chosen, "chat_completions");
  assert.equal(choice.alt, "responses");
  assert.equal(choice.wireCompatible, false);
});

test("gemini: key travels in the x-goog-api-key HEADER; the URL has no key= param; transportChoice recorded", async () => {
  const cell = makeTestCell();
  await cell.adapters.gemini.chat({
    apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash", messages: weatherTask.messages,
  });
  const req = payloadOf(cell, "adapter.gemini.chat.request");
  assert.equal(req.headers["x-goog-api-key"].present, true);
  const url = new URL(req.url);
  assert.equal(url.searchParams.has("key"), false, "never ?key= — keeps the key out of URLs/logs");
  assert.ok(!req.url.includes(TEST_KEYS.gemini));

  const transport = payloadOf(cell, "adapter.gemini.chat.transportChoice");
  assert.equal(transport.chosen, "native_generateContent");
  assert.equal(transport.alt, "openai_compat_base_url");

  const scan = cell.runSecretLeakScan();
  assert.equal(scan.keyInUrl, false);
});

test("host allowlist: a non-provider host is REFUSED before any bytes leave (the exfil-blocking branch)", async () => {
  const bus = new ProbeBus(buildCatalog());
  let fetchCalled = false;
  await assert.rejects(
    sendRequest({
      bus, provider: "anthropic", stage: "adapter.anthropic.chat.send",
      method: "POST", url: "https://evil.example.com/v1/messages",
      headers: {}, redactedHeaders: {},
      probeIds: {
        hostAllowlist: "adapter.anthropic.chat.hostAllowlist",
        request: "adapter.anthropic.chat.request",
        response: "adapter.anthropic.chat.response.raw",
        retryDecision: "adapter.anthropic.error.retryDecision",
        requestId: "adapter.anthropic.error.requestId",
      },
      mapError: () => ({ kind: "unknown", message: "unreachable" }),
      runtime: {
        fetchImpl: (async () => { fetchCalled = true; return new Response("{}"); }) as typeof fetch,
        retry: defaultRetryPolicy(), now: () => new Date(0),
      },
      causeId: null,
    }),
    (err: unknown) => err instanceof AdapterFailure && /allowlist/.test(err.adapterError.message));
  assert.equal(fetchCalled, false, "the request never left the cell");
  const decision = bus.last("adapter.anthropic.chat.hostAllowlist")!.payload as any;
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.allowlist, [...HOST_ALLOWLIST]);
  assert.equal(bus.find("adapter.anthropic.chat.request").length, 0, "no request probe — nothing was sent");
});

test("host allowlist decision fires allowed:true on every legitimate send", async () => {
  const cell = makeTestCell();
  await cell.adapters.anthropic.chat({ apiKey: TEST_KEYS.anthropic, model: "claude-sonnet-5", messages: weatherTask.messages });
  const d = payloadOf(cell, "adapter.anthropic.chat.hostAllowlist");
  assert.deepEqual(d, {
    host: "api.anthropic.com", allowed: true,
    allowlist: ["api.anthropic.com", "api.openai.com", "generativelanguage.googleapis.com"],
  });
});

test("rate-limit headers surfaced per provider (and the Gemini dynamic-limits note)", async () => {
  const cell = makeTestCell();
  await cell.adapters.anthropic.chat({ apiKey: TEST_KEYS.anthropic, model: "claude-sonnet-5", messages: weatherTask.messages });
  await cell.adapters.gemini.chat({ apiKey: TEST_KEYS.gemini, model: "gemini-3.5-flash", messages: weatherTask.messages });
  const a = payloadOf(cell, "adapter.anthropic.chat.rateLimitHeaders");
  assert.ok(Object.keys(a.headers).some((h) => h.startsWith("anthropic-ratelimit-")));
  const g = payloadOf(cell, "adapter.gemini.chat.rateLimitHeaders");
  assert.equal(g.note, "served dynamically; lean on 429+backoff");
});
