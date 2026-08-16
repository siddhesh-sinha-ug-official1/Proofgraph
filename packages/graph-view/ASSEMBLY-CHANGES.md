# ASSEMBLY-CHANGES — graph-view (Tree 5) — Phase 0 schema swap

Cell: `packages/graph-view` (copied from read-only original `A:\25lean-push\graph-view`).
Canonical source of truth: `packages/schema` (READ-ONLY to this cell; consumed via
relative imports of its zero-dependency `gen/*` files).

Baseline before swap: 100/100 tests + tsc clean, probe catalog 87.
After swap: **116/116 tests + tsc clean, probe catalog 89** (grew by the two
Phase-0 envelope leads; a membrane never deletes a pin).

## Swap patterns used (per artifact)

- **Pattern (a) — direct relative import** for all schema types/constants/logic:
  - `src/schema.ts` re-exports `../../schema/gen/graph-schema.ts` (enums, record
    types, envelope type, `OUTLINE_WORST_ORDER`, `WORST_TO_STATUS`,
    `rankWorstToken`, `worstOfVerdict`, `isUnresolvedPlaceholder`,
    `UNRESOLVED_PLACEHOLDER_PREFIX`, `SCHEMA_VERSION`). The generated file has
    zero imports of its own, so the §7.6 boundary gate's relative-import
    allowance (`/^\.\.?\//`) covers it without touching the runtime-dependency
    or import-ban assertions — least invasive option, verified by running the
    gate unmodified (only comments and the `node:crypto` test-only allowance
    below changed).
  - `src/ingest.ts` imports `PINNED_SCHEMA_VERSION` from `../../schema/gen/pin.ts`
    for the envelope gate.
  - `src/schemaSync.test.ts` imports `checkPin`/`canonicalJson`/`PINNED_SCHEMA_HASH`
    from `../../schema/gen/pin.ts`.
- **Pattern (b) — verified-in-sync** where a byte-copy necessarily remains:
  - `src/probeCatalog.ts` `payloadType` strings embed enum spellings as prose;
    `src/schemaSync.test.ts` asserts those strings are built from the canonical
    enums exactly (closes the known soft-copy drift hole).
  - The `packages/schema/PIN` file text is asserted to agree with the
    `gen/pin.ts` constants (extracted-constant equality), and `schema.json`
    canonically hashed must equal `PINNED_SCHEMA_HASH`
    (3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c, v0) via
    `checkPin` — drift explodes as `failure-class=schema-pin-mismatch`.

## Files touched, why, which ruling/seam

