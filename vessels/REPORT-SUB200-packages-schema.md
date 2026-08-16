# REPORT-SUB200 — packages/schema

Adversarial-round prep: every non-exempt source file in packages/schema now
under 200 lines.  Behavior-preserving; facade pattern; catalogs/goldens
untouched.

## Splits

| old file (lines) | new modules (lines) |
| --- | --- |
| schemagen.py (774) | schemagen.py facade (66), schemagen_common.py (69), schemagen_ts_graph.py (145), schemagen_ts_ids.py (150), schemagen_py_constants.py (94), schemagen_capability.py (86), schemagen_pin.py (66), schemagen_md.py (150), schemagen_cli.py (90) |
| tests/test_schema_package.py (324) | test_schema_package.py runner facade (26), context.py (39), test_codegen_sync.py (37), test_pin_gate.py (40), test_id_vectors.py (56), test_worst_of_policy.py (48), test_constants_sync.py (74), test_validate_graph.py (88), test_capability_seam.py (33) |
| tests/schema-package.test.ts (208) | context.ts (48), id-mint.test.ts (67), outline-policy.test.ts (62), pin-capability.test.ts (59) |

Facades: `schemagen.py` re-exports the full former surface (all generate_*
functions, templates, helpers, `regenerate`, `load_sources`, `main`,
`schema_hash`) with an explicit `__all__` and keeps the CLI
(`--write`/`--check`).  `tests/test_schema_package.py` keeps the historical
direct-run entry point (used by run_all_suites.py) alive via discovery while
contributing zero duplicate tests to `unittest discover`.

## Byte-stability duties

- `python schemagen.py --check` -> exit 0 AFTER the split (8 generated
  artifacts in sync, schemaHash 3f3123699c45...).  gen/* + PIN not modified.
- Templates moved verbatim; regeneration byte-identical.

## Suites (end state, clean)

- Python: `python -m unittest discover -s tests` -> 23 tests OK (old 23 ->
  new 23; no assertion weakened, cases moved verbatim).
- TypeScript: `node --test "tests/*.test.ts"` -> 14 pass / 0 fail (old 14 ->
  new 14).
- Cross-package gates re-verified: graph-model
  `tests/test_canonical_sync.py` 7/7 OK (ids.py/validate.py untouched);
  capability-layer gate 13 `test_13_schema_sync.py` 11/11 OK.
- VERDICT_CASES table byte-identical across tests/context.py and
  tests/context.ts (cross-language agreement gate preserved).

## Exemptions relied on

- `gen/*` (7 files) — generated projections of schema.json (byte-checked by
  `--check`; never hand-edited).
- `vectors.json` — frozen golden id vectors.
- `PIN` — frozen pinned schema identity (generated).
- `schema.json` / `capability.json` — canonical source-of-truth data documents,
  not restructurable code.

## Verification table (every source file in the area)

| file | lines / status |
| --- | --- |
| ids.py | 97 |
| pin.py | 41 |
| schema_tools.py | 42 |
| validate.py | 95 |
| schemagen.py | 66 (facade) |
| schemagen_common.py | 69 |
| schemagen_ts_graph.py | 145 |
| schemagen_ts_ids.py | 150 |
| schemagen_py_constants.py | 94 |
| schemagen_capability.py | 86 |
| schemagen_pin.py | 66 |
| schemagen_md.py | 150 |
| schemagen_cli.py | 90 |
| tests/context.py | 39 |
| tests/test_schema_package.py | 26 (runner facade) |
| tests/test_codegen_sync.py | 37 |
| tests/test_pin_gate.py | 40 |
| tests/test_id_vectors.py | 56 |
| tests/test_worst_of_policy.py | 48 |
| tests/test_constants_sync.py | 74 |
| tests/test_validate_graph.py | 88 |
| tests/test_capability_seam.py | 33 |
| tests/context.ts | 48 |
| tests/id-mint.test.ts | 67 |
| tests/outline-policy.test.ts | 62 |
| tests/pin-capability.test.ts | 59 |
| gen/graph-schema.ts | exempt: generated |
| gen/ids.ts | exempt: generated |
| gen/pin.ts | exempt: generated |
| gen/schema_constants.py | exempt: generated |
| gen/capability_constants.py | exempt: generated |
| gen/capability_constants.ts | exempt: generated |
| gen/schema.md | exempt: generated |
| PIN | exempt: generated/frozen pin |
| vectors.json | exempt: frozen golden vectors |
| schema.json | exempt: canonical source-of-truth data |
| capability.json | exempt: canonical source-of-truth data |

Ceiling holds: max non-exempt file = 150 lines.

## Notes / bugs observed (not fixed — behavior-preserving round)

- None found in the schema package during the split.
- run_all_suites.py (top level, outside this area) invokes
  `python tests/test_schema_package.py` directly — kept green via the runner
  facade; zero changes needed outside packages/schema.
