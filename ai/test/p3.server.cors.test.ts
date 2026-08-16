// ============================================================================
// P3 ai/server connector test — the browser-face CORS/CSRF allowlist (S2,
// pre-GitHub round). node:test, zero new deps.
//
// This server holds the api key + vault masterSecret. The old wildcard ACAO
// let any website read /ask and drive the key-holding wall. The fix: a
// loopback origin allowlist. Proven both directions:
//   * an ALLOWED loopback origin -> 200 + Access-Control-Allow-Origin echoes it;
//   * a FOREIGN origin -> POST /ask refused 403 cross-origin-denied (the wall
//     is never driven) and no ACAO is echoed.
//
// Origin is a forbidden request header for undici's fetch(), so these tests
// drive the server with node:http directly to send the header for real.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createAiServer } from "../server.ts";
import type { AiServerHandle } from "../server.ts";
import { TEST_MASTER_SECRET, startFixtureHub } from "./p3.server.fixtures.ts";

const ALLOWED_ORIGIN = "http://localhost:5199";      // the vite human face
const FOREIGN_ORIGIN = "https://evil.example.com";   // a website the user visits

interface RawResp { status: number; headers: http.IncomingHttpHeaders; text: string; json: any }

function request(port: number, method: string, path: string,
                 opts: { origin?: string; body?: unknown } = {}): Promise<RawResp> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    let data: string | undefined;
    if (opts.body !== undefined) {
      data = JSON.stringify(opts.body);
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(data));
    }
    if (opts.origin !== undefined) headers["Origin"] = opts.origin;
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers }, (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c) => { text += c; });
        res.on("end", () => {
          let json: any = null;
          try { json = text ? JSON.parse(text) : null; } catch { /* refusal */ }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
        });
      });
    req.on("error", reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}

test("P3 ai server S2: an allowed loopback origin gets 200 + ACAO echoing the exact origin (never *)", async () => {
  const hub = await startFixtureHub();
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({ port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET });
    const r = await request(ai.port, "GET", "/health", { origin: ALLOWED_ORIGIN });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.headers["access-control-allow-origin"], ALLOWED_ORIGIN);
    assert.equal(r.headers["vary"], "Origin");
    // an ephemeral loopback port (the acceptance UI runner) is allowed too
    const eph = await request(ai.port, "GET", "/health", { origin: "http://localhost:54321" });
    assert.equal(eph.headers["access-control-allow-origin"], "http://localhost:54321");
  } finally {
    await ai?.close();
    await hub.close();
  }
});

test("P3 ai server S2: a foreign origin POST /ask is refused 403 cross-origin-denied, wall never driven, no ACAO", async () => {
  const hub = await startFixtureHub();
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({ port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET });
    const r = await request(ai.port, "POST", "/ask",
      { origin: FOREIGN_ORIGIN, body: { question: "what is unused?" } });
    assert.equal(r.status, 403, r.text);
    assert.equal(r.json.failureClass, "cross-origin-denied");
    assert.equal(r.headers["access-control-allow-origin"], undefined,
      "a foreign origin must NOT receive an ACAO echo");
  } finally {
    await ai?.close();
    await hub.close();
  }
});

test("P3 ai server S2: no-Origin (curl/runners) POST /ask still works — 200, unaffected by the allowlist", async () => {
  const hub = await startFixtureHub();
  let ai: AiServerHandle | null = null;
  try {
    ai = await createAiServer({ port: 0, hubBase: hub.base, transport: "fake", masterSecret: TEST_MASTER_SECRET });
    const r = await request(ai.port, "POST", "/ask", { body: { question: "what is unused?" } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.ok, true);
    // no Origin was sent -> nothing to allow -> no ACAO header (and no refusal)
    assert.equal(r.headers["access-control-allow-origin"], undefined);
  } finally {
    await ai?.close();
    await hub.close();
  }
});
