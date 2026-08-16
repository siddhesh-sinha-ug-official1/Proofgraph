# REPORT — Phase 3: the programmatic face + emergent layer (Python outer wall)

Laid 2026-07-20 · assembly code only (`proofgraph/outerwall/` + additive hub
edits). Cells NOT modified (binding rule honored — zero edits under
`packages/<cell>/`; the one cell-level friction found was worked around in
assembly code and logged as a named BOUND, see below).

## What was laid

`proofgraph/outerwall/` — `__init__.py` (outer probe log + named failure
classes + canonical schema loaders), `analyze.py`, `outline.py`, `gap.py`,
`provenance.py`, `system_pins.py`, `test_outerwall.py` (stdlib unittest,
**30/30 OK**, ~20s warm incl. one LIVE pyright moat run and two live cell-2
python measurements). Hub additions (ADDITIVE): `GET /analysis` +
`attach_analysis()` (canonical bytes, typed `no-analysis-computed` refusal),
`HubLog.tap()`, three new hub probes — `hub/test_hub.py` re-run **36/36 OK**
(34 baseline + 2 additive).

### analyze(source_root, roots=None, config=None)

Exactly the OUTERWALL-CONTRACT shape: `{graph, verdicts, provenance,
gapAnalysis}`, pure-JSON, canonical-serializable. Composition:
`hub/pipeline.run_pipeline` with the **REAL V1 capability feed**
(`vessels/v1_capability_extractor.V1CapabilityFeed`) — python is MEASURED
live by cell 2 (CT earned through its own P0–P11 battery; the measuredTier
pin snapshot rides in `provenance.capability.python.measuredTierPin`), lean
is cell-2-refused -> extractor stub as V1's RECORDED fallback (`measuredBy:
local-stub`, refusal pin events carried), unknown-to-both stays a typed
refusal. analyze() owns the feed lifecycle (`shutdown()` in `finally`;
shutdown pins in the session). Cell-2 pin streams are SNAPSHOTTED before
shutdown (the V1 report's bound 4 — module-global last-run state cannot rot
the evidence).

Companion face: `analyze_session(...)` returns the analysis PLUS the live
walls/logs (what `system_pins()` aggregates); `analyze()` = its
`["analysis"]`.

### outline.py — RULING 8, precisely

Reflexive-transitive base over resolved edges, computed with **rustworkx
0.18** and crosschecked per node against **networkx 3.6.1** — the
two-library idiom applied to the closure itself (disagreement = new
build-failing class `outline-closure-disagreement`; agreement pinned on
`outerwall.outline.closure`). Tokens ONLY from the frozen 7-token
vocabulary (fill red/amber/blue -> that token; green -> `lemma` for theorem
kind / `definition` otherwise; empty set -> `none`); fill `unknown` acts on
STATUS only via the ruling-8 fill severity red<amber<blue<unknown<green;
any lead out of the base CAPS status at unknown + lands in
`incompleteBases`. Statuses via canonical `WORST_TOKEN_TO_STATUS` /
`worst_of_verdict` from `packages/schema/gen/schema_constants.py`. A
non-vocabulary string anywhere (including the banned fused `none/green`,
including a bogus fill status) is the build-failing class
**outline-vocabulary-leak** — tested directly.

The filled graph is **RE-INGESTED through the model wall** (full
re-verification: schema, id recompute, leads segregation, fake-green gate),
so face == pins == served: `/graph` on the same wall now serves the
outline-FILLED envelope, `verdictOf` returns the filled outline, and the
graph still passes `packages/schema/validate.py` (outline sub-schema
required+closed) — asserted in the suite.

### gap.py — strictly the model wall's query()

unused/unreferenced/reachable/sccs/condensation are the WALL's own numbers
(its rustworkx+networkx crosscheck and condensation-is-DAG gate stand behind
each; isDAG re-asserted). `unreferenced` = the hub's documented alias of
`unused`, recorded in the payload. No declared roots -> the wall's typed
`roots-undeclared` refusal is taken as the answer: `[]` + `undeclared`
marker, nothing inferred. blindSpots + soundnessNote surfaced VERBATIM from
the cells (model unused query; `extractor.t3.soundness.blindspots` pins;
per-dock honestCeilings) — never summarized.

**Decl-universe finding (logged bound):** the model wall's query universe is
decl nodes only, so richpkg's REAL cycle (`richpkg.core` <-> 
`richpkg.helpers`, module-level imports) cannot surface through
`query('sccs')` — decl SCCs are all singletons. It surfaces VERBATIM in
`cycles.extractorT3` from cell 3's own crosschecked t3 diagnosis
(`pins.dump()['t3']` — computed by the CELL, nothing re-implemented), and
the bound is pinned on `outerwall.gap.declUniverse.bound`. Cycle visible;
honesty intact.

### provenance.py

Every node and every edge/lead -> `{cell, tier, extractor, resolved}` (+
lang/kind/origin/resolver), per-lang capability measurement provenance
(measuredBy + evidence pin refs), per-dock honest ceilings verbatim, V1
bounds (`duplicated-subprocess`, `no-grammar-floor`) carried, typed refusals
for unclaimed files. MISSING provenance on any element = build-failing
**provenance-hole** (`assert_no_holes`, tamper-tested, pinned).

### system_pins.py — cellId `system.outerwall`

`probeCatalog()/dump()/history()/tap()` aggregating: outer wall's own
emissions + hub probes + extractor/model wall quartets + cell-2 per-lang pin
snapshots (25+29+137+116+91 catalog entries on a python run). Bounds LOGGED
not silent: per-stream tail bound + per-payload byte bound; oversized
payloads replaced by `{truncated, sha256, byteLen}` and every application
pinned on `outerwall.bound.logged`. `tap()` routes to the owning stream
(hub tap is the additive `HubLog.tap`). **`trace(nodeId)`** reads
`vessels/TRACE-node.json` and EXTENDS the V4 mechanism: byte-identical
appearances at every hop with pin refs — extraction preimage pin -> model
pin surface (`idInRootIds`) -> analyze() canonical bytes (id byte offsets +
payload sha256) -> hub log. On `n_ccb26550281c06b8` the recorded V4 seed is
verified (same idUtf8Bytes, same preimage) and the analysis hop appended —
`byteIdenticalEverywhere: true`.

## The three mandated inputs (+1)

| Input | Proven |
|---|---|
| `acceptance/fixtures/moatpkg` (LIVE pyright, real V1 CT) | unused == EXACTLY `moatpkg.helpers.unused_fn`'s decl node; `used_fn`/`main`/`side_calc` reachable; every outline.status `unknown` (no verdict compiler attached — honest) with worstOf `["none"]` (non-empty, ruling 8); filled graph validates against `packages/schema/validate.py`; verdicts == wall verdictOf; ZERO green; CT provenance measured-not-asserted |
| `packages/structure-extractor/fixtures/pyrich` (recorded pyright, live cell-2 measurement) | module cycle `[richpkg.core, richpkg.helpers]` visible in `gapAnalysis.cycles.extractorT3` (decl-universe bound logged); importlib blind spot: `plugin_entry`+`load_plugin` in unused AND "dynamic import" in blindSpots verbatim; `load_plugin` lead-capped in incompleteBases; V4 trace reproduced + extended |
| `acceptance/fixtures/unused_hyp.lean` (G tier) | nodes + leads ONLY (edges == []); all fills+outlines unknown; LITERALLY zero green in verdicts; incompleteBases populated for every node with a lead out; unused/unreferenced `[]` + `undeclared` marker (wall refusal `roots-undeclared` recorded); lean stub-fallback RECORDED (measuredBy local-stub, cell-2 refusal pin events) |
| `.xyz` unknown-language dir | typed refusal in `provenance.refusals` (`unknown-language`, file named); empty graph; no crash; no green |

Plus: `GET /analysis` == `canonical_json(analyze(...))` byte-for-byte on the
live hub (typed 503 `no-analysis-computed` before attach), asserted against
the hub's own probe stream.

## Roots vocabulary (extended one honest step, logged)

Contract root `["moatpkg.core"]` is MODULE vocabulary; model-wall roots are
decl ids (V3's root-vocabulary-mismatch). `analyze()` resolves: canonical id
-> passthrough; unique decl name -> id; MODULE name/id -> its direct decl
members (`moatpkg.core` -> `{main, side_calc}`), every decision pinned on
`outerwall.roots.resolve`; anything else -> typed `unknown-root`. Declared,
never inferred.

## Bounds logged (no silent caps)

1. **package-root-uri-mismatch** (NEW, catalogued): cell 3 detects a python
   package's PARENT as project root but builds pyright didOpen URIs from
   ingest-root-relative paths — extracting `.../moatpkg` DIRECTLY mis-roots
   the URIs and live call resolution degrades to leads (measured:
   `definition@6:19` -> `[]`; leads `unresolved:helpers.used_fn`).
   Assembly-level fix: analyze() stages such a root under a scratch parent
   (per-file sha256 + byte-identity pinned on `outerwall.root.staged`;
   ids/spans invariant — preimages use project-root-relative paths).
   Fixing the cell (`pyright_backend` URI construction) would be cytoplasm
   work — recorded here as the candidate Phase-3+ cell change request, NOT
   applied.
2. **decl-universe bound** (gap.cycles) — see gap.py section; pinned per run.
3. **single-file source roots** are staged the same way (the extractor walks
   directories); logged identically.
4. system-pins aggregation bounds (stream tail + payload bytes) — logged via
   `outerwall.bound.logged` with sha256/byteLen evidence, tested.
5. Cell-2 stream snapshots taken pre-shutdown (V1 bound 4 carried forward).

## Failure classes (seam catalog extended in ARCHITECTURE-PHASE2.md)

NEW: `outline-vocabulary-leak` · `outline-closure-disagreement` ·
`provenance-hole` (all build-failing, all tested) · `bad-source-root` ·
`no-analysis-computed` (hub additive, tested both suites) ·
`package-root-uri-mismatch` (BOUND, logged not raised).
EXERCISED: `unknown-language` (xyz + lean), `roots-undeclared` (lean),
`unknown-root` (never guessed), `silent-tier-upgrade` (structurally, via V1).

## Suites (end state, all green)

- Outer wall: `python outerwall/test_outerwall.py` -> **30/30 OK** (~20s warm;
  MOAT live pyright + two live cell-2 python measurements + recorded RICH).
- Hub: `python hub/test_hub.py` -> **36/36 OK** (34 + 2 additive; re-run after
  every hub edit).
- Cells: UNMODIFIED this phase (no cell suite invalidated; hub/outerwall code
  only). Concurrent human-face work touched `hub/server.py` (fixed dev ports,
  CORS) — these edits were rebased onto, not reverted; hub suite green on the
  merged file.