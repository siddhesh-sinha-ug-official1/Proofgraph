# graph-view

Cell 5 of the proofgraph assembly: renders a Frozen-Schema-v0 graph envelope through a probed
S0-S7 pipeline - ingest (pinned envelope + two-sided leads-segregation enforcement), cap check,
verdict paint (unknown is hatched grey, never green), ELK/dagre layout with an enforced
input-vs-output edge-id multiset equality, coordinate apply, a headless render gate that throws
named violations before mount, the React Flow DOM half, and brushing/linking over the Tree-4
event bus. Every stage emits onto one append-only ProbeBus with a 93-entry catalog.

The Phase-1 wall (`src/wall.ts`) owns the bus, asserts the carried schema pin against the
canonical `packages/schema` pin (refusing as `schema-pin-mismatch`), runs the cell unchanged
(cell violations probed then rethrown), and converts envelope rejections into named
`GraphViewWallError`s with pins attached. See `MEMBRANE-SPEC.md` for the face contract.

Run the suite: `npx vitest run` - 152 tests (node environment by default; the DOM suites opt
into jsdom per-file). The dev demo lives in `demo/` (Vite, strict port 5199).

## Layout

- `src/` - all cell source plus the vitest suites (flat)
- `demo/` - dev-only Vite demo

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-graph-view.json`); each purpose line was written from the code itself and checked against the file's tests. Source subdirectories carry their own `README.md` with the same table for their files.

| File | Lines | Verified purpose |
|---|---:|---|
| `vite.config.ts` | 8 | Vite config for the demo: root=demo, react plugin, strict port 5199. |
| `vitest.config.ts` | 12 | Vitest config: node environment default (DOM suites opt into jsdom per-file), globals on, src/**/*.test.{ts,tsx} include, 30s timeout. |
| `MEMBRANE-SPEC.md` | 87 | The one-page wall spec: face signatures, verbatim bus shape, pins-vs-face policy, honest-ceiling surface, failure-class table, carried pin, and the conformance contract — all statements verified against wall.ts/wallTypes.ts/eventBus.ts and the two conformance suites. |
| `ASSEMBLY-CHANGES.md` | 132 | Phase log: Phase-0 schema swap (116 tests, catalog 87->89), Phase-1 wall (133 tests, catalog 93), SUB200 split table (152 tests) — counts, split line-sizes, and the known dead duplicate-check bug all verified against the current tree and suite run. |
