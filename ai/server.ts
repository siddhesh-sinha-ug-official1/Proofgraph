// ============================================================================
// P3 — the AI face server (ASSEMBLY code, lives OUTSIDE every cell).
//
//   node ai/server.ts                # FAKE transport (default), port 8478
//   node ai/server.ts --live         # real Anthropic transport — OUT of the
//                                    # demo path; requires AI_API_KEY in THIS
//                                    # process's environment (documented only)
//
// A zero-dep node:http server wrapping the V6 outlet (ai/service.ts):
//
//   browser (vite app, :5199)  --POST /ask {question}-->  THIS process (:8478)
//        <--{answer, toolCalls, bounds, graph facts}--         |
//                                                              v
//                                              hub :8477  GET /graph + /query
//                                                              |
//                                                              v
//                                    createAiOutlet({byokWall, graph, provenance})
//
// KEY CUSTODY (the entire point of this process boundary): the byok wall, the
// vault masterSecret, and the api key live ONLY here. The browser sends a
// question and receives an answer + the tool calls the answer used — never a
// key, never the masterSecret. Two independent guards:
//   1. the V6 outlet scrubs its pins/returns (question pinned digest-only,
//      activeSecrets redaction, failure class key-leak);
//   2. THIS server re-scans every serialized response body for its own secret
//      material before writing it; a hit is replaced by a 500 key-leak refusal
//      (loud, never silent) — belt and braces on top of the outlet's scrub.
// app/test/p3.build.gate.test.ts additionally proves the built browser bundle
// contains none of these literals (grep of dist output, automated).
//
// FAKE transport (default, this round's demo path): cell 6's OWN testkit
// makeFakeFetch (explicitly reusable) with a DYNAMIC route pair — a
// deterministic stand-in model that (a) always asks for one graph tool and
// (b) composes its final text ONLY from the tool_result bytes it is handed
// back on the wire. The tool itself executes in the outlet against the REAL
// hub-served graph, so the answer's node ids are real graph facts; the text
// is honestly labelled FAKE-transport. No key ever leaves the process either
// way — the fake transport never reaches the network at all.
//
// Failure classes served typed ({failureClass, detail}, hub-style):
//   ai-bad-request · unknown-endpoint · hub-unreachable (transport to hub) ·
//   ai-live-key-missing (--live without AI_API_KEY) · key-leak (response
//   gate) · thrown OutletFailure classes verbatim at 409 (tool-loop-exceeded,
//   graph-data-stale, lead-in-edges) · hub /graph refusals verbatim at 503
//   (no-graph-ingested…). Two V6 classes surface WITHOUT a typed refusal
//   response by design: unknown-tool is answered inside the tool round as an
//   isError tool result, and a hub /query refusal (roots-undeclared…) becomes
//   the 200 honest no-claim path (class named in graphFacts.provenanceSource).
//   [doc corrected, adversarial round: the old text promised every
//   OutletFailure class + all hub refusals as typed refusals verbatim]
// ============================================================================
//
// SUB200 restructure: this file is now the FACADE. The implementation lives in
// ai/server/ (config.ts · fakemodel.ts · hub.ts · askroute.ts · core.ts ·
// cli.ts); the full public surface is re-exported here unchanged — importers
// need zero changes, and `node ai/server.ts` still starts the server (the CLI
// trigger at the bottom of this file compares THIS module's url to argv[1]).
//
// The two secret LITERALS below stay in THIS file on purpose:
// app/test/p3.build.gate.test.ts live-extracts them from ai/server.ts source,
// so moving them would silently rot that bundle-secret scan.

import { maybeRunCli } from "./server/cli.ts";

// ---- the server-side secrets (THIS process only; the build-gate test proves
//      these literals never reach the browser bundle) ------------------------
/** Non-default vault masterSecret (differs from cell 6's INSECURE dev default,
 *  so the wall's insecure-master-secret gate ACCEPTS it). Override: env
 *  AI_MASTER_SECRET. */
export const AI_SERVER_DEFAULT_MASTER_SECRET =
  "proofgraph-ai-server-master-secret-p3-7788" as const;
/** The FAKE-transport api key: shaped like a key so the leak scanners have a
 *  real target to prove absent, but never valid anywhere. */
export const FAKE_TRANSPORT_API_KEY = "sk-fake-p3-outerwall-demo-key-0001" as const;

// ---- the public surface, re-exported from the split modules -----------------
export {
  AI_SERVER_VERSION, DEFAULT_PORT, DEFAULT_HUB_BASE, DEFAULT_MODEL,
} from "./server/config.ts";
export type { AiTransport, AiServerConfig, AiServerHandle } from "./server/config.ts";
export { fakeAnthropicRoutes } from "./server/fakemodel.ts";
export { fetchHubSnapshot, OutletHttpRefusal } from "./server/hub.ts";
export type { HubSnapshot } from "./server/hub.ts";
export { createAiServer } from "./server/core.ts";

// ── CLI ──────────────────────────────────────────────────────────────────────
// runs only when THIS facade is the entry module (`node ai/server.ts`).
maybeRunCli(import.meta.url);
