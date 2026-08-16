# REPORT — backend hub (shared vessel infrastructure for V2 + V4)

Vessel: **hub** (`proofgraph/hub/`) — the Python backend bridging cells 1–3 to
the frontend (V4's HTTP feed) and the editor (V2's WS LSP bridge).
Status: **laid and green** — `python hub/test_hub.py` → **32/32 OK**.

## What was laid

| file | role |
|---|---|
| `hub/pipeline.py` | `run_pipeline(source_root, roots=None, capability_fn=None, extractor_config=None, out_dir=None, log=None)` → `{extractorWall, modelWall, envelope, declaredRoots, log}`. Walls only: `extract()` through the structure-extractor WALL → `ingest()` through the graph-model WALL. Also: `HubLog` (the hub's own 27-lead catalogued probe log; uncatalogued emits raise), `HubError` (named classes), canonical `schema_tools` loading, hub-side schema-PIN assertion, declared-root resolution. |
| `hub/server.py` | `HubServer` — HTTP (stdlib `http.server`, threading): `/health`, `/graph`, `/query`, `/verdict/<id>` (+`/verdicts/` alias), `/pins/catalog`, `/pins/history`, `POST /analyze`. WS (`websockets`): `/lsp` JSON-RPC frame bridge with pluggable backend socket `attach_lsp_backend(...)` + shipped `EchoLspBackend`; per-session frame ledger + `audit_lsp_session`. |
| `hub/test_hub.py` | stdlib unittest, ephemeral ports, skeleton fixture (`packages/structure-extractor/fixtures/python`, pyright_mode "none"). 32 tests. |
| `hub/README.md` | surface + bounds + dependency/license log + V2/V1 socket contracts. |

## Third-party dependency (the hub's ONE)

**websockets 16.0, BSD-3-Clause** — verified via `importlib.metadata`
(License-Expression: `BSD-3-Clause`; bundled `licenses/LICENSE`). Already
present in the environment; **nothing was newly installed**. Logged here and
in `hub/README.md` per the license gate.

## Invariants proven (pins × pins — never a return value alone)

- **/graph bytes == `modelWall.project('graph')` canonical-json** (BYTE
  equality, `packages/schema/schema_tools.canonical_json`, utf-8), stable
  across repeated GETs.
- **Serializer-edge-drop guard (THE cheap-serializer seed):** served
  node/edge/lead id sets == model wall's == extractor envelope's, three ways;
  the guard re-parses the exact served bytes on EVERY request. An injected
  cheap serializer (drops the last edge) is refused 500
  `serializer-edge-drop` (hub pin `hub.serve.graph.refused`), and serving
  recovers after.
- **Extract→ingest seam:** `extractor.wall.extract.return` counts ==
  `graph-model.wall.ingest.accepted` counts == envelope; every ingested node
  id appears byte-identically in the extractor's `extractor.t1.node.id`
  mint pins (the end-to-end probe-trace seed);
  `graph-model.wall.ingest.verify.nodeIds` pass=true over all nodes.
- **/query == wall.query() == the wall.query pins** for `sccs` and
  `condensation` (three-way, on the pin the SERVER's call emitted);
  `unused`/`reachable` with no declared roots refuse honestly —
  `roots-undeclared` on the HTTP surface AND on
  `graph-model.wall.query.rejected` AND on `hub.serve.query.refused`;
  module-id root → `unknown-root` (wall pin + HTTP); bogus kind →
  `unknown-query`. `unreferenced` is a documented, logged alias → `unused`
  (the wall still owns the verdict).
- **/verdict honest-unknown through three surfaces:** extractor envelope fill
  == wall `verdictOf` == served JSON, all `unknown`; outline `null` passes
  through un-invented; `graph-model.wall.verdict` pin + `hub.serve.verdict`
  pin carry the same story. Unknown id → `unknown-node` on both surfaces.
- **Envelope version pin:** a tampered `schemaVersion` in the projected
  envelope is refused 500 `envelope-version-mismatch` (checked BOTH on the
  wall's envelope and on the re-parsed served bytes).
- **/pins aggregation** (`{hub:{…}, cells:{structure-extractor, graph-model,
  capability-layer}}`): catalog census intact through the vessel —
  structure-extractor **137**, graph-model **116** (asserted via HTTP AND via
  direct wall reads); capability-layer honestly `available:false` with reason
  (stub in use) — attach plumbing tested with an explicitly-labeled test
  double, then detached.
- **WS /lsp echo round-trip byte-exact BOTH directions:** three client
  JSON-RPC frames (incl. non-ASCII) echoed in order byte-exactly; a fake
  **server→client request** (`workspace/configuration`, id 42) injected at
  the backend reaches the client byte-exactly, and the client's response
  reaches the backend byte-exactly — the framing V2 relies on is proven now
  (one complete JSON-RPC message per WS text frame; bridge is
  content-opaque, never rewrites). Bridge ledger == backend ledger == the
  client's own lists, frame for frame (sha256), and the `hub.lsp.frame.c2s/
  s2c` pin counts match per session.
- **pipeline-busy:** `POST /analyze` under a held pipeline lock → 409
  `pipeline-busy`, pipeline object untouched, `hub.analyze.rejected` pin.
  Happy-path `/analyze` re-runs the pipeline, swaps walls atomically, and the
  seam pins agree again on the NEW walls.
- **Roots are declared, never inferred:** unresolvable root name → hub
  `unknown-root` (logged `hub.pipeline.rejected`); module-id root passes hub
  resolution but the MODEL WALL refuses (`unknown-root`) — both diagnostics
  asserted.

## Pins asserted (by id)

Extractor: `extractor.wall.extract.return`, `extractor.t1.node.id`.
Graph-model: `graph-model.wall.ingest.accepted`,
`graph-model.wall.ingest.verify.nodeIds`, `graph-model.wall.query`,
`graph-model.wall.query.rejected`, `graph-model.wall.verdict`.
Hub (own log): `hub.pipeline.return`, `hub.pipeline.rejected`,
`hub.serve.graph`, `hub.serve.graph.refused`, `hub.serve.query`,
`hub.serve.query.refused`, `hub.serve.verdict`, `hub.serve.verdict.refused`,
`hub.pins.history.truncated`, `hub.analyze.accepted`, `hub.analyze.rejected`,
`hub.capability.attach`, `hub.lsp.frame.c2s`, `hub.lsp.frame.s2c`,
`hub.lsp.drop`, `hub.lsp.busy`.

## Bounds logged (no silent caps)

1. **/pins/history tail bound** — default 2000 events/stream (`?limit=N`);
   truncation flagged in the payload (`truncated`, `total`, `bound`) AND
   emitted as `hub.pins.history.truncated`. Tested at limit=1.
2. **LSP ledger raw retention** — sha256+length always; raw frame text kept
   only up to 65536 utf-8 bytes (`hub.lsp.frame.bound` when exceeded). The
   frame itself always passes through untruncated — only the diagnostic copy
   is bounded.
3. **pins JSON coercion** — `/pins/*` serialized with `default=str`
   (non-JSON diagnostic values textualized, never dropped). `/graph` is
   exempt: strict canonical serializer + id-set guard.
4. **Two listeners** — HTTP and WS on separate ephemeral ports (stdlib
   http.server cannot upgrade to WS); `/health` carries the WS url.
5. **Capability stream absent by default** — `/pins` reports
   `capability-layer: available:false` + reason until V1 attaches the real
   quartet; never fabricated.
6. **Analyze serialization** — runs are refused-when-busy, never queued;
   this is also how the capability wall's one-run-at-a-time lock is
   respected through the hub.

## Failure classes (seam catalog extended in ARCHITECTURE-PHASE2.md)

Exercised from the pre-existing catalog: `serializer-edge-drop`,
`envelope-version-mismatch`, `lsp-bridge-drop` (echo-level: lossy backend →
ledger audit mismatch → named + `hub.lsp.drop` pin), `schema-pin-mismatch`
(hub asserts the PIN before every pipeline run), plus typed passthroughs
(`roots-undeclared`, `unknown-root`, `unknown-query`, `unknown-node`,
`no-graph-ingested`).
**New, added to the catalog:** `pipeline-busy`, `lsp-backend-busy`
(single-instance backend, WS close 1013), `hub-bad-request`,
`unknown-endpoint`.

## V3 merge (pathing)

`vessels/pathing.py` landed in parallel (V3's agent) and is now the hub's
primary loader: `ensure_cell_on_path` (sys-path-shadowing guard),
`load_wall` (`proofgraph_wall_<cell>` aliases shared hub-and-vessels),
`load_schema_module("ids")`. The hub adds the scoped-alias trick to load
canonical `schema_tools.py` (its flat `from ids import …` fallback).
Local fallback retained only for pathing-absent checkouts; mechanism logged
via `hub.pathing`. Cross-checked: `vessels/test_v3_extractor_to_model.py`
16/16 OK alongside the hub in this arrangement.

## Cell changes

**None.** Zero labelled change requests; no file under `packages/*` touched.
Both connected cells' own suites re-run as a drift check:
graph-model `python -m unittest discover -s tests` → **113/113 OK**;
structure-extractor `python selftest/run_all.py --fast` → **102/102 OK**
(fast profile skips only the live-pyright oracle; full is 103 — no extractor
code changed by this vessel).

## Handoff notes (V1 / V2 / V4)

- V1: `run_pipeline(..., capability_fn=…)` and
  `HubServer.set_capability_fn(fn)` are the sockets; add the real quartet via
  `attach_capability_pins`.
- V2: implement the three-method backend protocol
  (`start(send_to_client)` / `client_frame(frame)` / `close()`) over the real
  capability Handle and pass it to `attach_lsp_backend` (instance mode gives
  the one-session bound for free). Framing already proven both directions.
- V4: `GET /graph` is the canonical feed — bytes are canonical-json of the
  model wall's envelope, id-set-guarded per request.
