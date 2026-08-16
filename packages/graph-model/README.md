# Tree 1 — Graph Model (walking skeleton, maximal probe surface)

The keystone cell of ProofGraph: the **Frozen Schema v0** (the constitution every
other tree imports), a headless 8-stage pipeline over a hand-written fixture, one
T3 property (reachability-from-roots via **rustworkx**, cross-checked against
**NetworkX**), three isomorphic projections carrying identical content-addressed
IDs, and the **byte-exact `text → model → text` round-trip gate** (C1 fixpoint).

Tree 1 itself was deliberately **membrane-less**: every internal exposed through
104 cataloged probe leads (observability first, minimization later). The Phase-1
wall (`wall.py`, spec in `MEMBRANE-SPEC.md`) later added 12 additive
`graph-model.wall.*` leads — catalog 104 → 116; the diagnostic quartet stays
reachable via `wall.pins`.

## Frozen artifacts (the constitution)

| artifact | role |
|---|---|
| `schema/schema.json` | canonical machine spec (source of truth) |
| `schema/graph-schema.ts` | TypeScript types — **generated** from schema.json |
| `schema/schema.md` | human spec, carries `schemaVersion` + `schemaHash` |

Regenerate the projections: `python schema/schemagen.py` (byte-stable; drift
fails the S0 gate). Consumers pin `(schemaVersion, schemaHash)` and fail fast on
mismatch via `src/schema_tools.py::check_pin`.

## Entry points

```python
from src.cell import GraphModelCell
cell = GraphModelCell()
result = cell.run("fixtures/sample.py", "fixtures/roots.json")
# result = {graph, projections, t3Result}
cell.probeCatalog()   # every available lead (116: 104 baseline + 12 wall.*)
cell.history()        # ordered probe stream of the last run (deterministic)
cell.dump()           # entire internal state snapshot
cell.tap(probeId, cb) # subscribe to one live lead; returns unsubscribe()
```

Demo + firehose export: `python run_pipeline.py` → writes `out/probes.jsonl`,
`out/graph.json`, `out/flat.json`, `out/text.txt`, `out/t3result.json`,
`out/dump.json`, `out/probe_catalog.json`.

Tests (113): `python -m unittest discover -s tests` — pipeline/wall tests assert
on probe output; the canonical-sync suite asserts byte/functional identity
against `packages/schema`.

## Honest ceiling (do not mistake this for verification)

No compiler/kernel is attached in Tree 1. Every node the PIPELINE produces has
`fill.status = "unknown"` (`unknown ≠ green`); `green` is structurally forbidden
there by the S4 greenGuard and the fake-green gate. (The Phase-1 wall's `ingest`
admits externally-supplied green fills ONLY with attested provenance —
`origin="checked"` plus an attesting `fill.source`; anything else is rejected
`fake-green`. See MEMBRANE-SPEC.md.) `origin` is `given`/`assumed`, never
`checked`. `outline` is `null` until the gap-analysis round. `resolved=false`
references are **leads, not edges**: carried in `Graph.leads`, never in
`Graph.edges`, never in the T3 graph. Reachability-based "unused" is only as
complete as the resolved edge set (blind spots: dynamic dispatch, reflection,
dynamic import — carried inside `T3Result`).

## Dependencies (import-boundary gated)

`rustworkx` (Apache-2.0), `networkx` (BSD-3-Clause), Python stdlib. Anything
else fails `src/importgate.py` at run start.

## Known conscious deviation from the build prompt

Appendix A.1's verbatim `outline` sub-schema was open (no `required`, no
`additionalProperties:false`), which let `outline: {}` validate while the
generated TS type rejects it — the canonical artifact disagreeing with its own
projection. We tightened `outline` to `required:["status","worstOf"] +
additionalProperties:false` to honor §4's constitution and rule 5 (projections
never disagree). Flagged by two independent review dimensions; documented in
`agentic-convos/`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-graph-model.json`); each purpose line was written from the code itself and checked against the file's tests. Source subdirectories carry their own `README.md` with the same table for their files.

| File | Lines | Verified purpose |
|---|---:|---|
| `run_pipeline.py` | 62 | CLI demo: runs GraphModelCell on a fixture pair (default sample.py/roots.json, or two args), writes the whole diagnostic surface to out/ (probes.jsonl, graph/flat/text/t3result/dump/probe_catalog) and prints a summary including the roundtrip verdict; refuses a lone argument. |
| `wall.py` | 37 | Facade at the frozen path vessels' pathing.load_wall and the hub file-load: inserts the cell root on sys.path and re-exports the full src/wall public surface (WALL_VERSION, pins, WallRejection, GraphModelWall, create_wall, constants) with explicit __all__. |
| `README.md` | 75 | Package README: frozen artifacts table, entry points, demo/out list, honest ceiling, gated dependencies, the documented outline-schema deviation; counts now match reality (116 leads, 113 tests) and the ceiling paragraph is scoped to the pipeline with the wall's attested-green policy named. |
| `MEMBRANE-SPEC.md` | 85 | The wall's one-page membrane spec: face semantics (ingest checks 0-6, query, project, verdictOf), pins, honest-ceiling surface (preimage bound, no-roots-no-claim, text refusal, verdict pass-through), the 16 failure classes, versioning + conformance contract — all verified against src/wall/* and the three wall test files. |
| `ASSEMBLY-CHANGES.md` | 201 | Change record for Phase 0 (canonical schema swap + sync membrane), Phase 1 (wall + 12 additive leads) and the SUB200 restructure; the checkable claims (catalog 104->116 element-identical, suite 113/113, demo 141 events / 4 nodes / 1 edge / 0 leads / roundtrip pass, sync-gated files untouched) re-verified live this audit. |
