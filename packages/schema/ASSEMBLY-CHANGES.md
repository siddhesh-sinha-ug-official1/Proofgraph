# packages/schema — assembly changes

## SUB200 restructure (2026-08-02)

Behavior-preserving split so every non-exempt source file lands under 200
lines.  Templates and generators moved VERBATIM; `python schemagen.py --check`
exits 0 (all 8 generated artifacts byte-regenerable, gen/* + PIN untouched).

- `schemagen.py` 774 → facade (66) re-exporting the full former surface from:
  - `schemagen_common.py` (69) — `_fill`, `_ts_str_array`, `_py_str_tuple`,
    `_py_value`, `_schema_facts`
  - `schemagen_ts_graph.py` (145) — `_GRAPH_SCHEMA_TS`, `generate_graph_schema_ts`
  - `schemagen_ts_ids.py` (150) — `_IDS_TS`, `generate_ids_ts`
  - `schemagen_py_constants.py` (94) — `_SCHEMA_CONSTANTS_PY`,
    `generate_schema_constants_py`
  - `schemagen_capability.py` (86) — `_CAPABILITY_PY`, `_CAPABILITY_TS`,
    `generate_capability_constants_{py,ts}`
  - `schemagen_pin.py` (66) — `_PIN_TS`, `generate_pin_ts`, `generate_pin`
  - `schemagen_md.py` (150) — `_SCHEMA_MD`, `generate_md`
  - `schemagen_cli.py` (90) — `regenerate`, `load_sources`, `main`
  The CLI (`python schemagen.py --write|--check`) is unchanged.
- `tests/test_schema_package.py` 324 → split by concern into
  `test_codegen_sync.py`, `test_pin_gate.py`, `test_id_vectors.py`,
  `test_worst_of_policy.py`, `test_constants_sync.py`,
  `test_validate_graph.py`, `test_capability_seam.py` + shared
  `tests/context.py` (sys.path setup, JSON loads, VERDICT_CASES).
  `tests/test_schema_package.py` remains as a runner facade (the historical
  `python tests/test_schema_package.py` entry point used by
  run_all_suites.py) that discovers the split files; under
  `python -m unittest discover -s tests` it contributes zero duplicate tests.
  Count unchanged: 23 → 23.
- `tests/schema-package.test.ts` 208 → `id-mint.test.ts`,
  `outline-policy.test.ts`, `pin-capability.test.ts` + shared
  `tests/context.ts` (JSON loads, vector interfaces, VERDICT_CASES).
  `node --test "tests/*.test.ts"` still picks everything up (the old file is
  superseded).  Count unchanged: 14 → 14.
- VERDICT_CASES stays byte-identical across `tests/context.py` and
  `tests/context.ts` (cross-language outline-policy agreement gate).
- ids.py / validate.py / pin.py / schema_tools.py untouched (already <200;
  ids.py + validate.py are sync-gated with the graph-model cell —
  graph-model `test_canonical_sync` re-run green, 7/7; capability-layer
  gate 13 re-run green, 11/11).
