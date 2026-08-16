# REPORT — Vessel V3: extractor wall → graph-model wall

Phase-2 vasculature. The seam: `ExtractorWall.extract(root)` canonical envelope
`{schemaVersion:"v0", nodes, edges, leads, honestCeilings}` →
`GraphModelWall.ingest(nodes, edges, leads, roots)` (VERIFY-NOT-MINT), with the
extractor's **default stub capability** (wiring the real capability wall is V1's
scope). Vessels connect WALLS, never cytoplasm: every touch of either cell goes
through `packages/structure-extractor/wall.py` / `packages/graph-model/wall.py`,
and all diagnostics are read via `wall.pins`.

## What was laid

| Artifact | What it is |
|---|---|
| `vessels/pathing.py` | The reusable sys.path wiring for multi-cell Python composition (hub will reuse it). `load_wall(cell)` loads `<cell-root>/wall.py` under a unique alias (`proofgraph_wall_<cell>`) via importlib — a bare `import wall` is AMBIGUOUS once two cell roots are on sys.path (both cells ship a root `wall.py`). `ensure_cell_on_path(cell)` guards top-level package collisions (design table `CELL_TOP_PACKAGES`: graph-model→`src`, structure-extractor→`extractor`, capability-layer→`capability`) and refuses with the named class **sys-path-shadowing** if a top name is claimed twice or already imported from a foreign location. `load_schema_module("ids")` loads the canonical mint `packages/schema/ids.py` by file under a unique alias — never a bare `import ids`, never a cell's local mirror. Idempotent (sys.modules-cached) so hub + vessels share one wall module per cell. |
| `vessels/test_v3_extractor_to_model.py` | The connector test (16 tests, all green). Both cell-3 fixtures: `fixtures/python` (skeleton pkg, `pyright_mode="none"`) and `fixtures/pyrich` (richpkg, recorded pyright). One `ExtractorWall` per fixture (one wall = one probe stream), one `GraphModelWall` per fixture; fresh model walls for every negative. |

No cell was modified. `packages/schema/` read-only. Zero new dependencies.

## Invariants proven (every test asserts on BOTH cells' pins)

1. **Byte-identity across the seam.** Every `Node.id` and `Edge.id` in the
   extractor's envelope appears **byte-identical** (compared as UTF-8 bytes) in
   (a) graph-model's accepted graph (`pins.dump()["wall"]["ingested"]` — pin
   surface), (b) the extractor pin stream (`extractor.t1.node.id`,
   `extractor.assemble.edge.id`), and (c) the model wall's verify pins
   (`…verify.nodeIds` / `…verify.edgeIds`: checked counts exact, `pass:true`,
   zero mismatches/violations). Declared counts reconcile pin×pin:
   `extractor.wall.extract.return` == `graph-model.wall.ingest.accepted`
   (skeleton 3/1/0; rich 13/8/3).

