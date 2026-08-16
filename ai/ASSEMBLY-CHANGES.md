# ASSEMBLY-CHANGES — ai (assembly vessel, outside every cell)

Vessel: `ai/` — the V6 outlet (service.ts) + the P3 AI face server (server.ts).

## SUB200 restructure (2026-08-02)

Adversarial-round prep: every source file brought under the 200-line ceiling by
cohesion splits behind facades. BEHAVIOR-PRESERVING — no export renamed, no
assertion weakened, no semantic change; external importers need zero changes.

| Old file (lines) | New modules (lines) |
| --- | --- |
| `service.ts` (451) | FACADE `service.ts` (69, full public surface re-exported) + `outlet/types.ts` (89: bounds, failure classes, data shapes) + `outlet/pins.ts` (56: pin stream + key-leak scrub chokepoint) + `outlet/tools.ts` (161: four tool defs + local executor + output bound) + `outlet/ask.ts` (143: the single-round tool loop) + `outlet/core.ts` (83: construction gates + wiring) |
| `server.ts` (480) | FACADE `server.ts` (83: secret literals + re-exports + CLI trigger) + `server/config.ts` (36: identity/defaults/config shapes) + `server/fakemodel.ts` (115: FAKE stand-in model + routes) + `server/hub.ts` (74: hub snapshot fetch, HubDown, OutletHttpRefusal) + `server/askroute.ts` (100: POST /ask handler) + `server/core.ts` (135: wall + response gate (guard 2) + http plumbing) + `server/cli.ts` (60: `maybeRunCli`) |
| `test/v6.outlet.test.ts` (455, 8 tests) | `test/v6.outlet.fixtures.ts` (151, shared fixtures — not a test file) + `test/v6.outlet.golden.test.ts` (146, 1 test) + `test/v6.outlet.security.test.ts` (87, 3 tests) + `test/v6.outlet.gates.test.ts` (114, 4 tests) |
| `test/p3.server.test.ts` (326, 6 tests) | `test/p3.server.fixtures.ts` (114, shared fixtures — not a test file) + `test/p3.server.ask.test.ts` (128, 3 tests) + `test/p3.server.custody.test.ts` (108, 3 tests) |

[adversarial round, 2026-08-03 — line-count drift note] The `server.ts` facade
row above recorded 83 lines, true at the 2026-08-02 split; the adversarial
claim-audit's own header correction (failure-class enumeration, doc-only) then
grew the facade to 88 lines. Every other row re-measured exact on 2026-08-03.

Invariants held (all verified after the split):

- **Facades**: `ai/service.ts` and `ai/server.ts` remain at their original
  paths and re-export the complete public surface (`createAiOutlet`,
  `OutletFailure`, bounds, all types; `createAiServer`, `fakeAnthropicRoutes`,
  `fetchHubSnapshot`, `OutletHttpRefusal`, defaults, secrets, all types).
- **CLI**: `node ai/server.ts [--live] [--port N] [--hub URL]` unchanged — the
  facade calls `maybeRunCli(import.meta.url)` so direct-run detection still
  keys on the facade's own module url; a mere import never starts a server
  (verified via acceptance/headless/ai_check.mjs, which dynamically imports
  the facade).
- **Build-gate literals**: `AI_SERVER_DEFAULT_MASTER_SECRET` and
  `FAKE_TRANSPORT_API_KEY` stay as string literals INSIDE `ai/server.ts` —
  `app/test/p3.build.gate.test.ts` live-extracts them from that source file by
  regex; the extraction was replicated against the new facade and matches.
  `server/core.ts` / `server/cli.ts` import them from the facade (a benign
  module cycle: values only read inside functions, after evaluation).
- **Suite**: `node --test "test/*.test.ts"` — 14/14 green before AND after
  (same 14 test names; count unchanged, no assertion touched; fixtures moved
  verbatim into the two `*.fixtures.ts` helpers).

## Pre-GitHub remediation round (2026-08-16) — S2 CORS/CSRF allowlist

Security finding S2 (CONSOLIDATED-FINDINGS Cluster S): `server/core.ts`
`corsHeaders()` returned `Access-Control-Allow-Origin: *` on every response and
`do_OPTIONS` allowed POST with no Origin check — any page the user visited could
drive POST /ask on this KEY-HOLDING server (api key + vault masterSecret live
only in this process).

Fix (behavior-preserving except the defect):
- NEW `ai/server/cors.ts` (61): the browser-face origin allowlist, mirroring
  hub/cors.py. Loopback rule (vite face :5199 + dev hub/ai/ws ports, plus any
  loopback origin for the ephemeral-port acceptance UI); every public origin
  blocked. `acaoFor()` / `isForeignOrigin()`.
- `server/core.ts`: `corsHeaders(origin)` echoes ACAO ONLY for an allowlisted
  origin (never `*`); `send(res, status, obj, origin)` threads it; the request
  handler binds a per-request `rsend` from `req.headers.origin`; POST /ask from
  a foreign origin is refused 403 `cross-origin-denied` (the wall is never
  driven); OPTIONS omits the allow headers for a foreign origin.
  `askroute.ts` is UNCHANGED (rsend is passed in as its `send` dep).
- NEW `ai/test/p3.server.cors.test.ts` (3 tests, node:http to send a real
  Origin header — undici forbids it on fetch). Allowed origin echoes exactly;
  foreign POST /ask → 403, no ACAO; no-Origin POST /ask still 200.

Suites GREEN: `cd ai && node --test "test/*.test.ts"` 17 tests pass
(14 baseline + 3 new), 0 fail. `acceptance/run_demo.py --skip-ui` e-ai
(POST /ask, no-Origin runner path) unaffected.

## Pre-GitHub remediation round (2026-08-16) — H3 body-hardening on POST /ask

Robustness finding H3 (CONSOLIDATED-FINDINGS Cluster H-hub, ai side): the
`handleAsk` request stream had no `req.on("error", …)` listener, and no
body-size cap. A mid-body socket reset (client disconnect / TCP RST) surfaced
as `uncaughtException` and crashed the KEY-HOLDING server; a huge body was
buffered until memory ran out. This is the same server that holds the vault
masterSecret + api key, so a crash-loop is a first-order incident.

Fix (behavior-preserving except the defect):
- `server/askroute.ts`: added an `ASK_BODY_MAX_BYTES = 1 << 20` (1 MiB) cap
  enforced in the `data` handler — the FIRST chunk that crosses the cap sends
  a typed 413 `ai-body-too-large` on the still-writable socket and pauses the
  reader; the outlet never sees the payload, the wall keys stay untouched.
  Added `req.on("error", …)` that sends a typed 400 `ai-body-error` if the
  response is still writable, and stays silent (server-side) if the peer is
  already gone — the process no longer crashes on `uncaughtException`. The
  `end` handler now guards `res.headersSent` before writing, so the cap-path
  and error-path can never emit a second response.
- NEW `ai/test/p3.server.ask.h3.test.ts` (2 tests): oversized body is refused
  413 with the exact `ai-body-too-large` class and the SAME port serves the
  next ask (server-still-up); a raw-socket client that writes headers +
  partial body then destroys the socket does not crash the server (a
  follow-up ask on the same port returns 200 `ok: true`).

Suites GREEN: `cd ai && node --test "test/*.test.ts"` 21 tests pass
(19 baseline + 2 new); no baseline test regressed.
