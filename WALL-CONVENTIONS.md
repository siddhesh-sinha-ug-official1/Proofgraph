# Wall conventions — Phase 1 (cell walls)

A **wall** is the minimal, clean, versioned, typed interface a cell presents to its neighbors
and the outside — promoted OVER the cell's diagnostic pins, never replacing them. This file
fixes the conventions every wall follows so the six walls compose uniformly in Phase 2.

## Shape

Every cell gains:
- **Python cells:** `packages/<cell>/wall.py` — exports the wall factory + `WALL_VERSION`.
- **TS cells:** `packages/<cell>/src/wall.ts` — same.
- `packages/<cell>/MEMBRANE-SPEC.md` — the one-page membrane spec: what the wall exposes,
  what stays a pin, the honest-ceiling surface, versioning, and the conformance-test contract.
- A conformance test in the cell's own test layout (runs with the cell's own suite).

## Rules

1. **Additive only.** A wall never deletes a pin. Probe catalogs never shrink. After the wall
   goes on, the cell's own self-tests still pass unchanged (except tests added).
2. **Minimal face.** The wall exposes exactly what the seam map (SEAM-MAP.md) says neighbors
   consume, plus the honest-ceiling/verdict surface. Nothing else leaks through.
3. **Pins stay reachable through the wall**: every wall object exposes
   `pins` → `{ probeCatalog(), dump(), history(), tap(id, fn) }` delegating to the cell's
   existing diagnostic quartet. This is the "10 Fitbit pins under the 2-pin charger".
4. **Versioned.** `WALL_VERSION = "<cell>-wall/1.0.0"`. Every wall also carries/asserts the
   schema PIN (`schemaVersion v0`, `schemaHash 3f312369…`) — a wall refuses to stand on a
   drifted schema.
5. **Conformance test = pins vs face.** The test drives the wall with a representative call,
   then reads the cell's PINS and asserts the pin-level truth equals what the wall returned
   (e.g. `verdictOf(n)` equals the fill/outline in the probe stream; `extract()`'s returned
   edge set equals the assemble-stage probe events). Declared behavior may never diverge from
   probed behavior.
6. **Honest ceiling propagates.** A wall surfaces `unknown`/reduced tiers as such — an
   `unknown`-tier language can never surface `green` through any wall.
7. **Named failure classes.** Every wall rejection raises/returns a named failure class
   (extend the cell's existing vocabulary; e.g. `id-mismatch`, `schema-pin-mismatch`,
   `lead-in-edges`, `tier-inflation`).

## The six walls (faces frozen by the master contract + seam map)

| Cell | Wall face |
|------|-----------|
| graph-model | `ingest(nodes, edges, leads, roots?)` (verify-not-mint: recompute preimages) · `query(...)` (reachable/unused/sccs/condensation) · `project(kind)` · `verdictOf(nodeId)` |
| capability-layer | `capability(lang, repo?, config?) → {tier, handle, honestCeiling, shutdown()}` |
| structure-extractor | `extract(root) → {nodes, edges, leads}` (canonical envelope split) · `honestCeiling(lang)` · capability-fn injection socket (V1) |
| editor-shell | `mount(cfg) → {bus, update(nodes), dispose}` + `BusEvent{type:"node.select", nodeId, origin, clock}` |
| graph-view | `render(graph, bus) → handle` + same bus shape via the V5 adapter |
| byok-arena | `chat()` · `submitToolResults()` · `estimateCost()` · `validateKey()` (server-side; leak-scan is part of conformance) |
