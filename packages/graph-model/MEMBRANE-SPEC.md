# MEMBRANE-SPEC — graph-model wall (Phase 1)

`WALL_VERSION = "graph-model-wall/1.0.0"` · exported by `wall.py` (`GraphModelWall` / `create_wall(cell_root=None)`).
The wall asserts the canonical schema PIN at construction (`schemaVersion v0`,
`schemaHash 3f312369…43d9c`, hard-coded) and refuses to stand on a drifted
schema (`schema-pin-mismatch`). It is promoted OVER the cell's pins — nothing
is deleted; every wall decision is itself probed under the additive
`graph-model.wall.*` catalog section (12 leads; catalog 104 → 116).

## The face (all inputs deep-copied; all outputs snapshots)

- `ingest(nodes, edges, leads=None, roots=None) -> {wallVersion, accepted, nodeCount, edgeCount, leadCount, rootIds}`
  VERIFY-NOT-MINT: (0) leads-segregation pre-scan (`lead-in-edges`);
  (1) canonical-envelope validation via the cell's `validate.py`
  (`graphjson-nonconformant`); (2) node ids: format `^n_[0-9a-f]{16}$` +
  uniqueness (`id-mismatch` / `id-collision`); (3) every edge AND lead id
  recomputed from its own `(kind, srcId, dstId)` via the canonical mint
  (`src/ids.py`), byte-compared (`id-mismatch`); (4) lead dstIds must carry the
  `unresolved:` placeholder (`lead-placeholder-violation`); (5) green fills
  require an attested verdict source — S4 `green_guard` semantics: `origin ==
  "checked"` AND `fill.source` neither empty nor the skeleton no-compiler
  default, else `fake-green`; (6) roots are DECLARED node ids of decl
  (non-module) nodes (`unknown-root`).
- `query(kind, **args)` — `reachable` | `unused` (both accept `roots=` at query
  time, else use the ingest-declared roots) | `sccs` | `condensation`.
  All graph properties are `src/t3.py` library calls EXACTLY (rustworkx +
  mandatory networkx cross-check + condensation-is-DAG invariant) — never
  hand-implemented. Only resolved edges between decl nodes enter the graph;
  the universe excludes module containers (cell semantics preserved).
- `project(kind)` — `graph` (canonical `{schemaVersion, nodes, edges, leads}`
  envelope) | `flat` (rows with T3-derived `reachable`/`unused` labels, never
  written into `fill`; `None` where no claim is possible) | `text` → NAMED
  honest refusal, see ceiling.
- `verdictOf(nodeId) -> {fill, outline}` — pass-through of the stored node;
  `outline` may be `null` and is passed through as such, never invented.

## What stays a pin

`pins` → `{probeCatalog(), dump(), history(), tap(id, fn)}` delegating to the
cell's existing quartet; `dump()` additionally carries the wall's ingested
state under a `wall` key. The full 116-lead stream, causal chains, dumps, and
the eight-stage pipeline (`cell.run`) remain diagnostic surface only — no
neighbor may depend on anything but the face above.

## Honest-ceiling surface

- **Node-preimage bound:** full node-id preimage verification is IMPOSSIBLE
  from Node fields alone (the preimage needs `canonicalName` + structural
  path, which `Node.name` does not reliably carry). The wall verifies format +
  uniqueness ONLY and says so (`wall.ingest.verify.nodeIds`); the Phase-2 seam
  test closes the gap via the extractor's `extractor.t1.node.id` probes (they
  carry preimages). Never faked.
- **No roots → no claim:** roots are declared, never inferred; without them
  `reachable`/`unused` refuse (`roots-undeclared`) and `flat` labels are `None`.
- **Text projection:** `ingest(nodes, edges)` carries no byte-source/manifest
  material, so `project('text')` refuses (`projection-unavailable-no-source`)
  rather than fabricate a reprint.
- **Verdicts:** `unknown` surfaces as `unknown`; fills/origins pass through as
  given; green without an attested source is rejected (`fake-green`), and the
  wall never upgrades or invents a tier, verdict, or outline.
- `unused` results carry the T3 soundness caveat inline (`soundnessNote`,
  `blindSpots`).

## Failure classes (all raised as `WallRejection`, probed before the raise)

`schema-pin-mismatch` · `graphjson-nonconformant` · `lead-in-edges` ·
`lead-placeholder-violation` · `id-mismatch` · `id-collision` · `fake-green` ·
`unknown-root` · `roots-undeclared` · `no-graph-ingested` · `unknown-node` ·
`unknown-query` · `unknown-projection` · `projection-unavailable-no-source` ·
`t3-library-disagreement` · `condensation-not-dag`.
`WallRejection` extends the cell's `GateFailure` and carries `failure_class`.

## Versioning & conformance contract

Additive changes bump the minor (`graph-model-wall/1.x`); any face or
failure-class break bumps the major and must update this spec. Conformance
(`tests/test_wall_conformance.py` with `test_wall_standsup.py` and
`test_wall_rejections.py`, run with the cell suite): drive the wall
with the cell's own canonical-minted graph, then assert pins == face —
`query('unused'/'reachable'/'sccs'/'condensation')` equal the cell's T3 probe
payloads AND the wall's own `wall.query` pins; `verdictOf` equals `dump()`'s
node fill and the `wall.verdict` pin; every rejection lands its named class on
`wall.ingest.rejected`/`wall.query.rejected`/`wall.projection.refused` before
raising; the 104 baseline catalog entries are asserted intact. Declared
behavior may never diverge from probed behavior.
