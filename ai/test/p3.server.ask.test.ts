// ============================================================================
// P3 — ai/server.ts connector test: the /ask seam (node:test, zero new deps).
// Split from test/p3.server.test.ts (SUB200 restructure; fixtures in
// p3.server.fixtures.ts, assertions verbatim): real unused node id in the
// answer, tool calls surfaced (WHICH graph facts the answer used), and typed
// refusals for every failure path.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { createAiServer, FAKE_TRANSPORT_API_KEY } from "../server.ts";
import type { AiServerHandle } from "../server.ts";
import {
  LEAD_ID, MAIN_ID, TEST_MASTER_SECRET, UNUSED_ID, post, startFixtureHub,
} from "./p3.server.fixtures.ts";

// ---------------------------------------------------------------------------
// 1. golden ask: real unused node id + tool calls surfaced
// ---------------------------------------------------------------------------

test("P3 ai server: /ask answers with the REAL unused node id and surfaces the tool calls it used", async () => {
  const hub = await startFixtureHub();
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({
      port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET,
    });

    const r = await post(ai.port, "/ask", { question: "Which declarations are unused?" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.transport, "fake");
    assert.ok(r.json.answer.includes(UNUSED_ID),
      `answer must carry the real unused node id ${UNUSED_ID}: ${r.json.answer}`);
    assert.ok(r.json.answer.includes("FAKE-transport"),
      "the FAKE transport labels itself honestly in the answer");
    assert.equal(r.json.toolRounds, 1);
    assert.equal(r.json.toolCalls.length, 1);
    assert.equal(r.json.toolCalls[0].name, "listUnused");
    assert.ok(String(r.json.toolCalls[0].output).includes(UNUSED_ID),
      "the surfaced tool call output carries the graph fact the answer used");
    assert.equal(r.json.toolCalls[0].isError, false);
    assert.deepEqual(r.json.bounds, { maxToolRounds: 1, toolOutputMaxBytes: 16384 });
    assert.deepEqual(r.json.graphFacts.roots, [MAIN_ID]);
    assert.equal(r.json.graphFacts.unusedProvided, 1);
    assert.equal(r.json.graphFacts.leads, 1);

    // key custody: neither the fake api key nor the masterSecret in the bytes.
    assert.ok(!r.text.includes(FAKE_TRANSPORT_API_KEY), "api key must never serialize into a response");
    assert.ok(!r.text.includes(TEST_MASTER_SECRET), "masterSecret must never serialize into a response");
  } finally {
    await ai?.close();
    await hub.close();
  }
});

// ---------------------------------------------------------------------------
// 2. question routing: a leads question uses listLeads (facts still real)
// ---------------------------------------------------------------------------

test("P3 ai server: a leads question routes to listLeads and cites the real lead id", async () => {
  const hub = await startFixtureHub();
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({
      port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET,
    });
    const r = await post(ai.port, "/ask", { question: "What unresolved leads does the graph carry?" });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.toolCalls[0].name, "listLeads");
    assert.ok(r.json.answer.includes(LEAD_ID), `answer cites the real lead id: ${r.json.answer}`);
  } finally {
    await ai?.close();
    await hub.close();
  }
});

// ---------------------------------------------------------------------------
// 3. typed refusals: bad request / unknown endpoint / hub down / hub refusal
// ---------------------------------------------------------------------------

test("P3 ai server: refusals are typed, hub classes pass through verbatim", async () => {
  const hub = await startFixtureHub();
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({
      port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET,
    });

    const bad = await post(ai.port, "/ask", "{not json");
    assert.equal(bad.status, 400);
    assert.equal(bad.json.failureClass, "ai-bad-request");

    const noQ = await post(ai.port, "/ask", {});
    assert.equal(noQ.status, 400);
    assert.equal(noQ.json.failureClass, "ai-bad-request");

    const nope = await fetch(`http://127.0.0.1:${ai.port}/nope`);
    assert.equal(nope.status, 404);
    assert.equal((await nope.json() as any).failureClass, "unknown-endpoint");

    // hub /query refusal (roots-undeclared) -> honest no-claim, NOT an error:
    hub.setQueryRefusal({ status: 409, failureClass: "roots-undeclared" });
    const noClaim = await post(ai.port, "/ask", { question: "what is unused?" });
    assert.equal(noClaim.status, 200, noClaim.text);
    assert.ok(String(noClaim.json.answer).includes("no reachability claim"),
      `no unused provenance -> the answer claims NOTHING: ${noClaim.json.answer}`);
    assert.equal(noClaim.json.graphFacts.unusedProvided, null);
    assert.match(String(noClaim.json.graphFacts.provenanceSource), /roots-undeclared/);
    hub.setQueryRefusal(null);
  } finally {
    await ai?.close();
    await hub.close();
  }

  // hub fully down -> 503 hub-unreachable (banner class, not a blank).
  const ai2 = await createAiServer({
    port: 0, hubBase: "http://127.0.0.1:9", transport: "fake", masterSecret: TEST_MASTER_SECRET,
  });
  try {
    const down = await post(ai2.port, "/ask", { question: "anything" });
    assert.equal(down.status, 503);
    assert.equal(down.json.failureClass, "hub-unreachable");
  } finally {
    await ai2.close();
  }
});