2. **THE NODE-PREIMAGE GAP IS CLOSED — the seam test the wall spec promised.**
   The graph-model wall verifies node ids by format + uniqueness ONLY (its
   MEMBRANE-SPEC "Node-preimage bound": the preimage needs canonicalName +
   structural path, which Node fields alone don't reliably carry — documented,
   never faked). This vessel pulls the extractor's `extractor.t1.node.id` pins
   (they carry preimages `{lang, kind, canonicalName, file, path, joined}`),
   recomputes each id via the CANONICAL mint (`packages/schema/ids.py`:
   `node_preimage` → `node_id_from_preimage`), verifies the pinned escaped
   `joined` field is that exact preimage, and byte-compares against the ids
   graph-model accepted. **Full coverage in both directions**: every accepted
   node id has a pinned preimage that recomputes to it; every pinned id was
   accepted. Edge/lead ids are additionally recomputed vessel-side from
   envelope fields, proving the two membranes' mints byte-agree on this run's
   real ids (the model wall's own recompute already ran, per its verify pin).

3. **Leads stay leads through BOTH walls.** Lead ids never intersect edge ids;
   every lead is `resolved:false` with the `unresolved:` prefix intact on both
   sides of the membrane; extractor lead pins (`assemble.edge.normalize` with
   `resolved:false` + `assemble.edge.unresolved.placeholder`) and the model
   wall's ingested leads are **set-equal on ids**; `…verify.leads` checked the
   exact count with zero violations; no `resolved:false` row hides in the
   accepted `edges[]`. (Rich: 3 leads — `unresolved:<dynamic>`,
   `unresolved:<dynamic-import>`, `unresolved:os.path.join`; vacuity-guarded.)

4. **No silent drops — exact reconciliation across both cells' pins.**
   Nodes: `extractor.t1.node.emit` count == envelope nodes == model
   `ingest.accepted.nodeCount` == `verify.nodeIds.checked`; every non-promoted
   node is named in `extractor.t1.node.reject` (reason + span). Edges: the ids
   minted from every non-rejected dock decision (extractor `pins.dump()`
   decisions, recomputed via the canonical mint) == envelope edges∪leads;
   `normalize − dedup == kept` exactly (`assemble.edge.dedup` names each
   collapse); every rejected candidate is named with its reason in the decision
   pin surface; `assemble.graph.emit` (resolvedEdges/unresolvedLeads/nodeCount)
   == envelope split == model accepted counts.

5. **Composed §5.10 moat story through TWO walls.** Rich envelope ingested with
   `roots=[n_ccb26550281c06b8]` (the entry decl `richpkg.core.alpha`, translated
   name→id at the seam). `query('unused')` returns exactly
   {`richpkg.plugin.plugin_entry`, `richpkg.dyn.load_plugin`,
   `richpkg.core.fact`, `richpkg.models.Child`} — the importlib-loaded plugin
   surfaces as unused because the dynamic-import edge cannot exist. The
   soundness surface is NOT lost through the second membrane: the model wall's
   t3 result carries `soundnessNote` + `blindSpots` (incl. "dynamic import")
   inline, and the `graph-model.wall.query` pin equals the returned result.
   The extractor's own pins carry the same story at module level
   (`extractor.t3.unused.complement` contains `richpkg.plugin` AND
   `richpkg.plugin.plugin_entry`; `extractor.t3.soundness.blindspots` includes
   "dynamic imports"). Reachable side sanity: alpha/beta/gamma/Base are NOT
   unused.

6. **Verdict flow: unknown stays unknown through two membranes — never green.**
   No compiler is attached anywhere on this seam; every extractor node carries
   `fill.status="unknown"` (extractor `pins.dump()` asserted), and
   `verdictOf(id)` through the model wall returns that fill byte-for-byte
   (outline `null` passed through as `null`, never invented) for EVERY node in
   both fixtures; every `graph-model.wall.verdict` pin payload is unknown.

7. **Root-vocabulary honesty (seam finding).** Extractor T3 roots are canonical
   NAMES (`"pkg.a"` — modules allowed); model-wall roots are DECL-NODE IDS
   (modules refused). The skeleton fixture is ALL module nodes, so no valid
   model-wall root exists: `query('unused')` refuses **roots-undeclared**
   (pinned on `wall.query.rejected`) and declaring the `pkg.a` module id as a
   root refuses **unknown-root** (pinned on `wall.ingest.rejected`) — while the
   extractor's own module-level claim stays visible on ITS pins
   (`t3.roots.selected == ["pkg.a"]`, `unusedSet == ["pkg.c"]`). No claim is
   ever invented to paper over the vocabulary gap.

## Failure-class negatives (model rejection pins × extractor clean-origin pins)

- **id-mismatch** (both fixtures): one byte flipped in an edge id →
  `WallRejection(failure_class="id-mismatch")`; `wall.ingest.rejected` pin
  carries the class; `wall.ingest.verify.edgeIds` pin carries the exact
  mismatch (`claimed` = tampered, `recomputed` = original). Extractor pins
  prove the original was clean: the `assemble.edge.id` pin's preimage
  recomputes (canonical mint) to the original id, its escaped `joined` field
  matches, and `extractor.wall.extract.return` fired (the extractor wall's own
  `validate_envelope` passed).
- **lead-in-edges** (rich): a lead MOVED from `leads[]` into `edges[]` →
  `WallRejection(failure_class="lead-in-edges")` at the model wall's
  segregation pre-scan, pinned on `wall.ingest.rejected`. Extractor pins prove
  it was born a lead: normalized `resolved:false`, placeholder pin fired, and
  the original envelope kept it in `leads[]`.
- **sys-path-shadowing** (vessel infrastructure, both guards): a second cell
  claiming `src` refuses; a foreign pre-imported `capability` module refuses.
  Plus positive control: the two walls are distinct modules under unique
  aliases, idempotently cached.

## New seam-catalog classes (ARCHITECTURE-PHASE2.md extended)

- `sys-path-shadowing` — two Python cells composed in one process colliding on
  a top-level module name (incl. the dual root `wall.py` ambiguity);
  `vessels/pathing.py` is the sanctioned wiring and refuses loudly.
- `root-vocabulary-mismatch` — extractor roots are canonical names (modules
  allowed), model-wall roots are decl-node ids (modules refused); the vessel
  translates, and all-module graphs honestly refuse.

## Bounds logged (no silent caps)

1. **Node-preimage bound** (graph-model wall: node ids verified by format +
   uniqueness only) — documented in its MEMBRANE-SPEC, now CLOSED at the seam
   by this vessel's preimage-recompute test (invariant 2).
2. **Module containers excluded from the model wall's query universe** (cell
   semantics, MEMBRANE-SPEC): the plugin-module story surfaces through the
   model wall via its sole decl `plugin_entry`; the module-level claim
   (`richpkg.plugin`) remains visible on the extractor's pins. Nothing dropped
   from the INGESTED graph — all module nodes are accepted and verdict-able.
3. **All-module skeleton ⇒ no decl roots at the model wall** ⇒ reachable/unused
   refuse (`roots-undeclared`) — an honest refusal, not a silent empty answer.
4. **`__init__.py` excluded at extractor ingest** (cell default
   `exclude_names`), logged by the cell on `extractor.cap.applied`
   (`ingest.exclude-names`) for both fixtures.
5. **Duplicate edge collapse** at assemble (`(kind,src,dst)` dedup) — probed
   per-drop on `extractor.assemble.edge.dedup` and reconciled EXACTLY
   (normalize − dedup == kept, invariant 4).
6. **Recorded pyright** (not live) drives the rich fixture in this connector
   test — the cell's own suite runs the live-LSP oracle; no subprocess is
   spawned by V3, so no duplicated-subprocess bound arises.
7. **One wall per fixture** (extractor `dump()/history()` are per-cell state;
   the seam map warns module-global last-run state is not concurrency-safe) —
   V3 never shares a wall across runs.

## Suites

- Vessel: `python vessels/test_v3_extractor_to_model.py` → **16/16 OK**.
- Cell suites re-run after vessel work (no cell was modified; proven
  undisturbed): graph-model `python -m unittest discover -s tests` →
  **113/113 OK**; structure-extractor `python selftest/run_all.py` (FULL, live
  pyright oracle included) → **103/103 OK**.
