# proofgraph backend hub — Phase-2 vasculature (assembly code, NOT a cell)

The shared backend infrastructure for V2 (capability → editor LSP bridge) and
V4 (graph-model → graph-view over HTTP).  It connects cell WALLS and nothing
deeper: `packages/structure-extractor/wall.py` → `packages/graph-model/wall.py`,
with the capability wall's socket exposed for V1 and the WS bridge socket
exposed for V2.  No cell package was modified (zero labelled change requests).

```
hub/
  pipeline.py    run_pipeline(source_root, roots=None, capability_fn=None, ...)
                 -> {extractorWall, modelWall, envelope, declaredRoots, log}
                 (extract -> ingest)
  server.py      HTTP (stdlib http.server) + WS /lsp (websockets) surfaces
  test_hub.py    stdlib unittest; ephemeral ports; skeleton fixture
```

## Dependency & license gate

The hub's ONE third-party dependency (Operating Contract 10, pre-approved in
ARCHITECTURE-PHASE2.md):

| package | version | license | how verified |
|---|---|---|---|
| `websockets` | **16.0** (already present in the environment; nothing newly installed) | **BSD-3-Clause** | `importlib.metadata` License-Expression + bundled `licenses/LICENSE` |

Everything else is stdlib (`http.server`, `threading`, `json`, `hashlib`,
`unittest`, `urllib`).

## Running

```
python hub/test_hub.py          # the suite (ephemeral ports, no fixed state)
```

Programmatic use:

```python
import sys; sys.path.insert(0, "hub")
import pipeline, server
log = pipeline.HubLog()
result = pipeline.run_pipeline(
    "packages/structure-extractor/fixtures/python",
    extractor_config={"roots": ["pkg.a"], "python_package": "pkg",
                      "pyright_mode": "none"},
    log=log)
hub = server.HubServer(result, log=log).start()
print(hub.http_port, hub.ws_port)
```

## HTTP surface

| route | serves | refusals (named classes) |
|---|---|---|
| `GET /health` | versions, schema pin, lsp url | — |
| `GET /graph` | the canonical envelope `{schemaVersion, nodes, edges, leads}`, **canonical-json** serialized (`packages/schema/schema_tools.canonical_json`, utf-8). Bytes are re-parsed and id-set-verified against the model wall before every send. | `serializer-edge-drop`, `envelope-version-mismatch`, `no-graph-ingested` |
| `GET /graph/truth` | **V4's second leg**: the same envelope rebuilt from the model wall's PIN surface (`pins.dump()["wall"]["ingested"]`) and serialized DIRECTLY via the canonical serializer — deliberately **bypassing the /graph serializer seam**, so the client-side three-way gate (`app/src/graphSource.ts`) can catch a cheap/tampered `/graph` by id-set + byte comparison (`serializer-edge-drop`). Probed `hub.serve.truth`. | `no-graph-ingested` |
| `GET /query?kind=…[&roots=a,b]` | `modelWall.query(kind)` verbatim. Kinds: `unused`, `reachable`, `sccs`, `condensation`, plus the documented alias `unreferenced -> unused` (logged per request). | wall refusals pass through typed: `roots-undeclared` (409), `unknown-root` (404), `unknown-query` (400) — results are never invented |
| `GET /verdict/<nodeId>` (alias `/verdicts/<id>`) | `modelWall.verdictOf` — unknown stays unknown, outline `null` passes through | `unknown-node` (404) |
| `GET /analysis` | Phase 3: the outer wall's `analyze()` result as CANONICAL bytes — served once `attach_analysis(...)` stored it (serve_app startup / `POST /analyze` re-attach); the hub never fabricates an analysis | `no-analysis-computed` (503) |
| `GET /pins/catalog` | aggregated `{hub:{…}, cells:{structure-extractor, graph-model, capability-layer}}` probe catalogs | — |
| `GET /pins/history[?limit=N]` | aggregated probe histories — the seed of the SYSTEM diagnostic surface | — |
| `POST /analyze {root, roots?, extractorConfig?}` | re-runs the pipeline **through the outer wall** (`run_outerwall_session`, the factored serve_app attach pattern): the outer-wall analysis is recomputed on the SAME pipeline and **re-attached** (`hub.analyze.reattach`), the workspace is re-declared — `/graph` + `/analysis` stay one wall after every re-run | `pipeline-busy` (409), `hub-bad-request` (400), `bad-source-root` (400), wall refusals typed |
| `GET /workspace` | the DECLARED workspace `{root, package, declaredRoots, analyzedAt, pyrightMode}` (set by serve_app startup / `POST /analyze` — never inferred) | `workspace-not-open` (503) |
| `GET /fs/list?path=REL` | jailed dir listing `{path, entries:[{name, kind:dir\|file, size}]}` — probed `hub.fs.list` | `path-escape` (403), `workspace-not-open` (503), `fs-io-error` (400) |
| `GET /fs/file?path=REL` | jailed read `{path, encoding:utf8, content, sha256, byteLen}` — utf-8 files this round, binary refused — probed `hub.fs.read` | `path-escape` (403), `workspace-not-open` (503), `fs-io-error` (400, incl. binary) |
| `PUT /fs/file {path, content}` | jailed save; returns the new `{path, sha256, byteLen}` — probed `hub.fs.write {path, sha256, bytes}` | `path-escape` (403), `workspace-not-open` (503), `fs-io-error` (400), `hub-bad-request` (400) |
| `GET /fs/roots-candidates` | the root-picker's feed: decl-kind nodes of the CURRENT envelope `{id, name, kind, file}` — module nodes EXCLUDED (model-wall roots are DECL ids, V3's root-vocabulary-mismatch lesson); roots stay DECLARED | `no-graph-ingested` (503) |
| `OPTIONS *` | CORS preflight for the browser face (PUT/POST carry a JSON content-type) — 204, `GET, POST, PUT, OPTIONS` | — |

