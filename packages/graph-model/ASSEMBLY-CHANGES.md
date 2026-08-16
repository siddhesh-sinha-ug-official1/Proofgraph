# ASSEMBLY-CHANGES — graph-model (Phase 0 schema swap)

Date: 2026-07-20. Canonical source of truth: `packages/schema/`
(PIN: schemaVersion `v0`, schemaHash
`3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c`).

This cell is the PARENT of the canonical package — its `schema/schema.json`,
`src/ids.py`, and `src/validate.py` seeded it. The swap therefore re-points the
cell at the amended canonical content and pins it, keeping local copies only
where the cell's import boundary (importgate whitelist: stdlib + networkx +
rustworkx + own modules) forbids reaching outside, with byte-level sync tests
so drift explodes loudly.

## Swap pattern per artifact

| Artifact | Pattern | Sync mechanism |
| --- | --- | --- |
| `schema/schema.json` | (b) adopted canonical bytes | byte-identity test vs `packages/schema/schema.json` + hard-coded `check_pin` |
| `src/validate.py` | (b) adopted canonical bytes | byte-identity test vs `packages/schema/validate.py` |
| `src/ids.py` | (b) kept local, verified-in-sync | functional-segment (AST-scoped source) equality vs `packages/schema/ids.py` (module docstring exempt) + replay of all 8 `packages/schema/vectors.json` golden vectors through the local mint |
| `src/schema_tools.py` | (b) kept local, verified-in-sync | functional-segment equality vs `packages/schema/schema_tools.py` (import wiring exempt — see below) |
| `schema.md` | regenerated, never hand-edited | S0 codegen-drift gate: byte-regenerable from the adopted `schema.json` |
| `schema/graph-schema.ts` | (b) byte-mirrored from canonical projection | S0 codegen-drift gate + `test_canonical_sync` byte-identity vs `packages/schema/gen/graph-schema.ts` (see 2026-08-16 note) |

Pattern (a) (direct import of the canonical files) was NOT used: the importgate
statically AST-scans `src/**` and whitelists only {stdlib, networkx, rustworkx,
own}. The canonical `schema_tools.py` carries a flat-import fallback
(`from ids import …`) that the gate would flag as an out-of-boundary import,
and a cross-package `sys.path` splice inside `src/` would weaken the boundary
the gate exists to prove. Canonical files are read by PATH only, in tests.

## Files touched

- `schema/schema.json` — replaced with the canonical amended schema (v0 +
  v0.1 amendment blocks: `schemaRevision`, `outlineWorstOrder` split order,
  `outlinePolicy` (unrecognized token ranks WORST + reported; fused
  `none/green` banned from data), `worstTokenToStatus`,
  `unresolvedPlaceholder`, `idScheme`, and the fixed `provenance.resolved`
  description). Envelope const stays `"v0"`. Serves rulings 1, 4, 5, 6, 7.
- `src/validate.py` — replaced with the canonical validator: identical
  JSON-Schema subset plus the leads-segregation invariant (`resolved=false`
  never in `edges[]`, `resolved=true` never in `leads[]`). Serves ruling 3.
  All existing fixtures still validate (the cell already carried leads
  separately).
- `src/schemagen_core.py` — `generate_md` now DERIVES the worst-case-wins
  order, outline policy, and `worstTokenToStatus` mapping from the schema data
  (`outlineWorstOrder` etc.) instead of hand-carried prose that spelled the
  fused `none/green`. Serves rulings 1 and 4 (schema.json stays the single
  source of truth; the md is a projection). `generate_ts` untouched.
- `schema/graph-schema.ts` — regenerated via `python schema/schemagen.py`;
  byte-identical to before (the amendment adds no fields the TS projection
  reads). S0 codegen-drift gate green.
- `schema/schema.md` — regenerated; now carries the canonical schemaHash
  `3f312369…` (was `004b9d00…`) and the split worst-order section.
- `tests/test_schema_freeze.py` — added `test_canonical_assembly_pin`: the
  freeze now `check_pin`s against the hard-coded canonical PIN pair (updated
  from the pre-assembly hash `004b9d00…`). Same spirit as before: any future
  drift of `schema/schema.json` fails loudly. All pre-existing freeze tests
  kept unchanged.
- `tests/test_projection_roundtrip.py` — extended
  `test_validator_actually_rejects_nonconformance` with the two
  leads-segregation rejection cases now enforced by the adopted canonical
  validator (ruling 3). Additive: no assertion weakened.
