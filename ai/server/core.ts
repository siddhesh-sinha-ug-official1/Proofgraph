// ============================================================================
// P3 ai server — createAiServer: wall construction, the response-body
// key-leak gate (guard 2), and the node:http plumbing.
// Split out of ai/server.ts (SUB200 restructure). Behavior unchanged.
//
// KEY CUSTODY: the byok wall, the vault masterSecret, and the api key live
// ONLY in this process. Two independent guards:
//   1. the V6 outlet scrubs its pins/returns (question pinned digest-only,
//      activeSecrets redaction, failure class key-leak);
//   2. THIS server re-scans every serialized response body for its own secret
//      material before writing it; a hit is replaced by a 500 key-leak refusal
//      (loud, never silent) — belt and braces on top of the outlet's scrub.
//
// The secret LITERALS are imported from ../server.ts (the facade) — they must
// stay there because app/test/p3.build.gate.test.ts live-extracts them from
// that source file. The import cycle is benign: values are only read inside
// createAiServer(), after both modules finished evaluating.
// ============================================================================

import http from "node:http";

import { createByokWall } from "../../packages/byok-arena/src/wall.ts";
import type { ByokWall } from "../../packages/byok-arena/src/wall.ts";
import { makeFakeFetch } from "../../packages/byok-arena/src/testkit/fakefetch.ts";
import { AI_SERVER_DEFAULT_MASTER_SECRET, FAKE_TRANSPORT_API_KEY } from "../server.ts";
import { AI_SERVER_VERSION, DEFAULT_HUB_BASE, DEFAULT_MODEL, DEFAULT_PORT } from "./config.ts";
import type { AiServerConfig, AiServerHandle, AiTransport } from "./config.ts";
import { fakeAnthropicRoutes } from "./fakemodel.ts";
import { OutletHttpRefusal } from "./hub.ts";
import { handleAsk } from "./askroute.ts";
import { acaoFor, isForeignOrigin } from "./cors.ts";

export async function createAiServer(cfg: AiServerConfig = {}): Promise<AiServerHandle> {
  const transport: AiTransport = cfg.transport ?? "fake";
  const hubBase = cfg.hubBase ?? DEFAULT_HUB_BASE;
  const hubFetch = cfg.hubFetch ?? fetch;
  const model = cfg.model ?? DEFAULT_MODEL;
  const masterSecret =
    cfg.masterSecret ?? process.env.AI_MASTER_SECRET ?? AI_SERVER_DEFAULT_MASTER_SECRET;

  let apiKey: string;
  if (transport === "live") {
    const k = cfg.apiKey ?? process.env.AI_API_KEY;
    if (!k) {
      throw new OutletHttpRefusal(503, "ai-live-key-missing",
        "--live requires AI_API_KEY in the ai-server process environment (keys NEVER come from the browser)");
    }
    apiKey = k;
  } else {
    apiKey = FAKE_TRANSPORT_API_KEY;
  }

  // ONE wall per server process; FAKE transport never reaches the network.
  const wall: ByokWall = createByokWall({
    masterSecret,
    ...(transport === "fake" ? { fetchImpl: makeFakeFetch(fakeAnthropicRoutes()) } : {}),
  });

  /** Response-body key-leak gate (guard 2). Returns the safe bytes, or null if
   *  the payload carried secret material (caller then serves a 500 key-leak). */
  const secretMaterial = [apiKey, typeof masterSecret === "string" ? masterSecret : ""].filter(Boolean);
  function gateResponse(obj: unknown): string | null {
    const text = JSON.stringify(obj);
    for (const s of secretMaterial) {
      if (s && text.includes(s)) return null;
    }
    return text;
  }

  function send(res: http.ServerResponse, status: number, obj: unknown,
                origin: string | undefined): void {
    const gated = gateResponse(obj);
    if (gated === null) {
      // loud, typed, and the offending payload is NOT what goes out.
      const refusal = JSON.stringify({
        failureClass: "key-leak",
        detail: "response body carried key material — refused at the ai-server response gate (the outlet's own scrub is the first guard; this is the second)",
      });
      res.writeHead(500, corsHeaders(origin));
      res.end(refusal);
      return;
    }
    res.writeHead(status, corsHeaders(origin));
    res.end(gated);
  }

  // S2 fix: echo Access-Control-Allow-Origin ONLY for an allowlisted loopback
  // origin (cors.acaoFor); a foreign origin gets NO ACAO (the browser blocks
  // the read) and no-Origin callers (curl, the acceptance runners) get no
  // header and are unaffected. The old wildcard let any website read this
  // key-holding surface — dropped.
  function corsHeaders(origin: string | undefined): Record<string, string> {
    const acao = acaoFor(origin);
    return {
      "Content-Type": "application/json; charset=utf-8",
      ...(acao ? {
        "Access-Control-Allow-Origin": acao, "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      } : {}),
    };
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const route = url.pathname.replace(/\/+$/, "") || "/";
    // S2: the request's browser Origin (undefined for curl/runners) drives the
    // per-request ACAO echo; bind it into send so every write reflects it.
    const origin = req.headers.origin;
    const rsend = (r: http.ServerResponse, status: number, obj: unknown) =>
      send(r, status, obj, origin);

    if (req.method === "OPTIONS") {
      // corsHeaders omits ACAO for a foreign origin -> the browser fails the
      // preflight and never sends the state-changing POST /ask.
      res.writeHead(204, corsHeaders(origin));
      res.end();
      return;
    }

    if (req.method === "GET" && route === "/health") {
      rsend(res, 200, {
        ok: true, version: AI_SERVER_VERSION, transport, hubBase, model,
        keyCustody: "keys + masterSecret live ONLY in this node process — never served, never accepted from the browser",
      });
      return;
    }

    if (req.method === "POST" && route === "/ask") {
      // S2: a state-changing ask from a non-allowlisted browser origin is
      // refused 403 cross-origin-denied — the key-holding wall is never driven.
      if (isForeignOrigin(origin)) {
        rsend(res, 403, {
          failureClass: "cross-origin-denied",
          detail: `origin ${origin} is not an allowed localhost app origin — POST /ask refused`,
        });
        return;
      }
      handleAsk({ transport, hubBase, hubFetch, wall, apiKey, model, send: rsend }, req, res);
      return;
    }

    rsend(res, 404, { failureClass: "unknown-endpoint", detail: `no route ${req.method} ${route}` });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(cfg.port ?? DEFAULT_PORT, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr !== null ? addr.port : (cfg.port ?? DEFAULT_PORT));
    });
  });

  return {
    server, port, transport,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve()))),
  };
}
