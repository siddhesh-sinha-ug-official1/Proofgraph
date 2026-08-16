# schema/tests

The canonical package's cross-language gate suite: 23 Python tests (`python -m unittest discover -s tests`, also runnable through the `test_schema_package.py` facade) and 14 TypeScript tests (`node --test tests/*.test.ts`). They gate codegen byte-sync, the schema PIN, the frozen id vectors, the worst-of outline policy, constants mirroring, envelope validation, and the capability seam; `context.py`/`context.ts` share the 10-row VERDICT_CASES table across both languages.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-schema.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `context.py` | 39 | Shared Python test context: puts packages/schema and gen/ on sys.path, loads schema/capability/vectors JSON once, and carries the 10-row VERDICT_CASES table mirrored value-for-value in context.ts (cross-language outline-policy gate). |
| `context.ts` | 48 | Shared TS test context: resolves PKG_ROOT, loads the three JSON documents via node:fs, types the node/edge vector records, and duplicates the 10-row VERDICT_CASES table from context.py. |
| `test_schema_package.py` | 26 | Runner facade preserving the historical `python tests/test_schema_package.py` entry point: discovers and runs the split test files (23 tests, verified), exits nonzero on failure, and contributes zero tests under `unittest discover` (no module-level TestCase). |
| `test_codegen_sync.py` | 37 | Codegen byte-sync gate: asserts regenerate() yields exactly the 8 expected artifacts, each byte-equal to disk, and that the --check CLI exits 0. |
| `test_pin_gate.py` | 40 | PIN gate: asserts the PIN file matches the recomputed canonical hash of schema.json, assert_pin() passes on the canonical pair (v0 / v0.1), and check_pin raises SchemaPinMismatch on mutated-schema hash drift and on version drift. |
| `test_id_vectors.py` | 56 | Golden id-vector gate: replays every vectors.json vector through ids.py asserting byte-equal names/paths/preimages/ids, checks coverage (>=6 vectors, module kind, unresolved placeholder, non-ASCII name), and asserts US delimiter + domain tags in every preimage. |
| `test_worst_of_policy.py` | 48 | Outline worst-of policy gate over gen/schema_constants.py: asserts the ruling-4 order/status-table/banned-token constants, positional ranks with unrecognized ranking -1, the shared VERDICT_CASES table, and the unresolved-placeholder helpers. |
| `test_constants_sync.py` | 74 | Constants-mirror gate: asserts gen/schema_constants.py enums equal schema.json's, the seven v0.1 amendment facts are recorded in schema.json (rulings 1,3,4,5,6,7 + envelope const), and ids.py constants/prefixes match idScheme. |
| `test_validate_graph.py` | 88 | Envelope-validator gate: builds a minimal canonical graph with real minted ids and asserts validate_graph accepts it and rejects a resolved=false edge in edges[], a resolved=true lead, a wrong-format (24-hex) node id, and a missing schemaVersion. |
| `test_capability_seam.py` | 33 | Capability seam gate: asserts gen/capability_constants.py equals capability.json field-for-field and the ruling-2 table itself (depth tiers CT\|S\|G\|P; resolved edges allowed only at CT). |
| `id-mint.test.ts` | 67 | TS id-mint gate: sha256 provider sanity, gen/ids.ts constants match schema.json idScheme, byte-equal replay of all node and edge vectors (incl. a placeholder dst), and idsFromManifest agreeing with graph-model's frozen goldens (verified present in graph-model tests/context.py). |
| `outline-policy.test.ts` | 62 | TS outline-policy gate: gen/graph-schema.ts enums/version/revision match schema.json, the ruling-4 order and ruling-1 definition->blue table, rankWorstToken positional/-1 behavior, the shared VERDICT_CASES, and placeholder helpers. |
| `pin-capability.test.ts` | 59 | TS pin + capability gate: canonicalJson byte-matches Python's dump form, PIN file and gen/pin.ts consts agree with the recomputed schema hash, checkPin fails fast on version/hash drift, and gen/capability_constants.ts equals capability.json with ruling 2 recorded. |