- `tests/test_canonical_sync.py` — NEW: the sync membrane described in the
  table above, plus PIN-file agreement and a presence check so a missing
  canonical package fails rather than vacuously passing.
- `ASSEMBLY-CHANGES.md` — this record.

## Invariants held

- Probe catalog: 104 before, 104 after (no entry removed; no new runtime
  decision was introduced — the sync layer is tests, not probes).
- Golden node/edge ids unchanged (the canonical mint IS this cell's mint);
  additionally pinned by replaying `packages/schema/vectors.json`.
- Importgate green: observed imports unchanged; canonical files are read by
  path, never imported.
- `run_pipeline.py` demo green (141 events, 4 nodes / 1 edge / 0 leads,
  round-trip verdict pass).
- Full suite: 87/87 (baseline 79/79 + 8 new/extended sync & pin tests).

## Semantic changes (with the ruling that forced each)

1. `validate_graph` now rejects `resolved=false` inside `edges[]` and
   `resolved=true` inside `leads[]` (ruling 3, canonical envelope /
   leads-segregation). Previously such graphs passed the raw JSON-Schema pass.
2. Frozen schemaHash moved `004b9d00…` → `3f312369…` (adoption of the v0.1
   amendment; rulings 1, 4, 5, 6, 7 encoded as schema data). The version tag
   stays `v0`; the amendment is additive top-level metadata plus the
   `provenance.resolved` description fix.
3. Generated `schema.md` worst-order line is now the split canonical order
   `red > amber > blue > definition > lemma > none > green` (ruling 4);
   the fused `none/green` remains only as the documented banned token.

---

# ASSEMBLY-CHANGES — graph-model (Phase 1 wall)

Date: 2026-07-20. The cell's WALL: `wall.py` (`GraphModelWall` /
`create_wall`, `WALL_VERSION = "graph-model-wall/1.0.0"`), specified in
`MEMBRANE-SPEC.md`, conformance-tested in `tests/test_wall_conformance.py`.
Everything additive; the diagnostic quartet stays reachable via `wall.pins`.

## Files touched

- `wall.py` — NEW. The face: `ingest(nodes, edges, leads, roots)`
  (VERIFY-NOT-MINT: envelope validation via the cell's `validate.py`, edge/lead
  ids recomputed via the canonical mint and byte-compared, node-id
  format+uniqueness, `unresolved:` placeholder enforcement, S4 `green_guard`
  fake-green policy, declared-roots validation) · `query`
  (reachable/unused/sccs/condensation — `src/t3.py` library calls exactly,
  rustworkx+networkx crosscheck preserved) · `project` ('graph'/'flat';
  'text' honestly refused: `projection-unavailable-no-source`) ·
  `verdictOf` (pass-through, outline null preserved) · `pins` quartet.
  Asserts the canonical schema PIN at construction
  (failure class `schema-pin-mismatch`). All refusals are `WallRejection`
  (extends `GateFailure`, named failure classes) and are probed BEFORE raising.
- `src/probe/catalog.py` — ADDITIVE `_WALL_SEMANTIC` section: 12 new
  `graph-model.wall.*` leads (version, ingest.verify.nodeIds/edgeIds/leads,
  ingest.greenGuard, ingest.accepted/rejected, query, query.rejected, verdict,
  project, projection.refused). Catalog 104 → 116; the 104 baseline entries
  are byte-untouched and now also pinned by `BASELINE_CATALOG_SIZE`
  (asserted == 104 in the conformance test). The bus hard-rejects uncataloged
  emits, so the catalog was extended rather than bypassed.
- `src/probe/__init__.py` — exports `BASELINE_CATALOG_SIZE` (additive).
- `MEMBRANE-SPEC.md` — NEW one-page membrane spec: face, pins, honest-ceiling
  surface (incl. the node-preimage bound: full node-id preimage verification
  is impossible from Node fields alone; closed in Phase 2 via
  `extractor.t1.node.id` probes), failure classes, versioning, conformance.
- `tests/test_wall_conformance.py` — NEW (26 tests): pins-vs-face conformance
  (wall answers == the cell's own T3 probe payloads == the wall's `wall.*`
  pins; `verdictOf` == `dump()` fill), catalog additivity (104 intact + 12),
  schema-pin refusal on a tampered schema, and one test per failure class
  (id-mismatch, lead-in-edges both directions, lead-placeholder-violation,
  fake-green rejected / attested green allowed, graphjson-nonconformant,
  id-collision, unknown-root, roots-undeclared ⇒ no unused claim,
  no-graph-ingested, unknown-query/projection/node, text refusal), plus the
  documented honest bound (format-valid node id with drifted preimage is
  accepted — never fake-verified).