| File | Why | Ruling / seam |
| --- | --- | --- |
| `src/schema.ts` | Local inline schema transcription replaced by re-export of canonical `gen/graph-schema.ts`; keeps the cell's historical names (`VERDICT_STATUSES`, `WORST_CASE_ORDER`, `SchemaNode/SchemaEdge`) as aliases; defines the INTERNAL `GraphModel` (merged edges+leads render model, distinct from the wire envelope). | One-schema seam; rulings 1, 3, 4 |
| `src/verdict.ts` | Deleted local `TOKEN_RANK`/`TOKEN_TO_STATUS` tables; worst-case reduction now via canonical `worstOfVerdict` + `OUTLINE_WORST_ORDER` (definition→blue; unrecognized token ranks WORST and is reported). KEPT the cell's pin-level honesty extra: unrecognized ⇒ `consistent:false`. `WORST_CASE_ORDER_STRING` is now derived, spelling the split order `red>amber>blue>definition>lemma>none>green`. | Rulings 1 + 4 |
| `src/verdict.test.ts` | Assertions updated: definition-dominated outline is consistent with **blue** (was green); new tests pin the ruling-1 flip (declared green now `consistent:false`) and ruling 4 (fused `"none/green"` is an unrecognized token: ranked worst, reported). Comments name the rulings. | Rulings 1 + 4 |
| `src/ingest.ts` | Adopts the canonical Graph envelope `{schemaVersion:"v0", nodes, edges, leads}`. `schemaVersion` REQUIRED and pin-checked against `PINNED_SCHEMA_VERSION` — missing/mismatched rejects the WHOLE payload (`rejectedEnvelope`, probed). Two-sided leads-segregation guard: `resolved:false` in `edges[]` or `resolved:true` in `leads[]` is a rejection, probed with why. Accepted leads merge into the internal `GraphModel.edges` (keeping `resolved:false`) so downstream cap accounting, layout, gate 3 edge-set equality, and dashed lead rendering see one no-silent-drop edge universe covering BOTH canonical lists. | Ruling 3; pin seam |
| `src/ingest.test.ts` | Census assertions updated for the canonical split (1 edge + 1 lead); dangling/placeholder tests moved onto `leads[]`; new "gate 2b" suite: missing schemaVersion rejected, `"v1"` rejected as schema-pin-mismatch, misfiled lead in `edges[]` rejected (was accepted pre-assembly), `resolved:true` in `leads[]` rejected. | Ruling 3 |
| `src/edgeEquality.test.ts` | The unresolved-placeholder-targeting lead now lives in `leads[]` in the fixture mutation. Gate 3 itself needed no weakening — the merged internal model keeps the rendered-vs-schema edge-set equality and cap accounting covering edges[] + leads[]. | Ruling 3 |
| `src/probeCatalog.ts` | Two NEW entries: `ingest.envelope.version` (envelope pin gate) and `ingest.edge.segregation` (leads-segregation branch). Updated `payloadType`/description on `ingest.input` (+`leadCount`), `ingest.schema.valid` (+`envelopeOk`), `verdict.outline.worstOfCheck` (+`unrecognizedTokens?`). Catalog 87 → 89 — no entry removed. | Rulings 3, 1+4; catalog pin |
| `src/catalog.test.ts` | The beyond-§6 additions list now includes the two Phase-0 assembly leads. | Catalog pin |
| `src/boundary.test.ts` | Comment updates naming the canonical-package membrane; `node:crypto` added to the test-file builtin allowance (the pin sync test hashes `schema.json`) — an extension, not a weakening: source-file rules unchanged, relative-import class already allowed. | Boundary gate seam |
| `src/schemaSync.test.ts` | NEW. (1) checkPin vs canonical `schema.json` hash + PIN file text; (2) membrane identity — re-exported constants ARE the canonical objects, rulings 1 and 4 asserted live; (3) probeCatalog payloadType strings verified-in-sync vs canonical enums. | One-schema + pin seams |
| `fixtures/skeleton.schema.json` | Added `"schemaVersion":"v0"`; moved `e-BC` (`resolved:false`) from `edges[]` into `leads[]`. | Ruling 3 (semantic fixture change) |
| `fixtures/mermaid-trap.schema.json` | Added `"schemaVersion":"v0"` (all its edges are resolved; no move needed). | Ruling 3 (semantic fixture change) |

## Semantic changes (behavior that legitimately changed, each ruling-forced)

1. **definition→blue** (ruling 1): a definition-dominated `worstOf` now expects a
   BLUE outline; the same shape declared green is flagged `consistent:false`.
2. **Split worst-case order** (ruling 4): fused `"none/green"` banned from data —
   now an unrecognized token (ranked worst, reported via `unrecognizedTokens`).
   `WORST_CASE_ORDER_STRING` spelling changed accordingly.
3. **schemaVersion required** (ruling 3 + pin): payloads without it — or with a
   non-pinned value — were previously ingested; now rejected whole, probed.
4. **`resolved:false` in `edges[]` rejected** (ruling 3): previously accepted and
   rendered dashed; leads now arrive only via `leads[]` (still rendered dashed,
   still counted — the internal model merges both lists after validation).
5. **Fixtures**: both `.schema.json` fixtures updated to the canonical envelope.

