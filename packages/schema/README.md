# @proofgraph/schema — the canonical Frozen Schema package

The ONE source of truth for the six-cell assembly. `schema.json` (Frozen Schema
v0, document revision **v0.1**) and `capability.json` (the depth-tier seam) are
the only hand-edited sources; everything under `gen/` plus `PIN` is a
byte-regenerable projection of them. Every cell imports this package —
no cell keeps an inline schema copy.

Zero third-party deps: stdlib Python 3.12 on one side, `node:crypto`/`node:test`
on the other.

## The v0.1 amendment (what changed vs. the six inline copies)

The enums and field layouts were byte-identical across all six cells and are
UNCHANGED — the Graph envelope still carries `schemaVersion: "v0"` (const).
v0.1 is a *document* revision: it promotes five facts that previously lived
only in prose into `schema.json`, where the codegen/pin machinery can guard
them:

| # | Ruling | One-line rationale |
| --- | --- | --- |
| 1 | `worstTokenToStatus`: **definition → blue** (not green) | a definition is a trust assumption, not a verification — green may never be faked |
| 2 | `DEPTH_ALLOWS_RESOLVED_EDGES = {CT: true, S: false, G: false, P: false}` | the seam owner's (capability-layer's) table wins; editor-shell's CT-only green gate agrees |
| 3 | revision tracked as top-level `schemaRevision: "v0.1"` + recomputed `schemaHash` in `PIN` | envelope shape unchanged, so the const stays `"v0"`; the pin still detects every byte of drift |
| 4 | `outlineWorstOrder = [red, amber, blue, definition, lemma, none, green]` (split 7-token); unrecognized tokens rank WORST and are reported; fused `"none/green"` banned from data | the fused/split spelling drift produced opposite ring verdicts from identical data |
| 5 | `idScheme`: `n_`/`e_` + sha256[:16 hex], US(`\x1f`)-joined domain-tagged preimages over structural `{file, path}` | graph-model's frozen mint is the only one satisfying the schema's own id patterns |
| 6 | `unresolvedPlaceholder`: `"unresolved:" + rawRefName` (raw name, never hashed) | the placeholder feeds the edge-id preimage, so its spelling is identity-bearing |
| 7 | `Node.provenance.resolved` = "the extractor successfully bound this element's identity; true for every well-formed structural node" | ends the True/False/unchecked three-way split that green-blocked whole cells |

Current pin: see `PIN` (`schemaHash` = sha256 of the canonical JSON of
`schema.json`; canonical = sorted keys, compact separators, non-ASCII raw).

## Layout

```
schema.json               source of truth (v0, revision v0.1)
capability.json           depth-tier seam source (CT|S|G|P)
ids.py                    frozen id mint (verbatim from graph-model)
validate.py               stdlib Graph-envelope validator + leads-segregation invariant
schema_tools.py           canonical_json / schema_hash / check_pin
pin.py                    reads PIN, assert_pin() fails fast on drift
schemagen.py              facade + CLI; regenerates gen/* + PIN (NOT vectors.json)
schemagen_*.py            per-artifact generators + templates behind the facade (SUB200 split)
PIN                       pinned (schemaVersion, schemaHash)
vectors.json              frozen cross-language golden id vectors (generated ONCE from ids.py)
gen/graph-schema.ts       enums, Node/Edge/Graph/Lead types, worst-of policy (zero imports)
gen/ids.ts                TS port of the mint (byte-agrees with ids.py; injectable sha256)
gen/pin.ts                pinned consts + canonicalJson + checkPin (zero imports)
gen/schema_constants.py   Python mirror of graph-schema.ts
gen/capability_constants.py / .ts   depth-tier seam constants
gen/schema.md             human spec
tests/                    both gates (see below)
```

## Regenerating

```
python schemagen.py --write   # regenerate gen/* + PIN in place
python schemagen.py --check   # byte-diff against disk; exit 1 on drift
```

Edit ONLY `schema.json` / `capability.json`, then `--write`. `vectors.json` is
frozen and never regenerated (it is the cross-language agreement golden).

## Tests

```
python -m unittest discover -s tests     # from packages/schema
node --test "tests/*.test.ts"            # from packages/schema (Node >= 22.7; 24 used)
```

Both suites assert the same `vectors.json` and the same verdict-case table —
that is the cross-language agreement gate for the mint and the outline policy.

## How a cell imports it