- `tests/test_harness.py` — the two exact catalog-count assertions updated
  104 → 116 (the catalog GREW additively; no entry removed, no assertion
  weakened — same spirit as the Phase-0 pin-hash update).
- `ASSEMBLY-CHANGES.md` — this record.

## Invariants held

- Probe catalog: 104 baseline entries all present and unchanged; 12 wall
  leads added (116 total). No pin deleted; no existing export renamed.
- Wall policy decisions probed: every rejection emits
  `wall.ingest.rejected` / `wall.query.rejected` / `wall.projection.refused`
  with the named failure class before raising.
- Honest ceiling propagates: unknown fills pass through as unknown; outline
  null preserved; no roots → `roots-undeclared` (never an inferred root, never
  a silent empty claim); text projection refused, never faked; green requires
  origin=checked + attesting fill.source (else `fake-green`).
- `run_pipeline.py` demo green (141 events, catalogLeads 116, 4 nodes /
  1 edge / 0 leads, round-trip verdict pass).
- Full suite: 113/113 (87 baseline + 26 wall conformance/rejection tests).

## SUB200 restructure (2026-08-02, adversarial-round prep)

Behavior-preserving file splits only — no semantic change, no public-surface
rename, no catalog entry added/removed/reordered, no test dropped or weakened.
Every non-exempt source file in the cell now lands under 200 lines.

- `wall.py` 400 → facade `wall.py` (37) re-exporting the full public surface
  (`WALL_VERSION`, `SCHEMA_PIN_VERSION/HASH`, `UNRESOLVED_PREFIX`,
  `QUERY_KINDS`, `PROJECT_KINDS`, `WallRejection`, `GraphModelWall`,
  `create_wall`) from the new `src/wall/` package:
  `src/wall/base.py` (86: constants, schema PIN, failure classes, `_WallPins`,
  probe-before-raise refusal mixin), `src/wall/ingest.py` (143:
  verify-not-mint ingest incl. greenGuard), `src/wall/queries.py` (143:
  query/project/verdictOf), `src/wall/core.py` (49: class assembly +
  `create_wall`), `src/wall/__init__.py` (12). The package lives under
  `src/` (not a top-level `wall/` dir) so the facade file keeps its path for
  `pathing.load_wall("graph-model")` / hub file-loads AND `import wall` never
  gets shadowed by a same-named package; importgate scans the new modules
  (own-module imports only — gate green).
- `src/probe/catalog.py` 259 → aggregator `catalog.py` (59) + section modules
  `src/probe/leads_pipeline.py` (82: 6.1–6.4), `src/probe/leads_analysis.py`
  (104: 6.5–6.9), `src/probe/leads_wall.py` (44: wall.*). Assembled CATALOG
  verified element-for-element identical (same ids, kinds, payloadTypes,
  descriptions, same order) against the pre-refactor `out/probe_catalog.json`;
  116 entries, baseline 104 — unchanged.
- `tests/test_wall_conformance.py` 382 → `test_wall_conformance.py` (154:
  pins-vs-face, 9 tests) + `test_wall_standsup.py` (60: construction/PIN/
  additive catalog, 3 tests) + `test_wall_rejections.py` (165: named failure
  classes, 13 tests) + shared `tests/wall_testkit.py` (39: probe readers +
  minted node/lead builders). 25 tests before and after.
- `tests/test_pipeline_probes.py` 234 → `test_pipeline_probes.py` (97:
  S1–S2, 11 tests) + `test_pipeline_probes_edges_fill.py` (151: S3–S4 +
  honest ceiling, 15 tests). 26 tests before and after.
- `tests/test_harness.py` 214 → `test_harness.py` (113: import gate,
  determinism, stage boundaries, 8 tests) + `test_harness_catalog.py` (114:
  catalog enforcement + introspection/redaction, 10 tests). 18 tests before
  and after.

