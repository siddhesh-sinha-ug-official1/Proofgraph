// ============================================================================
// P3 — ai/server.ts connector test: key-custody negative controls + /health
// (node:test, zero new deps). Split from test/p3.server.test.ts (SUB200
// restructure; fixtures in p3.server.fixtures.ts, assertions verbatim) —
// including an end-to-end firing of the server's response gate (guard 2).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { createAiServer, fakeAnthropicRoutes, FAKE_TRANSPORT_API_KEY } from "../server.ts";
import type { AiServerHandle } from "../server.ts";
import {
  MAIN_ID, TEST_MASTER_SECRET, UNUSED_ID, makeEnvelope, post, startFixtureHub,
} from "./p3.server.fixtures.ts";

// ---------------------------------------------------------------------------
// 4. NEGATIVE CONTROLS — both key-custody guards fire on this path
// ---------------------------------------------------------------------------

test("P3 ai server guard 1 (outlet scrub): api key planted in graph data is redacted, never served raw", async () => {
  const hub = await startFixtureHub();
  // plant the API KEY as a node name: listUnused would echo it into the tool
  // result -> the outlet's activeSecrets scrub must redact it.
  hub.setEnvelope(makeEnvelope(`leak-${FAKE_TRANSPORT_API_KEY}`));
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({
      port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET,
    });
    const r = await post(ai.port, "/ask", { question: "what is unused?" });
    assert.equal(r.status, 200, r.text);
    assert.ok(!r.text.includes(FAKE_TRANSPORT_API_KEY),
      "guard 1: the raw key never reaches the response bytes");
    assert.ok(r.text.includes("REDACTED-BY-OUTLET"),
      `guard 1 fired VISIBLY (loud redaction marker): ${r.json.answer}`);
  } finally {
    await ai?.close();
    await hub.close();
  }
});

test("P3 ai server guard 2 (response gate): masterSecret in a would-be response is refused as key-leak", async () => {
  const hub = await startFixtureHub();
  // plant the MASTER SECRET as a node name: the outlet does NOT know the vault
  // secret (only the api key is in activeSecrets), so the answer would carry
  // it — the SERVER's response gate must refuse the whole payload, typed.
  hub.setEnvelope(makeEnvelope(`leak-${TEST_MASTER_SECRET}`));
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({
      port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET,
    });
    const r = await post(ai.port, "/ask", { question: "what is unused?" });
    assert.equal(r.status, 500, r.text);
    assert.equal(r.json.failureClass, "key-leak");
    assert.ok(!r.text.includes(TEST_MASTER_SECRET),
      "the refusal itself must not carry the secret");
  } finally {
    await ai?.close();
    await hub.close();
  }
});

// ---------------------------------------------------------------------------
// 5. /health carries custody note, never secrets; fake routes stay wire-honest
// ---------------------------------------------------------------------------

test("P3 ai server: /health is typed and secret-free; fake transport composes ONLY from tool_result bytes", async () => {
  const hub = await startFixtureHub();
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({
      port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET,
    });
    const resp = await fetch(`http://127.0.0.1:${ai.port}/health`);
    const text = await resp.text();
    const health = JSON.parse(text);
    assert.equal(resp.status, 200);
    assert.equal(health.ok, true);
    assert.equal(health.transport, "fake");
    assert.ok(!text.includes(TEST_MASTER_SECRET) && !text.includes(FAKE_TRANSPORT_API_KEY));

    // wire-honesty of the fake model: continuation text derives from the
    // tool_result block bytes, nothing else (unit-level, route pair direct).
    const routes = fakeAnthropicRoutes();
    const cont = routes[0].respond(new URL("https://api.anthropic.com/v1/messages"), {
      method: "POST",
      body: JSON.stringify({
        model: "m", messages: [
          { role: "user", content: "q" },
          {
            role: "user", content: [{
              type: "tool_result", tool_use_id: "toolu_x",
              content: JSON.stringify({ unused: [{ id: UNUSED_ID, name: "x", kind: "function" }], roots: [MAIN_ID] }),
            }],
          },
        ],
      }),
    } as RequestInit, 0);
    const textBlock = (cont.body as any).content[0].text as string;
    assert.ok(textBlock.includes(UNUSED_ID), "fake continuation quotes the tool result's real id");
    assert.ok(textBlock.includes("FAKE-transport"), "fake continuation labels itself");
  } finally {
    await ai?.close();
    await hub.close();
  }
});
