// ============================================================================
// H3 pre-GitHub remediation (2026-08-16): POST /ask body-size cap and
// mid-body socket-error resilience.  Before H3, a mid-body reset crashed
// the key-holding server (no req.on("error")) and an oversized body was
// buffered without bound.  Both paths are now typed refusals; the server
// stays up either way.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createAiServer } from "../server.ts";
import { ASK_BODY_MAX_BYTES } from "../server/askroute.ts";
import type { AiServerHandle } from "../server.ts";
import { TEST_MASTER_SECRET, startFixtureHub } from "./p3.server.fixtures.ts";


test("H3 body cap: a POST /ask body over ASK_BODY_MAX_BYTES is refused 413 ai-body-too-large", async () => {
  const hub = await startFixtureHub();
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({
      port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET,
    });
    // 1 MiB + 1 KiB of padding — the cap MUST refuse before JSON.parse ever sees it.
    const oversized = JSON.stringify({
      question: "q", padding: "x".repeat(ASK_BODY_MAX_BYTES + 1024),
    });
    const r = await fetch(`http://127.0.0.1:${ai.port}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversized,
    });
    const body = await r.json() as { failureClass?: string; detail?: string };
    assert.equal(r.status, 413, JSON.stringify(body));
    assert.equal(body.failureClass, "ai-body-too-large");
    assert.match(String(body.detail),
      new RegExp(String(ASK_BODY_MAX_BYTES)));

    // the server stayed alive — a follow-up ask on the SAME port succeeds
    const follow = await fetch(`http://127.0.0.1:${ai.port}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Which declarations are unused?" }),
    });
    assert.equal(follow.status, 200,
      "H3: cap refusal must not brick the ai-server");
  } finally {
    await ai?.close();
    await hub.close();
  }
});


test("H3 mid-body reset: a client that resets mid-body no longer crashes the ai-server", async () => {
  const hub = await startFixtureHub();
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({
      port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET,
    });

    // Open a raw socket, send headers + PARTIAL body, then destroy the
    // socket before the body completes.  Prior to H3, the server's
    // uncaught 'error' handler crashed the process; now the request
    // handler treats it as a typed ai-body-error and stays alive.
    await new Promise<void>((resolve, reject) => {
      const req = http.request({
        hostname: "127.0.0.1", port: ai!.port, method: "POST", path: "/ask",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "10000",
        },
      }, () => { /* we do not wait for a response */ });
      req.on("error", () => { /* peer close is expected */ });
      req.write("{\"question\":\"", () => {
        // partial body written; destroy the socket to simulate the reset.
        req.destroy(new Error("simulated mid-body client reset"));
        setTimeout(resolve, 100);
      });
      setTimeout(reject, 3000, new Error("reset simulation timed out"));
    });

    // the server MUST still respond to a fresh, well-formed ask
    const follow = await fetch(`http://127.0.0.1:${ai.port}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Which declarations are unused?" }),
    });
    assert.equal(follow.status, 200,
      "H3: a mid-body reset must not crash the key-holding server");
    const j = await follow.json() as { ok?: boolean };
    assert.equal(j.ok, true);
  } finally {
    await ai?.close();
    await hub.close();
  }
});
