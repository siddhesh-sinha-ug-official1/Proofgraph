# hub/ ASSEMBLY-CHANGES

## Adversarial claim audit — doc-side fixes only (2026-08-02)

Stage-A claim audit (audit/AUDIT-hub.json). TEXT-ONLY changes; no identifier,
behavior, or assertion touched; suite re-run: 44 OK / 1 env skip (unchanged).

- serve_app.py `--root` help was stale on both facts: said "root module"
  (module roots are refused — roots are DECL nodes) and "default
  moatpkg.core" (the default is DEFAULT_ROOT = "moatpkg.core.main").  Fixed.
- pipeline.py facade docstring + README.md: run_pipeline's documented return
  omitted the "declaredRoots" and "log" keys it actually returns.  Fixed.
- README.md HTTP-surface table: GET /analysis (served since Phase 3, refusal
  no-analysis-computed) was missing a row.  Added; no-analysis-computed also
  added to the failure-class list.
- README.md: the garbled "Two bounds carried by this path" sentence named
  only one bound — now names both (capability-fn bypass +
  analyze-session-detached-log).
- README.md diagnostic-surface note: "40 leads" clarified as the BASE
  catalog (lsp_backend.py import adds the 5 hub.lsp.backend.* leads
  additively).
- test_hub.py docstring: no-analysis-computed added to the exercised
  failure-class list (Test10 exercises it; the list omitted it).

Note: the SUB200 line counts below are the split round's historical record;
this audit's text edits moved serve_app.py to 191 and test_hub.py to 80
(both still under 200).

## SUB200 restructure (2026-08-02)

Behavior-preserving split of every hub source file to under 200 lines.
Original module paths remain as FACADES re-exporting the full public
surface — external importers (`import pipeline` / `import server` /
`import lsp_backend`, package-style `from . import …`) need zero changes.
`python hub/test_hub.py` still runs the full suite (44 tests, unchanged
count) as an aggregator.

- hub/server.py (1194) → server.py facade 166 (keeps HubServer composition
  + render_graph_payload — the /graph serializer-seam leg, anchored by
  faultcheck fault b) + server_core.py 121 (state/lifecycle) +
  server_fs.py 187 (workspace jail) + server_surfaces.py 175
  (truth/analysis/roots/pins) + server_analyze.py 119
  (run_outerwall_session + POST /analyze) + server_ws.py 152 (WS /lsp
  bridge) + server_lsp.py 97 (EchoLspBackend/BridgeSession) +
  server_http.py 149 (handler plumbing + GET routing) +
  server_http_get.py 160 (GET bodies) + server_http_mut.py 93 (PUT/POST).
  The _make_handler closure vars became class attributes (`hub`, `log`)
  stamped on a per-server handler subclass — same objects, same behavior.
- hub/pipeline.py (466) → pipeline.py facade 64 + pipeline_log.py 162
  (constants, HubError, HUB_PROBE_CATALOG — still ONE shared dict object,
  so lsp_backend's additive registrations stay visible everywhere; HubLog,
  DEFAULT_LOG) + pipeline_paths.py 174 (V3-merged pathing + canonical
  schema tools + assert_schema_pin) + pipeline_run.py 146
  (load_wall_modules, resolve_roots, run_pipeline).
- hub/lsp_backend.py (251) → lsp_backend.py facade 73 (keeps the V2 seam
  documentation docstring) + lsp_backend_capability.py 195
  (CapabilityLspBackend + the additive catalog registrations, still run
  on import of the facade).
- hub/test_hub.py (1132) → test_hub.py aggregator 79 (load_tests over the
  nine split modules in original Test01..Test11 order) + test_hub_base.py
  152 (ONE shared lazily-built stack — LOG/pipeline/HubServer — stopped
  via atexit, preserving the module-fixture lifecycle) + test_hub_seam.py
  178 + test_hub_query_verdict.py 153 + test_hub_pins.py 116 +
  test_hub_analyze.py 120 + test_hub_lsp.py 144 +
  test_hub_truth_analysis.py 141 + test_hub_fs_workspace.py 120 +
  test_hub_fs_io.py 181 + test_hub_fs_loop.py 118.  Test11 was split into
  three classes (part 1 workspace/roots, part 2 fs io/escapes, part 3
  save→re-analyze→re-attach), each with its own temp fixture copy; test
  count unchanged (44), no assertion weakened.

No semantic changes; no public renames; probe catalog element-for-element
identical (the catalog dict moved as one object).

## Pre-GitHub remediation round (2026-08-16) — S1 CORS/CSRF allowlist

Security finding S1 (CONSOLIDATED-FINDINGS Cluster S): `server_http.py` sent
`Access-Control-Allow-Origin: *` on every response and `do_OPTIONS` whitelisted
PUT/POST with no Origin check — any website the user visited could cross-origin
PUT /fs/file (overwrite workspace files) or POST /analyze.

Fix (behavior-preserving except the defect):
- NEW `hub/cors.py` (89): the browser-face origin allowlist. Loopback rule —
  the vite face :5199 + dev hub/ai/ws ports are the canonical allow set, and
  ANY loopback origin (localhost/127.0.0.1/::1, any port) is allowed so the
  ephemeral-port acceptance UI (acceptance/checks/ui_servers.py) still works;
  every public-internet origin is blocked. `acao_for()` / `cross_origin_denied()`.