Cell remains independently runnable from `packages/graph-view` (`npm test`,
`npm run typecheck`, `npm run dev`); the only outside-the-folder reads are the
canonical `packages/schema` gen files + `schema.json`/`PIN` (the assembly seam).

---

# Phase 1 — THE WALL (`graph-view-wall/1.0.0`)

Baseline before wall: 116/116 tests + tsc clean, probe catalog 89.
After wall: **133/133 tests + tsc clean, probe catalog 93** (grew by the four
wall leads; additive only — no export deleted, no pin removed, no gate weakened).

## Files touched, why

| File | Why |
| --- | --- |
| `src/wall.ts` | NEW — the wall. `createGraphViewWall(schemaJson, bus, opts?) → {cell, pins}` wrapping `runGraphView` unchanged; `WALL_VERSION="graph-view-wall/1.0.0"`; carries the schema pin as literal copies (`WALL_SCHEMA_VERSION`/`WALL_SCHEMA_HASH`) and asserts them against canonical `gen/pin.ts` at construction (swap pattern (b), extracted-constant equality; plus the `SCHEMA_VERSION` vs `PINNED_SCHEMA_VERSION` partially-regenerated-gen cross-check) — refuses loudly on drift, `failure-class=schema-pin-mismatch`. `pins` = the existing quartet, delegating. Envelope honesty: a payload the `ingest.envelope.version` pin proves was rejected whole becomes a NAMED wall rejection (`schema-pin-mismatch` on a bad pin value, `envelope-rejected` on a missing one) with pins attached — never a silently-empty standing wall. Cell violations (`EdgeSetViolation`/`NodeSetViolation`/`LeadPromotionViolation`) cross unchanged, probed then rethrown. Opts face is `capConfig` passthrough ONLY (caps stay probed + bannered). The wall owns the ProbeBus so wall leads + run leads share one stream and pins survive rejection. |
| `src/probeCatalog.ts` | Four NEW wall leads (stage "W"): `wall.construct` (carried identity, clock 0), `wall.pin.assert` (construction pin gate), `wall.face.result` (what the wall DECLARED — the conformance anchor), `wall.face.reject` (named refusal). Catalog 89 → 93; header updated; nothing removed. |
| `src/catalog.test.ts` | The beyond-§6 additions list now includes the four wall leads (logged). |
| `src/boundary.test.ts` | File-census note (LOGGED): `src/wall.ts` + `src/wall.conformance.test.tsx` join the readdirSync census and are swept by the unchanged allow-list — no new runtime deps, no new import classes (wall reaches only intra-cell files + `../../schema/gen/*`, the Phase-0 relative-import class). Comment only; no rule changed. |
| `src/wall.conformance.test.tsx` | NEW — the pins-vs-face conformance suite (jsdom, 17 tests): (A) `dump().rfNodes/rfEdges/leads` set-equal the served envelope, declared arrays ARE the pinned arrays (reference identity), `render.edge.equality` pin agrees; `wall.face.result` counts == `render.*.count` pins; (B) honest ceiling — served-unknown node C is unknown at pin level (`verdict.fill.unknownGuard`, `verdict.outline.nullBranch`), in the declared paint, and hatched-grey-never-green in the mounted DOM; (C) select OUT (`clickNode`) == `link.bus.emit`/`link.select.out`/`link.select.state` pins == the mock bus wire, select IN (`deliverSelect`) == `link.select.in/resolve` pins == `dump().selection`, unknown-id branch, live `pins.tap`; (D) `"v1"` → `GraphViewWallError` `schema-pin-mismatch` and missing version → `envelope-rejected`, both with pins attached, empty model, no `wall.face.result`; (E) carried pin == canonical `gen/pin.ts` pin; (F) cap passthrough stays bannered (`cap.log` pin == declared banner, nothing dropped) and a full wall run has zero uncataloged leads. |
| `MEMBRANE-SPEC.md` | NEW — the one-page membrane spec: face signatures, the bus shape VERBATIM (Phase 2 adapts to it, the wall does not), what stays a pin, honest-ceiling surface, failure-class table, versioning + carried pin, conformance contract. |

