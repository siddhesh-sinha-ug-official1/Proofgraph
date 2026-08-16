# REPORT-SUB200 — packages/structure-extractor

Adversarial-round prep: every non-exempt source file brought UNDER the
200-line hard ceiling (target ~135–150) by cohesion splits with facades.
BEHAVIOR-PRESERVING: no semantic change, no public-surface rename, no
assertion touched, comments/docstrings kept in place.  External importers
(vessels/hub/outerwall/graph-model tests) need ZERO changes — verified by
loading + extracting through `vessels/pathing.py` post-split.

## Splits (old → new)

1. `extractor/docks/lean_dock.py` 796 → facade 121 + `lean_common` 56 +
   `lean_ct_driver` 89 + `lean_verdicts` 133 + `lean_ct_fill` 94 +
   `lean_ct_edges` 194 + `lean_ct` 162 + `lean_g` 128
   (CT driver-invocation+parsing / verdict mapping / edge-minting / G-path,
   as assigned; dock registry name stable).
2. `extractor/t1/extract.py` 451 → facade 146 + `common` 71 +
   `interpret_code` 133 + `interpret_docs` 138.
3. `extractor/docks/python_dock.py` 416 → facade 153 + `python_grimp` 108 +
   `python_pyright_path` 174 + `python_ceiling` 57.