**TypeScript** (editor-shell, graph-view): relative import of the generated
modules — they are plain `.ts` with zero imports (safe under tsc, vite, and
Node's type stripping):

```ts
import { NODE_KINDS, WORST_TO_STATUS, rankWorstToken, type Node } from "../../schema/gen/graph-schema.ts";
import { checkPin, canonicalJson } from "../../schema/gen/pin.ts";
```

(`gen/ids.ts` hashes via `node:crypto` through `process.getBuiltinModule` — no
static import; in a browser inject a sync sha256 with `setSha256Provider()`.)

**Python** (graph-model, structure-extractor, capability-layer): put
`packages/schema` (and `packages/schema/gen` for the generated constants) on
`sys.path`, or vendor it as a package — every module dual-imports:

```python
sys.path.insert(0, str(SCHEMA_PKG))          # packages/schema
sys.path.insert(0, str(SCHEMA_PKG / "gen"))
import ids, pin, schema_constants, capability_constants
from validate import validate_graph
schema_obj = pin.assert_pin()                 # fail fast on drift
```

byok-arena imports nothing by design (its schema-absence gate is the negative
proof).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-schema.json`); each purpose line was written from the code itself and checked against the file's tests. Source subdirectories carry their own `README.md` with the same table for their files.

| File | Lines | Verified purpose |
|---|---:|---|
| `README.md` | 102 | Package README: documents the v0.1 amendment rulings (verified against schema.json/capability.json), the file layout, the regen/test commands, and the per-cell TS/Python import patterns for the canonical schema package. |
| `ASSEMBLY-CHANGES.md` | 43 | Change log for the SUB200 split: records which templates/generators/tests moved where with per-file line counts, and the unchanged suite counts. All line counts re-verified with wc -l; 23 py / 14 ts counts re-verified by running both suites; --check exits 0. |
| `package.json` | 11 | npm manifest for @proofgraph/schema: private ESM package, no dependencies, two scripts (node --test suite; python schemagen.py --check). |
| `schema.json` | 103 | Hand-edited Frozen Schema v0 (document revision v0.1): Node/Edge/Graph JSON-Schema $defs plus the promoted ruling facts (outlineWorstOrder, outlinePolicy, worstTokenToStatus, unresolvedPlaceholder, idScheme, and the ruling-7 provenance.resolved description); its canonical-JSON sha256 is the PIN hash. Never edited by this audit (hash-pinned by PIN, graph-model's hard-coded pin, and byte-compared into graph-model's cell copy). |
| `capability.json` | 13 | Hand-edited depth-tier seam source (CT\|S\|G\|P): depthAllowsResolvedEdges (ruling 2: only CT true), depthToMaxProvenance, honestCeilings; projected into gen/capability_constants.{py,ts} and asserted by both capability-seam gates. |
| `vectors.json` | 123 | Frozen cross-language golden id vectors (5 node + 3 edge, incl. module-kind, unresolved-placeholder and non-ASCII cases); replayed byte-for-byte by tests/test_id_vectors.py, tests/id-mint.test.ts, and graph-model's test_canonical_sync. |
| `ids.py` | 97 | Canonical id mint: builds US(0x1f)-joined domain-tagged preimages ('node:v0'/'edge:v0') and mints n_/e_ + sha256[:16]-hex ids; also canonical-name (module.member) and structural-path (module::member) builders, full identity dicts, and sorted manifest re-ingest. Imported by the Python cells; ported to gen/ids.ts. |
| `pin.py` | 41 | Parses the two-line PIN file (read_pin) and assert_pin() re-hashes schema.json and check_pin()s it against the pin, raising SchemaPinMismatch on drift and returning the parsed schema; consuming cells call it at startup. |
| `schema_tools.py` | 42 | Schema identity helpers: canonical_json (sorted keys, compact separators, non-ASCII raw), schema_hash over it, node/edge kind accessors, and check_pin which raises SchemaPinMismatch on version drift or same-version hash drift. |
| `validate.py` | 95 | Hand-rolled stdlib validator for the JSON-Schema subset schema.json uses, plus the leads-segregation invariant in both directions (resolved=false in edges[] and resolved=true in leads[] are errors); validate_graph returns (bool, full error list). |
| `schemagen.py` | 66 | Facade + CLI entry point after the SUB200 split: re-exports the full former schemagen surface (templates, generators, driver) from the schemagen_* modules unchanged and dispatches python schemagen.py --write\|--check. |
| `schemagen_common.py` | 69 | Shared codegen helpers: _fill @KEY@ template substitution, TS/Python literal formatters, and _schema_facts — the single extractor pulling every templated value (enums, id scheme, rulings, placeholder, patterns) from parsed schema.json. |
| `schemagen_cli.py` | 90 | Codegen driver: regenerate() returns the 8 artifact texts (7 gen/ files + PIN), load_sources() parses schema.json + capability.json, main() implements --write (write all) and --check (byte-diff, exit 1 with failure-class=codegen-drift). |
| `schemagen_ts_graph.py` | 145 | Template + generator for gen/graph-schema.ts: enum consts/types, Node/Edge/Graph/Lead interfaces, id patterns, and the worst-of outline policy (rankWorstToken/worstOfVerdict), all interpolated from _schema_facts. Byte-regenerability proven by --check. |
| `schemagen_ts_ids.py` | 150 | Template + generator for gen/ids.ts, the TypeScript port of the mint: same preimage/id functions as ids.py with sha256 via process.getBuiltinModule('node:crypto') and a setSha256Provider escape hatch for non-Node runtimes; constants from schema.json idScheme. |
| `schemagen_py_constants.py` | 94 | Template + generator for gen/schema_constants.py, the Python mirror of graph-schema.ts: enum tuples, id patterns, outline order/status table/banned tokens, placeholder helper, and the worst-of policy functions. |
| `schemagen_capability.py` | 86 | Templates + generators for gen/capability_constants.py and .ts from capability.json: depth tiers, depthAllowsResolvedEdges, depthToMaxProvenance, honestCeilings. |
| `schemagen_pin.py` | 66 | Templates + generators for gen/pin.ts (pinned version/revision/hash consts, canonicalJson mirroring Python's dump form, checkPin) and the two-line PIN file, both derived from schema_hash(schema.json). |
| `schemagen_md.py` | 150 | Template + generator for gen/schema.md, the human-readable spec projection: kinds, the constitution block, tiers, worst-of order/table, placeholder, hard invariants, and the content-addressing description, from _schema_facts. |