## What the wall deliberately does NOT do

No Phase-2 vessel work: no cross-cell imports, no T4 bus-shape mapping (the
editor's `{type:"node.select", origin, clock}` shape is the V5 adapter's job),
no HTTP, no new exports removed/renamed, no silent anything. `runGraphView` and
every existing export remain exactly as they were — the wall is a promotion, not
a replacement.


---

# SUB200 restructure (adversarial-round prep) — every source file under 200 lines

Behavior-preserving cohesion splits only; every original module path remains as
a facade re-exporting its full public surface, so external importers (cells,
hub, app, tests) need zero changes. Probe catalog re-assembled element-for-element
identical (93 entries, same order — verified). Suite 133 → 152 tests, all green
(+19 = the boundary gate's census tests for the 19 new src files; no test
removed, no assertion weakened). `npx tsc --noEmit` clean;
`packages/schema` `schemagen --check` still exit 0; goldens untouched.

| Old file (lines) | New modules (lines) |
| --- | --- |
| `src/probeCatalog.ts` (239) | `probeCatalog.ts` facade/aggregator (44) + `catalogKit.ts` entry shape/E() (18) + `catalogIngestCap.ts` S0+S1 (69) + `catalogVerdictLayout.ts` S2–S4 (75) + `catalogRenderLink.ts` S5–S7+W (100) |
| `src/layout.ts` (317) | `layout.ts` facade + orchestrator (116) + `layoutTypes.ts` shapes/engineVersion (40) + `layoutElk.ts` elkjs half (99) + `layoutDagre.ts` dagre half (64) + `layoutGuard.ts` Term-3 edge-set guard (53) |
| `src/ingest.ts` (290) | `ingest.ts` facade: envelope gate + node loop + summaries (171) + `ingestChecks.ts` field/enum checkers (72) + `ingestEdges.ts` edge-record processor (91) |
| `src/link.ts` (240) | `link.ts` facade: wireBrushing/controller (168) + `linkTypes.ts` contracts (30) + `linkIncoming.ts` incoming select/hover handlers (93) |
| `src/wall.ts` (228) | `wall.ts` facade: createGraphViewWall (191) + `wallTypes.ts` carried identity/contracts/error (58) |
| `src/renderGate.ts` (219) | `renderGate.ts` facade: edge side + Mermaid-& assertion (153) + `renderGateErrors.ts` violation classes (25) + `renderGateNodes.ts` node side + node-set equality (85) |
| `src/wall.conformance.test.tsx` (340) | `wall.conformance.test.tsx` gates E/A/B (153) + `wall.conformance.bus.test.ts` gates C/D/F (143) + shared `wallTestKit.ts` (38) + shared `domShims.ts` (39) |
| `src/cap.test.ts` (220) | `cap.test.ts` gate 9 (178) + `capCeiling.test.ts` gate 14 (54) |
| `src/render.dom.test.tsx` (212) | `render.dom.test.tsx` (184) — duplicated jsdom shim block replaced by shared `domShims.ts` installer |

Boundary gate: unchanged (no rule weakened, no allow-list addition). All 19 new
files import only relative paths (+ the 5 runtime deps where already allowed)
and are swept by the same census. `wallTestKit.ts`/`domShims.ts` deliberately
import no vitest so they pass under the PRODUCTION allow-list.

Known pre-existing bug NOTED, not fixed (behavior-preserving round):
`ingest`'s `seenEdgeIds` set is never populated, so its duplicate-edge-id check
is dead code (duplicates would only be caught downstream by renderGate's
duplicate-aware phantom accounting). Preserved verbatim in `ingestEdges.ts`.