### The workspace-fs jail (app-shell round; APP-SHELL-CONTRACT.md)

The browser NEVER touches the filesystem — every file op above crosses this
membrane, path-JAILED to the DECLARED workspace root
(`HubServer.set_workspace`, called by serve_app startup and by every
successful `POST /analyze`; the hub never guesses a jail from a pipeline
run).  `resolve_fs_path` refuses — failure class `path-escape`, probed
`hub.fs.rejected` — anything absolute, drive-qualified (incl. drive-relative
`C:x`), UNC, leading-separator, `..\`-traversing, or symlink-escaping:
`Path.resolve()` (which follows symlinks) runs BEFORE an
`os.path.commonpath` check against the resolved root, so a link inside the
jail cannot smuggle a target outside it.  The full matrix (list × read ×
write, 14 shapes + symlink leg) is `hub/test_hub.py` Test11.

### Honest bounds (all LOGGED, never silent)

- **/pins/history tail bound**: each stream is tail-bounded (default 2000
  events/stream, `?limit=N` to override). Any truncation sets
  `truncated: true` + `total` in the payload AND emits
  `hub.pins.history.truncated` on the hub log.
- **pins JSON coercion**: pins streams are serialized with `default=str` —
  a non-JSON diagnostic value (e.g. a `Path`) is textualized, never dropped.
  `/graph` is NOT subject to this: it uses the strict canonical serializer.
- **LSP raw-frame ledger retention**: the bridge ledgers sha256+length for
  every frame; raw text is retained only up to 65536 utf-8 bytes per frame
  (`hub.lsp.frame.bound` emitted when exceeded). The frame ITSELF always
  passes through untruncated — only the diagnostic copy is bounded.
- **Two listeners**: HTTP and WS live on separate (ephemeral by default)
  ports — stdlib `http.server` cannot upgrade to WS; `websockets` owns its
  own socket. `/health.lsp.url` carries the WS address.

### Concurrency

`POST /analyze` is serialized by a non-blocking lock — a second run while one
is in flight is refused (`pipeline-busy`), never queued.  This serialization
is also how the hub respects the **capability wall's one-run-at-a-time lock**
(SEAM-MAP: T2 `dump()/history()` are module-global): at most one pipeline —
hence at most one wall-mediated `capability()` run — is ever in flight through
the hub.  If the capability wall still refuses (`concurrent-run-unsupported`),
that class passes through typed.

## The V1 socket

`run_pipeline(..., capability_fn=…)` passes the callable verbatim into the
extractor wall's formalized injection point; default is the extractor's own
stub (`python→CT`, everything else→G — the honest stub the cell ships).
`HubServer.attach_capability_pins(pins)` adds T2's quartet to `/pins/*`
aggregation; until then `capability-layer` reports `available: false` with the
reason — an absent stream is surfaced absent, never fabricated.

App-shell round note: `POST /analyze` now runs through the outer wall's
`analyze_session`, which OWNS the capability feed (the REAL V1
`V1CapabilityFeed`, measured tiers only, lifecycle in a `finally`).  A
callable injected via `HubServer.set_capability_fn(fn)` is therefore **not
consulted by `/analyze` re-runs** — logged per request on
`hub.analyze.accepted` (`capabilityFnInjected`), never silent; the socket
remains live for direct `run_pipeline` callers.  Two bounds are carried by
this path (both logged): (1) the capability-fn bypass just described
(`hub.analyze.accepted`), and (2) `analyze-session-detached-log` (the run's
pipeline probes live on `session["pipeline"]["log"]`, counted on
`hub.analyze.reattach`) — see ARCHITECTURE-PHASE2.md.

## The WS /lsp bridge (V2's seam)

- **Framing**: one complete JSON-RPC message per WS **text** frame, utf-8, no
  `Content-Length` envelope. The bridge is direction-agnostic and
  content-opaque — it never parses or rewrites a frame; both directions pass
  byte-exactly, including **server→client requests**
  (`workspace/configuration` and friends) and their client responses.
- **Backend socket**: `HubServer.attach_lsp_backend(x)` where `x` is a
  zero-arg factory (fresh backend per connection) or a live instance
  (single-session mode; a second concurrent connection is refused with WS
  close 1013 / `lsp-backend-busy`). Backend protocol:
  `start(send_to_client)`, `client_frame(frame: str)`, `close()`.
- **Shipped backend**: `EchoLspBackend` (loopback) — echoes every client
  frame and can `inject(frame)` a backend-originated request, so both
  directions were testable before the real handle exists. **V2 attaches the
  real capability `Handle` here** by implementing the same three-method
  protocol over `handle.request(...)` / the handle's LSP child.
- **Real backend (V2, LANDED)**: `hub/lsp_backend.py`
  `CapabilityLspBackend(wall)` — `capability_wall('python').handle`'s LSP
  child bridged raw (stdio Content-Length ⇄ one-message-per-WS-text-frame is
  the ONLY transformation).  Fresh child per session from the SAME measured
  argv (`measured-child-respawn` bound, logged `hub.lsp.backend.spawn` — the
  editor owns its own raw `initialize`; at most ONE pyright tree exists per
  session).  Every bridged frame is ALSO pinned on the capability cell's own
  bus (`capability.probe.msg`, stage=`bridge`).  Child EOF closes the WS
  connection via the additive `bind_connection_close` hook (thread-safe
  `conn.close`), so the editor's disconnect probes fire instead of hanging;
  a frame arriving for a dead child is dropped LOUDLY
  (`hub.lsp.backend.write.failed`, failure class `lsp-backend-dead`) and not
  ledgered, so `audit_lsp_session` names the loss `lsp-bridge-drop`.  New hub
  leads (catalog extended additively in lsp_backend.py):
  `hub.lsp.backend.{attach,spawn,eof,kill,write.failed}`.  Driven end-to-end
  by `vessels/v2_hub_runner.py` + `vessels/test_v2_squiggle.mjs`.
- **Ledger + audit**: every frame is ledgered on both sides
  (`BridgeSession` sha256 per direction; backend keeps its own lists);
  `HubServer.audit_lsp_session(session, backend)` compares the ledgers and
  names any mismatch `lsp-bridge-drop` (logged via `hub.lsp.drop`).

## Pathing (MERGED with V3)

`vessels/pathing.py` (V3's shadowing-guarded loader) is the hub's primary
wiring: `ensure_cell_on_path` (with the `sys-path-shadowing` seam guard),
`load_wall` (unique `proofgraph_wall_<cell>` aliases — hub and vessels share
ONE wall module per cell per process; a bare `import wall` is never used),
and `load_schema_module("ids")` for the canonical mint.  `schema_tools.py`
is additionally loaded by file with a scoped `ids` alias to satisfy its
flat-import fallback (V3's loader alone can't).  A tiny local fallback covers
only a checkout where `vessels/pathing.py` is absent; whichever mechanism ran
is logged (`hub.pathing`), never silent.  Verified live: the hub suite and
`vessels/test_v3_extractor_to_model.py` both green in this arrangement.

## Hub failure classes (extends the seam catalog)

`pipeline-busy` · `lsp-backend-busy` · `hub-bad-request` · `unknown-endpoint`
· `no-analysis-computed` (registered in ARCHITECTURE-PHASE2.md) — plus the
app-shell workspace-fs vocabulary `path-escape` · `workspace-not-open` ·
`fs-io-error` (also registered there), the pre-catalogued `serializer-edge-drop`,
`envelope-version-mismatch`, `lsp-bridge-drop`, `schema-pin-mismatch`, and
typed passthrough of every wall + outer-wall class (`bad-source-root`,
`unknown-root`, …).

## Diagnostic surface

The hub keeps its own catalogued probe log (`pipeline.HubLog`,
40 leads under `hub.*` in the base catalog (importing `lsp_backend.py` adds
the 5 `hub.lsp.backend.*` leads additively — see the WS section) —
27 laid with the hub, +2 for V4's `/graph/truth`
(`hub.serve.truth`, `hub.serve.truth.refused`), +3 for the Phase-3
`/analysis` surface, +8 for the app-shell workspace-fs surface
(`hub.workspace.set`, `hub.serve.workspace`, `hub.fs.list`, `hub.fs.read`,
`hub.fs.write {path, sha256, bytes}`, `hub.fs.rejected {failureClass}`,
`hub.serve.rootsCandidates`, `hub.analyze.reattach`); uncatalogued emits
raise, mirroring the cells).
`/pins/catalog` + `/pins/history` aggregate hub + cell streams —
`{hub:{…}, cells:{…}}` — the seed of the SYSTEM diagnostic surface the outer
wall stands on since Phase 3.

## Files (verified)

File-level purposes from the adversarial claim audit (`audit/AUDIT-hub.json`,
2026-08-02, independently re-verified 2026-08-03; suite after doc fixes:
`python hub/test_hub.py` = 44 tests OK, 1 documented Windows-symlink env skip).
Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `pipeline.py` | 64 | Facade re-exporting the split pipeline surface (pipeline_log / pipeline_paths / pipeline_run) under the original `import pipeline` path; holds no logic of its own; imported by server*, lsp_backend*, serve_app, tests, and external assembly callers. |
| `pipeline_log.py` | 162 | Defines the hub constants (paths, hard-coded schema pin), the HubError typed-refusal class, the 40-lead HUB_PROBE_CATALOG (one shared dict that lsp_backend_capability extends in place), and the thread-safe append-only HubLog whose emit() raises on uncatalogued probes and whose tap() subscribes to catalogued ones. |
| `pipeline_paths.py` | 174 | ensure_paths puts the three python cell roots on sys.path via vessels/pathing.py (plain local inserts only when that file is absent; whichever ran is emitted on hub.pathing); canonical_schema_tools loads packages/schema/schema_tools.py by file with a temporarily-scoped sys.modules['ids'] alias; assert_schema_pin verifies PIN file + recomputed schema.json hash against the hard-coded pin and raises schema-pin-mismatch on any drift or unverifiability. |
| `pipeline_run.py` | 146 | run_pipeline extracts through the structure-extractor wall then ingests through the graph-model wall (walls only, loaded via load_wall_modules' shared aliases); resolve_roots maps declared roots (canonical node ids or names matching exactly one non-module node) to ids and raises unknown-root otherwise; wall refusals are logged on hub.pipeline.rejected then re-raised unwrapped. |
| `server.py` | 166 | Facade composing the public HubServer from the face mixins and keeping render_graph_payload: projects the envelope from the model wall at request time, serializes via the swappable _graph_serializer seam, re-parses the exact bytes and refuses on pinned-schemaVersion drift (envelope-version-mismatch) or node/edge/lead id-set inequality (serializer-edge-drop); the faultcheck fault-b text anchor targets this method in this file. |
| `server_core.py` | 121 | HubServerCore: all HubServer state (pipeline slot + non-blocking analyze lock, capability fn/pins sockets, analysis bytes, workspace jail slot, pins tail bound default 2000, LSP backend slots) and lifecycle — start() stands one stdlib ThreadingHTTPServer and one websockets listener on ephemeral-by-default ports, stop() shuts both down. |
| `server_fs.py` | 187 | WorkspaceFsMixin: set_workspace declares the resolved fs jail root (never inferred); resolve_fs_path refuses absolute, drive-qualified (incl. drive-relative C:x), UNC, leading-separator, ..-traversing and symlink-escaping paths as path-escape by resolving BEFORE a case-normalized commonpath check; fs_list serves jailed dir listings, fs_read / fs_write do jailed utf-8-only IO with sha256 in their payloads (list carries no sha256), each success probed hub.fs.* and every refusal typed. |
| `server_surfaces.py` | 175 | SurfacesMixin: roots_candidates lists the current wall projection's non-module nodes (never picks a root); render_truth_payload rebuilds the envelope from modelWall.pins.dump()['wall']['ingested'] and serializes with canonical_json_bytes directly, bypassing the /graph serializer seam; attach_analysis stores/render_analysis_payload serves canonical analysis bytes; pins_catalog and pins_history aggregate hub+cell streams with a tail bound whose truncation is flagged in-payload and logged. |
| `server_analyze.py` | 119 | run_outerwall_session lazily imports outerwall.analyze.analyze_session (the factored serve_app attach pattern shared with the CLI); AnalyzeMixin.analyze serializes POST /analyze behind the non-blocking pipeline lock (pipeline-busy, never queued), swaps in the session pipeline, re-attaches the canonical analysis, re-declares the workspace (a single-file root jails its parent dir), and logs the analyze-session-detached-log bound plus the capability-fn bypass — an injected set_capability_fn callable is not consulted on this path. |
| `server_http.py` | 149 | HandlerPlumbing (BaseHTTPRequestHandler subclass): _send_bytes/_send_json (default=str coercion) /_send_failure (per-class HTTP status map, optional refusal probe), the do_GET routing table, CORS wildcard read-allow + OPTIONS preflight (204, GET/POST/PUT/OPTIONS), quiet log_message; _make_handler stamps hub/log as class attributes on a per-server handler subclass. |
| `server_http_get.py` | 160 | GetBodiesMixin: the GET route bodies — /health (versions, schema pin, ws lsp url), /analysis, /workspace, /fs/list, /fs/file, /fs/roots-candidates, /graph, /graph/truth, /query (forwards kind verbatim except the logged unreferenced->unused alias, roots comma-split), /verdict — every success emitted on the hub log and every refusal sent typed via _send_failure. |
| `server_http_mut.py` | 93 | MutRoutesMixin: PUT /fs/file (JSON {path:str, content} -> jailed fs_write) and POST /analyze (JSON body -> AnalyzeMixin.analyze); any other PUT/POST route refused unknown-endpoint; malformed bodies raise hub-bad-request; hub-bad-request and non-HubError analyze failures additionally logged on hub.analyze.rejected here (pipeline-busy is logged inside AnalyzeMixin.analyze; other HubError classes from the session path reach _send_failure without that probe). |
| `server_ws.py` | 152 | LspBridgeMixin: attach_lsp_backend accepts a factory (fresh backend per connection) or live instance (single-session; concurrent connection refused 1013 lsp-backend-busy); _ws_handler ledgers every frame both directions on a BridgeSession with per-frame hub.lsp.frame.* pins and retention-bound logging, passes frames byte-exactly, and offers the additive bind_connection_close hook; audit_lsp_session compares bridge vs backend sha256 ledgers and names any mismatch lsp-bridge-drop. |
| `server_lsp.py` | 97 | LSP bridge primitives: EchoLspBackend (loopback echo defining the start/client_frame/close backend protocol, inject() simulates server->client requests) and BridgeSession (per-connection two-direction frame ledger — sha256+byteLen always, raw text retained only up to LSP_RAW_RETENTION_BYTES=65536). |
| `lsp_backend.py` | 73 | Facade re-exporting CapabilityLspBackend under the original import path; carries the V2 seam design docstring (why the child is bridged raw rather than handle.request(), measured-child-respawn, one-child bound, capability.probe.msg bridge pins, lsp-backend-dead, EOF-closes-connection) — the additive catalog registrations run on importing this facade. |
| `lsp_backend_capability.py` | 195 | CapabilityLspBackend: bridges the capability wall handle's live pyright LSP child to the WS bridge — __init__ refuses handles without a child (hub-bad-request); start() tree-kills the battery child and respawns the SAME measured argv via the cell's own LspClient.start(), logged as measured-child-respawn; a pump thread serializes child-queue messages one per WS text frame; client_frame Content-Length-frames parsed JSON onto child stdin and drops frames for a dead child loudly without ledgering them; registers the 5 hub.lsp.backend.* catalog leads additively on import; kill_child is the drop-test helper. |
| `serve_app.py` | 191 | CLI launcher (python hub/serve_app.py) standing HubServer on fixed dev ports (HTTP 8477 / WS 8479) over a fixture: default --analysis attach runs the outer wall's analyze_session and attaches the analysis on the same pipeline; declares the workspace explicitly (package-dir or single-file fixture jails its PARENT so spans match); --lsp live loads the capability wall, applies the V1 silent-tier-upgrade guard, attaches CapabilityLspBackend + the T2 pins quartet; SIGINT/SIGTERM shuts the wall down before the hub. |
| `test_hub.py` | 80 | unittest suite AGGREGATOR: load_tests runs the nine split hub test modules in the original Test01..Test11 order; run_demo, run_all_suites and faultcheck invoke the suite by this exact path; 44 tests total (counted per class: 3+5+7+3+4+4+2+4+2+2+3+3+2). |
| `test_hub_base.py` | 152 | Shared suite fixture: ensure_stack lazily builds exactly one HubLog + run_pipeline result + started HubServer (stopped via atexit, preserving the pre-split module-fixture lifecycle); provides the HTTP GET/PUT/POST JSON helpers, wall/pin accessors, the Test08 JSON-RPC frame fixtures, and _wait_until polling. |
| `test_hub_seam.py` | 178 | Test01 asserts /health facts and extract->ingest seam agreement (extractor return pin == model ingest pin == envelope counts, node-id verify pin, minted t1 ids superset of served ids); Test02 asserts /graph canonical-byte equality with the wall projection, three-surface id-set equality, serving stability, and the NAMED serializer-edge-drop and envelope-version-mismatch refusals with post-refusal recovery. |
| `test_hub_query_verdict.py` | 153 | Test03 asserts /query three-way equality (served == model-wall query pin == direct wall call, plus the hub pin) for sccs/condensation and the typed refusals roots-undeclared (incl. via the logged unreferenced alias), unknown-root for module ids, unknown-query, hub-bad-request; Test04 asserts /verdict honest-unknown across extractor envelope, wall verdictOf and served body, the /verdicts alias, and unknown-node by name. |
| `test_hub_pins.py` | 116 | Test05 asserts the aggregated /pins/catalog census (hub size == HUB_PROBE_CATALOG, extractor 149 and graph-model 116 with direct wall reads agreeing, capability-layer honest absence), /pins/history aggregation, the logged tail-bound truncation at limit=1, and capability attach/detach plumbing using an explicitly-labeled test double. |
| `test_hub_analyze.py` | 120 | Test06 asserts POST /analyze stands up fresh walls whose pins re-agree and whose projection byte-matches /graph, the pipeline-busy named refusal leaving the pipeline untouched, hub-bad-request for unparseable/rootless bodies, and unknown-endpoint; Test07 asserts run_pipeline's unknown-root for unresolvable names (hub side) and for module-id roots (model-wall side), refusal pins on both surfaces. |
| `test_hub_lsp.py` | 144 | Test08 asserts the echo /lsp bridge is byte-exact both directions frame-for-frame (session ledger == backend ledger == the client's own lists; audit ok; hub frame pins count-and-sha match), a frame-swallowing backend is caught as lsp-bridge-drop, instance-mode concurrent connection refused with close 1013 lsp-backend-busy then recovers, and an unknown WS path closes 1008. |
| `test_hub_truth_analysis.py` | 141 | Test09 asserts /graph/truth byte-equals the canonical serialization of the model wall's pin-surface ingested state (equal to /graph when healthy) and stays intact while a cheap /graph serializer drops rows; Test10 asserts GET /analysis refuses no-analysis-computed before attach, serves exactly canonical_json(analysis) after, and HubLog.tap works for catalogued probes and refuses uncatalogued ones. |
| `test_hub_fs_workspace.py` | 120 | Test11 part 1 on a temp fixture copy: a fresh workspace-less hub refuses /workspace and every /fs op workspace-not-open (and roots-candidates no-graph-ingested) with every refusal probed on hub.fs.rejected; declared workspace facts are served with matching hub.workspace.set pins; /fs/roots-candidates equals exactly the current envelope's non-module decl set. |
| `test_hub_fs_io.py` | 181 | Test11 part 2 on a temp fixture copy: jailed /fs list/read/write round-trip with sha256 agreement across HTTP body, disk bytes and hub.fs.* pins (original content restored); binary and missing-file reads refused fs-io-error; the 14-shape x 3-op path-escape matrix all refused 403 and all probed; a symlink-escape leg that skips VISIBLY when Windows denies symlink creation. |
| `test_hub_fs_loop.py` | 118 | Test11 part 3 on a temp fixture copy: an edit saved through the jailed endpoint then POST /analyze serves a strictly-grown node set naming the new decl, feeds /fs/roots-candidates from the current envelope, re-attaches /analysis whose graph carries exactly the served id set (reattach pin sha-checked), re-declares the workspace, and the re-attached analysis byte-equals a FRESH outerwall analyze() run. |
| `README.md` | 254 | Area doc: the dependency/license gate (websockets 16.0 — re-verified installed this audit), the full HTTP-route and refusal-class tables, the workspace-fs jail description, honest bounds (pins tail 2000, default=str coercion, LSP raw retention 65536, two listeners), analyze concurrency, the V1/V2 sockets, the V3-merged pathing, and the probe-catalog census — each row checked against the split modules this round. |
| `ASSEMBLY-CHANGES.md` | 72 | Change log: the SUB200 split record — every stated per-module line count matched wc -l at audit start (27 files checked), facade/aggregator claims and the 44-test-count claim verified live — plus this round's claim-audit doc-fix entry. |

One open code finding (severity low, reported not patched): `server_ws.py`'s
bridge-loop `except Exception: pass` around `backend.start()` and the frame
loop also swallows real backend errors with no named failure-class emit —
only the generic `hub.lsp.close` fires in the `finally`
(`audit/AUDIT-hub.json` codeFindings).
