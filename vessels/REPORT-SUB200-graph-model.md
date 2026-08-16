# REPORT-SUB200 — packages/graph-model

Adversarial-round prep: every non-exempt source file in the area now under the
200-line hard ceiling. Behavior-preserving splits only; facades keep every
original module path; external importers (vessels, hub, outerwall, tests)
needed ZERO changes.

## Splits performed

| old file (lines) | new modules (lines) |
|---|---|
| wall.py (400) | wall.py facade (37) + src/wall/__init__.py (12) + src/wall/base.py (86) + src/wall/ingest.py (143) + src/wall/queries.py (143) + src/wall/core.py (49) |
| src/probe/catalog.py (259) | catalog.py aggregator (59) + leads_pipeline.py (82) + leads_analysis.py (104) + leads_wall.py (44) |
| tests/test_wall_conformance.py (382) | test_wall_conformance.py (154) + test_wall_standsup.py (60) + test_wall_rejections.py (165) + wall_testkit.py helper (39) |
| tests/test_pipeline_probes.py (234) | test_pipeline_probes.py (97) + test_pipeline_probes_edges_fill.py (151) |
| tests/test_harness.py (214) | test_harness.py (113) + test_harness_catalog.py (114) |

Facade guarantees:

- `wall.py` remains at `packages/graph-model/wall.py` and re-exports the full
  surface (`WallRejection`, `create_wall`, `GraphModelWall`, `WALL_VERSION`,
  `SCHEMA_PIN_VERSION`, `SCHEMA_PIN_HASH`, `UNRESOLVED_PREFIX`, `QUERY_KINDS`,
  `PROJECT_KINDS`) with explicit `__all__`. The implementation package sits at
  `src/wall/` (NOT a top-level `wall/` dir) so `pathing.load_wall` file-loads
  and bare `import wall` both keep resolving to the facade file, and the
  importgate (which scans `src/**`) covers the new modules — gate green.
- `src/probe/catalog.py` remains and still exports `CATALOG`, `CATALOG_BY_ID`,
  `BASELINE_CATALOG_SIZE`, `CELL_ID`, `STAGES` (plus internal `_SEMANTIC` /
  `_WALL_SEMANTIC` spliced from the section modules in the frozen order).

## Catalog identity proof

Assembled `CATALOG` compared entry-by-entry (dict equality, order included)
against the pre-refactor artifact `out/probe_catalog.json`: **identical** —
116 entries, `BASELINE_CATALOG_SIZE` 104, 12 additive `wall.*` leads. Counts
asserted unchanged by `test_wall_standsup.py`, `test_harness_catalog.py`, and
`hub/test_hub.py` (catalogSize 116).

## Suite results (end state)

- `python -m unittest discover -s tests`: **113/113 OK** (old 113 → new 113;
  test count preserved across all splits: wall 25, pipeline-probes 26,
  harness 18 — no assertion weakened).
- `python run_pipeline.py fixtures/sample.py fixtures/roots.json`: green
  (round-trip verdict pass).
- Cross-area (no changes needed there): `vessels/test_v3_extractor_to_model.py`
  16/16 OK; `hub/test_hub.py` 44/44 OK (1 pre-existing skip).
- `packages/schema` `schemagen.py --check`: exit 0, 8 artifacts byte-identical.
- Goldens untouched.

## Exemptions relied on

- `schema/graph-schema.ts` — generated projection (schemagen output).
- `schema/schema.json`, `schema/schema.md` — frozen constitution artifacts
  (generated/data; byte-stability gated by test_schema_freeze).
- `out/*` — generated run artifacts.
- `fixtures/*.manifest.json`, `fixtures/*.roots.json` — fixture data.
- Sync-gate note: `src/ids.py` (93), `src/validate.py` (95),
  `src/schema_tools.py` (39) are byte/functional-sync-gated against
  packages/schema (test_canonical_sync) — NOT split, NOT touched; all already
  under 200 so no line-ceiling exemption was needed.

## Verification table (every .py in the area)

| file | lines |
|---|---|
| wall.py | 37 |
| run_pipeline.py | 62 |
| schema/schemagen.py | 24 |
| src/__init__.py | 3 |
| src/cell.py | 140 |
| src/errors.py | 23 |
| src/ids.py | 93 (sync-gated, untouched) |
| src/importgate.py | 65 |
| src/schema_tools.py | 39 (sync-gated, untouched) |
| src/schemagen_core.py | 181 |
| src/t3.py | 77 |
| src/validate.py | 95 (sync-gated, untouched) |
| src/probe/__init__.py | 7 |
| src/probe/bus.py | 105 |
| src/probe/catalog.py | 59 |
| src/probe/leads_pipeline.py | 82 |
| src/probe/leads_analysis.py | 104 |
| src/probe/leads_wall.py | 44 |
| src/wall/__init__.py | 12 |
| src/wall/base.py | 86 |
| src/wall/core.py | 49 |
| src/wall/ingest.py | 143 |
| src/wall/queries.py | 143 |
| src/stages/__init__.py | 14 |
| src/stages/s0_schema.py | 114 |
| src/stages/s1_ingest.py | 108 |
| src/stages/s2_node.py | 97 |
| src/stages/s3_edge.py | 86 |
| src/stages/s4_fill.py | 63 |
| src/stages/s5_t3.py | 120 |
| src/stages/s6_project.py | 125 |
| src/stages/s7_roundtrip.py | 96 |
| fixtures/make_fixtures.py | 119 |
| fixtures/sample.py | 10 (fixture input) |
| fixtures/sample_reflowed.py | 11 (fixture input) |
| fixtures/rejected_ref.py | 2 (fixture input) |
| fixtures/unresolved_ref.py | 2 (fixture input) |
| tests/context.py | 39 |
| tests/wall_testkit.py | 39 |
| tests/test_canonical_sync.py | 148 |
| tests/test_goldens.py | 63 |
| tests/test_harness.py | 113 |
| tests/test_harness_catalog.py | 114 |
| tests/test_pipeline_probes.py | 97 |
| tests/test_pipeline_probes_edges_fill.py | 151 |
| tests/test_projection_roundtrip.py | 151 |
| tests/test_reformat.py | 58 |
| tests/test_schema_freeze.py | 108 |
| tests/test_t3.py | 83 |
| tests/test_wall_conformance.py | 154 |
| tests/test_wall_rejections.py | 165 |
| tests/test_wall_standsup.py | 60 |

Max non-exempt file: 181 lines (src/schemagen_core.py, pre-existing). Ceiling
holds everywhere.

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 5 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: src/cell.py 140→141; src/errors.py 23→24; src/importgate.py 65→67; src/stages/s6_project.py 125→127; src/stages/s7_roundtrip.py 96→98. Max non-exempt file is still 181 (src/schemagen_core.py); catalog re-verified 116 entries / BASELINE_CATALOG_SIZE 104 / 12 graph-model.wall.* leads. All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
