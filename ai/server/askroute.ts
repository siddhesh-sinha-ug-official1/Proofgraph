// ============================================================================
// P3 ai server — POST /ask: hub snapshot → V6 outlet → answer + diagnostics.
// Split out of ai/server.ts (SUB200 restructure). Behavior unchanged.
//
// The response surfaces WHICH graph facts the answer used (the outlet's own
// outlet.tool.exec pins) plus bounds/usage/graphFacts. Every failure path is
// typed ({failureClass, detail}, hub-style); hub refusal classes pass through
// verbatim. All bytes leave through deps.send — the response-gate chokepoint
// owned by core.ts (guard 2).
//
// H3 pre-GitHub remediation (2026-08-16): the incoming request stream now
// carries a `req.on("error", …)` listener + a body-size cap (ASK_BODY_MAX_BYTES).
// A mid-body socket reset is a typed 400 ai-body-error (never an uncaught
// server crash); a body over the cap is refused 413 ai-body-too-large mid-read
// (the socket is destroyed and no bytes are handed to JSON.parse or the
// outlet). The wall keys stay in this process either way.
// ============================================================================

import type http from "node:http";

import { createAiOutlet, OutletFailure } from "../service.ts";
import type { ByokWall } from "../../packages/byok-arena/src/wall.ts";
import { fetchHubSnapshot, HubDown, OutletHttpRefusal } from "./hub.ts";
import type { AiTransport } from "./config.ts";

//: H3: hardest legitimate question is a small text blob; anything larger is
//: not a question, so we refuse LOUDLY at 1 MiB rather than accumulate it.
export const ASK_BODY_MAX_BYTES = 1 << 20;   // 1 MiB

export interface AskRouteDeps {
  transport: AiTransport;
  hubBase: string;
  hubFetch: typeof fetch;
  wall: ByokWall;
  apiKey: string;
  model: string;
  send(res: http.ServerResponse, status: number, obj: unknown): void;
}

export function handleAsk(deps: AskRouteDeps, req: http.IncomingMessage, res: http.ServerResponse): void {
  const { transport, hubBase, hubFetch, wall, apiKey, model, send } = deps;
  // Round WC-W2: collect raw bytes, decode ONCE at end. Prior code did
  // `bodyText += chunk`, which coerced each Buffer to a string per chunk and
  // corrupted multi-byte UTF-8 sequences that straddle a chunk boundary
  // (Node splits arbitrarily by TCP framing; the replacement char U+FFFD
  // showed up as `unparseable /ask body` refusals under load). Buffering the
  // bytes and calling toString("utf8") on the concatenated buffer preserves
  // any codepoint whose bytes span two chunks.
  const chunks: Buffer[] = [];
  let bodyBytes = 0;
  // H3: track a pre-decided refusal (cap-exceeded or socket-error) so both
  // the "end" handler and the error listener converge on the same class.
  let refused: OutletHttpRefusal | null = null;

  const replyRefusal = (r: OutletHttpRefusal) => {
    if (res.headersSent || !res.writable) return;
    try { send(res, r.status, { failureClass: r.failureClass, detail: r.detail }); }
    catch { /* peer already gone */ }
  };

  req.on("data", (c) => {
    if (refused !== null) return;
    const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
    bodyBytes += buf.length;
    if (bodyBytes > ASK_BODY_MAX_BYTES) {
      // H3: send the typed 413 FIRST while the socket is still writable,
      // then pause the reader.  The `end` handler will see `refused` and
      // skip a second write.  We do not destroy the socket here — some
      // clients (undici) surface a socket abort as "fetch failed" and
      // never see the 413 body we already put on the wire.
      refused = new OutletHttpRefusal(413, "ai-body-too-large",
        `POST /ask body exceeded ${ASK_BODY_MAX_BYTES} bytes — refused mid-read; the wall never saw the payload`);
      replyRefusal(refused);
      try { req.pause(); req.unpipe?.(); } catch { /* best effort */ }
      return;
    }
    chunks.push(buf);
  });
  // H3: a mid-body socket reset previously crashed the key-holding process
  // (uncaughtException).  A typed 400 ai-body-error goes out instead, if
  // the response is still writable — a client that already hung up gets
  // no reply, and the server stays alive to serve the next request.
  req.on("error", (e) => {
    if (refused === null) {
      refused = new OutletHttpRefusal(400, "ai-body-error",
        `request stream error mid-body: ${e instanceof Error ? e.message : String(e)}`);
    }
    replyRefusal(refused);
  });
  req.on("end", async () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    try {
      if (refused !== null) throw refused;
      let body: any;
      try {
        body = bodyText ? JSON.parse(bodyText) : {};
      } catch (e) {
        throw new OutletHttpRefusal(400, "ai-bad-request",
          `unparseable /ask body: ${e instanceof Error ? e.message : String(e)}`);
      }
      const question = body?.question;
      if (typeof question !== "string" || question.trim().length === 0) {
        throw new OutletHttpRefusal(400, "ai-bad-request", "/ask requires {question: string}");
      }

      // fresh same-snapshot pair per ask; a torn read is refused by the
      // outlet's graph-data-stale gate, never silently answered.
      const snap = await fetchHubSnapshot(hubBase, hubFetch);
      const outlet = createAiOutlet({
        byokWall: wall, graph: snap.graph, provenance: snap.provenance,
      });
      const result = await outlet.ask(question, { apiKey, model, provider: "anthropic" });

      // WHICH graph facts the answer used: the outlet's own pins.
      const toolCalls = outlet.pins.history()
        .filter((e) => e.probeId === "outlet.tool.exec")
        .map((e) => {
          const p = e.payload as Record<string, unknown>;
          return {
            id: p.id, name: p.name, args: p.args,
            output: p.output, isError: p.isError, truncated: p.truncated,
          };
        });

      send(res, 200, {
        ok: true,
        transport, provider: result.provider, model: result.model,
        answer: result.text,
        stopReason: result.stopReason,
        toolRounds: result.toolRounds,
        toolCalls,
        bounds: result.bounds,
        usage: result.usage,
        graphFacts: {
          schemaVersion: (snap.graph as { schemaVersion?: string }).schemaVersion ?? null,
          nodes: snap.graph.nodes.length,
          edges: snap.graph.edges.length,
          leads: Array.isArray(snap.graph.leads) ? snap.graph.leads.length : 0,
          roots: snap.provenance.roots ?? [],
          unusedProvided: Array.isArray(snap.provenance.unused) ? snap.provenance.unused.length : null,
          provenanceSource: snap.provenance.source ?? null,
        },
      });
    } catch (e) {
      // H3: the socket-error listener may have already replied; guard the
      // response so we never send headers twice.
      if (res.headersSent || !res.writable) return;
      if (e instanceof OutletHttpRefusal) {
        send(res, e.status, { failureClass: e.failureClass, detail: e.detail });
      } else if (e instanceof HubDown) {
        send(res, 503, { failureClass: "hub-unreachable", detail: e.detail });
      } else if (e instanceof OutletFailure) {
        send(res, 409, { failureClass: e.failureClass, detail: e.message });
      } else {
        send(res, 500, {
          failureClass: "ai-internal",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }
  });
}