4. `wall.py` 356 → facade 186 + `extractor/wall_support.py` 150 +
   `extractor/wall_pin.py` 67 (helpers inside the `extractor` package so
   pathing's top-package shadowing guarantees cover them).
5. `extractor/docks/pyright_backend.py` 332 → facade 33 + `pyright_common`
   85 + `pyright_lsp` 187 + `pyright_recorded` 74.
6. `extractor/probe/catalog.py` 334 → aggregator 27 + 4 section modules
   (80/101/115/69).  Assembled CATALOG asserted element-for-element
   identical to the pre-split module: 149 entries, same ids, same order.
7. `extractor/probe/bus.py` 210 → 136 + `events` 96.
8. `extractor/pipeline.py` 281 → 193 + `pipeline_config` 47 +
   `pipeline_docks` 73 (docks mapping stays a call-time parameter so the
   `pipeline_mod.ALL_DOCKS` forged-dock test seam still works).
9. `extractor/schema.py` 259 → 190 + `schema_ids` 85.
10. `extractor/t3.py` 230 → 178 + `t3_checks` 90.
11. `selftest/test_lean_ct_dock.py` 449 → 150 + `test_lean_ct_guards` 175 +
    `test_lean_decl_match` 139 + shared `lean_ct_common` 28.
12. `selftest/test_wall_conformance.py` 346 → 172 + `test_wall_face` 168 +
    shared `wall_test_common` 31.
13. `selftest/test_schema_sync.py` 230 → 135 + `test_schema_rulings` 87 +
    shared `schema_sync_common` 33.

## Exemptions

- `extractor/docks/lean_driver/Driver.lean` — proven artifact; untouched.
- fixtures, goldens, `richpkg.recorded.json` recording, lean-toolchain —
  untouched, byte-stable.

## Suite

- `python selftest/run_all.py` (FULL: live pyright + live lean CT driver):
  **140/140 OK** — same count as the pre-restructure baseline (no test
  dropped, none weakened; run_all auto-discovers the new test files).
- Goldens byte-stable (asserted green by test_golden); CT + wall
  history-determinism tests green.
- `packages/schema` `schemagen.py --check`: exit 0, "8 generated artifacts
  in sync" (nothing in packages/schema touched).
- Probe catalog: 149 entries identical; pre-wall census 143 + 6 wall probes.

## Verification table (every .py in the area; ceiling = 200)

| File | Lines |
|---|---|
| extractor/docks/lean_ct_edges.py | 194 |
| extractor/pipeline.py | 193 |
| extractor/schema.py | 190 |
| extractor/docks/pyright_lsp.py | 187 |
| wall.py | 186 |
| extractor/assemble.py | 183 |
| selftest/harness.py | 180 |
| extractor/t3.py | 178 |
| selftest/test_t1.py | 176 |
| selftest/test_lean_ct_guards.py | 175 |
| extractor/docks/python_pyright_path.py | 174 |
| selftest/test_wall_conformance.py | 172 |
| selftest/test_honest_ceiling.py | 171 |
| extractor/ingest.py | 170 |
| extractor/docks/lean_driver/run_smoke.py | 169 |
| selftest/test_wall_face.py | 168 |
| selftest/test_connectors.py | 164 |
| extractor/docks/lean_ct.py | 162 |
| extractor/docks/python_dock.py | 153 |
| selftest/test_lean_ct_dock.py | 150 |
| extractor/wall_support.py | 150 |
| extractor/t1/extract.py | 146 |
| extractor/docks/base.py | 146 |
| selftest/test_lean_decl_match.py | 139 |
| extractor/t1/interpret_docs.py | 138 |
| extractor/probe/bus.py | 136 |
| selftest/test_schema_sync.py | 135 |
| extractor/docks/latex_dock.py | 135 |
| extractor/t1/interpret_code.py | 133 |
| extractor/docks/lean_verdicts.py | 133 |
| extractor/docks/lean_g.py | 128 |
| extractor/docks/typst_dock.py | 125 |
| extractor/docks/lean_dock.py | 121 |
| extractor/probe/catalog_docs_graph.py | 115 |
| extractor/docks/python_grimp.py | 108 |
| selftest/test_t3.py | 105 |
| selftest/test_probe_bus.py | 101 |
| extractor/probe/catalog_docks.py | 101 |
| extractor/boundary.py | 97 |
| extractor/probe/events.py | 96 |
| extractor/docks/lean_ct_fill.py | 94 |
| extractor/t1/engine.py | 92 |
| extractor/t3_checks.py | 90 |
| extractor/docks/lean_ct_driver.py | 89 |
| selftest/test_schema_rulings.py | 87 |
| extractor/schema_ids.py | 85 |
| extractor/docks/pyright_common.py | 85 |
| selftest/test_live_pyright_oracle.py | 80 |
| extractor/probe/catalog_stages.py | 80 |
| selftest/test_skeleton_trace.py | 79 |
| extractor/docks/pyright_recorded.py | 74 |
| extractor/pipeline_docks.py | 73 |
| extractor/t1/common.py | 71 |
| extractor/capability.py | 70 |
| extractor/probe/catalog_output_infra.py | 69 |
| extractor/wall_pin.py | 67 |
| extractor/docks/reasons.py | 66 |
| selftest/test_provenance.py | 61 |
| extractor/docks/python_ceiling.py | 57 |
| extractor/docks/lean_common.py | 56 |
| selftest/tools/gen_goldens.py | 54 |
| selftest/test_boundary.py | 53 |
| selftest/test_golden.py | 52 |
| extractor/pipeline_config.py | 47 |
| selftest/schema_sync_common.py | 33 |
| extractor/docks/pyright_backend.py | 33 |
| selftest/wall_test_common.py | 31 |
| run_skeleton.py | 31 |
| selftest/run_all.py | 28 |
| selftest/lean_ct_common.py | 28 |
| extractor/probe/catalog.py | 27 |
| extractor/probe/__init__.py | 23 |
| extractor/__init__.py | 9 |
| extractor/docks/__init__.py | 7 |
| extractor/t1/__init__.py | 1 |
| extractor/docks/lean_driver/Driver.lean | exempt: proven driver artifact |
| fixtures/** (goldens, recordings, lean/py/tex/typ sources) | exempt: fixtures/goldens/recordings |

No file over 200.  No bug observed during the round that needed deferral.

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 8 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: extractor/schema.py 190→192; extractor/assemble.py 183→187; extractor/ingest.py 170→171; selftest/test_wall_face.py 168→169; extractor/probe/catalog_docks.py 101→102; selftest/test_provenance.py 61→66; extractor/probe/catalog.py 27→28; extractor/__init__.py 9→10. 'No file over 200' still true (area max 194, lean_ct_edges.py). CATALOG re-imported live: 149 entries. All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
