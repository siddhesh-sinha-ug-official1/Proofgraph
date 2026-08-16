// ============================================================================
// Round WC-W2: /ask body decode used `bodyText += chunk`, which stringified
// each chunk independently and produced U+FFFD when a multi-byte UTF-8
// codepoint straddled a chunk boundary.
//
// The observable is subtle end-to-end (JSON.parse succeeds on a body that
// contains U+FFFD chars, and the fake transport composes its answer from the
// tool result, not the question). So this test drives handleAsk DIRECTLY with
// a mock IncomingMessage that emits chunks split strictly inside a 4-byte
// UTF-8 sequence, and asserts the question the outlet receives is byte-clean
// (no U+FFFD) by tapping the wall's request wire — the same bytes the model
// would see if this were live.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";

import { handleAsk } from "../server/askroute.ts";
import { createByokWall } from "../../packages/byok-arena/src/wall.ts";
import type { AskRouteDeps } from "../server/askroute.ts";
import { TEST_MASTER_SECRET, makeEnvelope, MAIN_ID, UNUSED_ID } from "./p3.server.fixtures.ts";
import { fakeAnthropicRoutes } from "../server/fakemodel.ts";
import { makeFakeFetch } from "../../packages/byok-arena/src/testkit/fakefetch.ts";

const EMOJI = "\u{1F600}";      // 4-byte UTF-8: F0 9F 98 80

function counterClock(): () => bigint { let n = 0n; return () => (n += 1000n); }

function makeMockReq(chunks: Buffer[]): http.IncomingMessage {
  // Minimal EventEmitter that quacks like an IncomingMessage for the two
  // methods handleAsk actually uses: .on('data', cb) and .on('end', cb).
  const ee = new EventEmitter();
  // Fire chunks asynchronously so the handler wires up listeners first.
  setImmediate(() => {
    for (const c of chunks) ee.emit("data", c);
    ee.emit("end");
  });
  return ee as unknown as http.IncomingMessage;
}

async function drive(chunks: Buffer[]): Promise<{ status: number; body: any; questionSentToWall: string | null }> {
  // A hub-shaped fetch that returns the fixture envelope for /graph and a
  // roots+unused payload for /query — no real hub needed for a body-decode
  // regression.
  const envelope = makeEnvelope();
  const hubFetch: typeof fetch = async (input) => {
    const u = new URL(String(input));
    if (u.pathname === "/graph") {
      return new Response(JSON.stringify(envelope), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (u.pathname === "/query") {
      return new Response(JSON.stringify({ roots: [MAIN_ID], unused: [UNUSED_ID] }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("nope", { status: 404 });
  };

  const wall = createByokWall({
    masterSecret: TEST_MASTER_SECRET,
    fetchImpl: makeFakeFetch(fakeAnthropicRoutes()),
    retry: { maxRetries: 0, baseBackoffMs: 1, maxBackoffMs: 2, sleep: async () => {} },
    now: () => new Date("2026-08-16T00:00:00Z"),
    nanoClock: counterClock(),
  });

  let sent: { status: number; body: any } | null = null;
  const send = (_res: http.ServerResponse, status: number, obj: unknown) => {
    sent = { status, body: obj };
  };
  const deps: AskRouteDeps = {
    transport: "fake", hubBase: "http://x", hubFetch,
    wall, apiKey: "sk-ant-api03-multibyte-unit", model: "claude-sonnet-5",
    send,
  };

  const req = makeMockReq(chunks);
  const res = {} as http.ServerResponse; // send() ignores it
  await new Promise<void>((resolve) => {
    handleAsk(deps, req, res);
    // handleAsk resolves via the 'end' listener on req; poll until send() ran.
    const iv = setInterval(() => { if (sent) { clearInterval(iv); resolve(); } }, 5);
  });

  // Recover the user question the wall actually saw — the first chat.request
  // probe carries the exact bytes the adapter sent to Anthropic.
  const req0 = wall.pins.history().find((e) => e.probeId === "adapter.anthropic.chat.request");
  const body = (req0?.payload as { body?: { messages?: { role: string; content: string }[] } })?.body;
  const userMsg = (body?.messages ?? []).find((m) => m.role === "user");
  const questionSentToWall = typeof userMsg?.content === "string" ? userMsg.content : null;

  return { status: sent!.status, body: sent!.body, questionSentToWall };
}

test("Round WC-W2: handleAsk body decode preserves a UTF-8 codepoint split across two chunks", async () => {
  // A question containing exactly one emoji; JSON-encode, then split the raw
  // bytes strictly INSIDE the emoji's 4-byte sequence — the buggy per-chunk
  // decode produced U+FFFD replacement chars at that boundary.
  const question = `hi ${EMOJI} there — list the unused declarations`;
  const bodyText = JSON.stringify({ question });
  const bytes = Buffer.from(bodyText, "utf8");
  const emojiStart = bytes.indexOf(Buffer.from(EMOJI, "utf8"));
  assert.ok(emojiStart > 0, "test setup: emoji not present in encoded body");
  const cut = emojiStart + 2;                     // straddle 2/2 inside the emoji
  const a = bytes.subarray(0, cut);
  const b = bytes.subarray(cut);
  // Sanity: chunk boundary sits inside a UTF-8 sequence (last byte is a
  // continuation byte 10xxxxxx). That's the exact shape that triggered the
  // U+FFFD substitution under the old per-chunk decode.
  assert.equal((a[a.length - 1] & 0b11000000), 0b10000000);

  const { status, body, questionSentToWall } = await drive([a, b]);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.ok, true, JSON.stringify(body));

  // The critical assertion — the question the wall actually received matches
  // byte-for-byte what the client sent. Under the old code this string
  // carried U+FFFD replacement chars where the emoji had been.
  assert.equal(questionSentToWall, question);
  assert.ok(!questionSentToWall!.includes("�"),
    "question that reached the wall contains U+FFFD — the chunked decode still splits");
});

test("Round WC-W2: single-chunk path (baseline) still parses cleanly", async () => {
  const question = `plain ${EMOJI} question`;
  const bytes = Buffer.from(JSON.stringify({ question }), "utf8");
  const { status, questionSentToWall } = await drive([bytes]);
  assert.equal(status, 200);
  assert.equal(questionSentToWall, question);
});