- `server_http.py`: `_send_bytes` + `do_OPTIONS` now echo ACAO ONLY for an
  allowlisted origin (never `*`); added `_reject_cross_origin()` and the
  `cross-origin-denied` → 403 status row.
- `server_http_mut.py`: `do_PUT` / `do_POST` call `_reject_cross_origin()` first
  — a foreign browser origin is refused 403, nothing mutated, probed
  hub.http.refused (existing catalogued probe; catalog unchanged).
- `pipeline_log.py`: `cross-origin-denied` added to the HubError vocabulary
  docstring. `ARCHITECTURE-PHASE2.md` seam catalog extended (rebased, not reverted).
- NEW `hub/test_hub_cors.py` (8 tests) registered LAST in `test_hub.py`.
  No-Origin (curl/runners) path proven unchanged; allowed origin echoes exactly;
  foreign PUT/POST refused with nothing written.

Suites GREEN: `python hub/test_hub.py` 52 tests OK (44 baseline + 8 new);
`acceptance/run_shell_demo.py` 11 PASS; `acceptance/run_demo.py --skip-ui`
10 PASS/1 SKIP (e-ai POST /ask through the no-Origin runner path unaffected);
`python linegate.py` 0 offenders.

## Pre-GitHub remediation round (2026-08-16) — H-hub robustness (H1/H2/H7/H9/H10)

Cluster H-hub of the pre-GitHub ledger (CONSOLIDATED-FINDINGS). Every fix is
behavior-preserving except the specific defect it addresses; no honesty
invariant weakened, no probe catalog shrunk.

- **H1 · server_ws.py** — `_ws_handler`'s bridge loop swallowed exceptions
  under a bare `except: pass`; a JSON parse failure inside a backend's
  `client_frame` or a `backend.start()` failure died silently, and the
  session logged only the generic `hub.lsp.close`. Fix: a `_BackendStartError`
  sentinel classifies start() failures as `lsp-backend-dead`; a
  `json.JSONDecodeError` from client_frame is classified as
  `lsp-bridge-drop`; anything else is classified as `lsp-bridge-error`. The
  class is emitted on a NEW probe `hub.lsp.error` (error kind) BEFORE the
  `hub.lsp.close` event, so the probe stream carries the reason. Two new
  regression tests in `test_hub_robustness.py`.
- **H2 · server_http_get.py / server_http.py** — `/pins/history?limit=abc`
  ran a bare `int(limit)` whose `ValueError` escaped `do_GET` (only
  `BrokenPipeError` was caught), dropping the connection with a traceback.
  Fix: a new `_get_pins_history(qs)` handler validates the limit and
  raises `HubError("hub-bad-request", …)`, emitted as `hub.http.refused`;
  `server_http.py` delegates the route (minimal 1-line dispatch change).
  Two new regression tests (non-int → 400, plus a follow-up ok).
- **H7 · server_ws.py + pipeline_log.py** — `HubLog._events` and the
  `lsp_sessions`/`lsp_backends` lists grew unbounded. Fix: `_events` is now
  a `deque(maxlen=HUB_LOG_MAX_EVENTS=5000)` so the /pins/history
  tail-bound (2000) is enforced at STORAGE, not only at serve time; the
  LSP session/backend lists are drop-oldest-capped at
  `LSP_SESSION_HISTORY_CAP=256` on insert (downstream `[-1]` and index
  access into the tail still work). Semantic-change note: after 256
  sessions on one hub, the oldest entries are dropped — a bounded
  deviation from the finding's "evict on close" (v2_hub_runner's
  index-based session query preserved).
- **H9 · server_analyze.py + server_http_get.py** — the /analyze
  `_pipeline = …; attach_analysis(…); set_workspace(…)` triple was
  non-atomic; a reader could observe a new pipeline paired with an old
  analysis payload. Fix: a new short-lived `_state_swap_lock` (lazily
  initialised under the existing `_pipeline_lock` because `server_core.py`
  owns `__init__` and is outside this cluster's partition) brackets the
  triple-swap atomically; the `_get_graph`/`_get_analysis`/`_get_workspace`
  handlers take the same lock for the read, so no reader can ever see a
  torn triple during the swap window.
- **H10 · server_ws.py** — the instance busy flag was set BEFORE the
  try/finally that clears it; any exception in session setup (e.g.
  `BridgeSession(...)` or the initial log.emit) bricked the one-session
  backend permanently (lsp-backend-busy forever). Fix: setup + bridge
  loop now all live INSIDE the try, and `_release_instance()` in the
  finally guarantees the flag is cleared on every path.

New file `hub/test_hub_robustness.py` (registered last in `test_hub.py`)
carries the H1/H2/H9/H10 regressions (6 tests).

Suites GREEN: `python hub/test_hub.py` 58 tests OK (52 baseline + 6 new);
`cd ai && node --test "test/*.test.ts"` 21 tests OK (19 baseline + 2 new for
H3, tests in `test/p3.server.ask.h3.test.ts`); `acceptance/run_shell_demo.py`
11 PASS; `acceptance/run_demo.py --skip-ui` 10 PASS/1 SKIP;
`python linegate.py` 0 offenders (all touched files under 200 lines).

Cross-cluster edit (out-of-partition, minimal): `hub/server_http.py` — the
one-line `do_GET` dispatch was changed to call
`self._get_pins_history(parse_qs(...))`; no other logic touched. Recorded
here as an in-partition-adjacent fix (no other cluster owned this file).