Verification: suite 113/113 green (count unchanged); `run_pipeline.py` demo
green; vessels `test_v3_extractor_to_model.py` 16/16 and `hub/test_hub.py`
44/44 (1 skip, pre-existing) green with ZERO changes outside this cell;
`packages/schema` `schemagen.py --check` exit 0 (byte-identical); goldens
untouched; sync-gated `src/ids.py` / `src/validate.py` / `src/schema_tools.py`
untouched (all <200 anyway).

---

# ASSEMBLY-CHANGES — graph-model (Wave-A pre-GitHub remediation, cluster-U1)

Date: 2026-08-16. Reason: `schema/graph-schema.ts` had drifted 119 lines from
the canonical projection `packages/schema/gen/graph-schema.ts` — the v0.1
amendment (SCHEMA_REVISION, NODE_KINDS/EDGE_KINDS/OUTLINE_WORST_ORDER arrays,
worstOfVerdict, the Graph/Lead envelope) landed canonically but the cell carried
a SECOND, divergent TS generator (`src/schemagen_core.generate_ts`) that emitted
the pre-amendment format, and NOTHING gated the gap (S0 only byte-compared the
file against the cell's own old generator). The cell's TS projection is imported
by nothing (every TS consumer in the tree resolves
`packages/schema/gen/graph-schema.ts`), so the divergent generation was retired
and the file is now a byte-MIRROR of canonical, gated loudly.

## Files touched
- `schema/graph-schema.ts` — replaced with the byte-identical canonical
  projection (sha256 `f6da50fb…`). No longer cell-generated.
- `src/schemagen_core.py` — retired `generate_ts` and `_quote_union` (the
  divergent TS generator); `regenerate()` now yields only `schema.md`. Docstring
  records why graph-schema.ts is byte-mirrored, not generated.
- `src/stages/s0_schema.py` — the codegen-drift gate for graph-schema.ts now
  byte-checks against `packages/schema/gen/graph-schema.ts` (read by PATH,
  mirroring how ids.py/validate.py are sync-gated), bootstrap-writing the mirror
  if absent and raising `codegen-drift` on any divergence; a missing canonical
  projection is itself a named `codegen-drift` failure. `_parse_ts_kinds` updated
  to read the canonical `NODE_KINDS`/`EDGE_KINDS` array form for the crosscheck.
  The `graph-model.schema.codegen` probe now truthfully names schema.md; load.ts
  carries the canonical bytes so its sha256 makes the mirror observable.
- `schema/schemagen.py` — CLI now mirrors graph-schema.ts from canonical after
  regenerating schema.md (idempotent; verified no tracked-file change).
- `tests/test_canonical_sync.py` — NEW `test_graph_schema_ts_byte_identical`:
  byte-identity vs `packages/schema/gen/graph-schema.ts` (the loud drift gate).
- `tests/test_schema_freeze.py` — `test_codegen_wire_byte_regenerable` updated
  (regenerate() now only schema.md; probe `to` == schema.md) + NEW
  `test_graph_schema_ts_mirrors_canonical` (file byte-mirror + load.ts sha256).
- `src/probe/leads_pipeline.py` — descriptions of the (unchanged) codegen and
  load.ts catalog entries updated to name the canonical mirror. No probe added
  or removed — catalog stays 116, baseline 104.

## Invariants held
- Probe catalog: 116 before, 116 after (extend-don't-shrink; nothing removed).
- No canonical files touched (`packages/schema` `schemagen_cli.py --check` exit 0).
- Suite 113 → 115 (+2 additive sync tests); `run_pipeline.py` demo green
  (round-trip verdict pass, crosscheck agrees). Drift gate proven to fire
  (`codegen-drift`) on a mutated mirror, then restored byte-identical.

## Semantic change (with the finding that forced it)
- graph-schema.ts's on-disk content changed from the stale pre-amendment format
  to the canonical v0.1 projection (cluster-U1: the "two schemas" stop
  condition). This is a projection-surface correction: the cell's schema.json
  and mint were already canonical; only the unread TS surface was stale. Drift
  can no longer be silent — S0 and test_canonical_sync both gate it against
  canonical.

## 2026-08-16 — pre-GitHub cleanup (remediation Wave A, cluster G10)

Deleted the stale generated `out/` directory contents (dump.json, flat.json,
graph.json, probe_catalog.json, probes.jsonl, t3result.json, text.txt — carried
build-machine `A:\` paths). `out/` is generated run firehose (excluded in
INTEGRATION-MANIFEST + linegate manifest) and is regenerated by
`run_pipeline.py`; it is now `.gitignore`d so it never ships. No source change.
