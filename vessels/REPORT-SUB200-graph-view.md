# REPORT-SUB200 — packages/graph-view

Adversarial-round prep: every non-exempt source file in packages/graph-view now
UNDER 200 lines. Behavior-preserving cohesion splits only; facades keep every
original module path + full public surface (zero changes needed by external
importers). Logged in packages/graph-view/ASSEMBLY-CHANGES.md ("SUB200
restructure" entry).

## Splits (old → new)

- probeCatalog.ts 239 → probeCatalog.ts 44 (aggregator/facade) + catalogKit.ts 18 + catalogIngestCap.ts 69 (S0+S1) + catalogVerdictLayout.ts 75 (S2–S4) + catalogRenderLink.ts 100 (S5–S7+W). Assembled catalog verified element-for-element identical: 93 entries, same order (payloadType sync tests green).
- layout.ts 317 → layout.ts 116 (facade + orchestrator) + layoutTypes.ts 40 + layoutElk.ts 99 + layoutDagre.ts 64 + layoutGuard.ts 53.
- ingest.ts 290 → ingest.ts 171 (facade) + ingestChecks.ts 72 + ingestEdges.ts 91.
- link.ts 240 → link.ts 168 (facade) + linkTypes.ts 30 + linkIncoming.ts 93.
- wall.ts 228 → wall.ts 191 (facade) + wallTypes.ts 58.
- renderGate.ts 219 → renderGate.ts 153 (facade) + renderGateErrors.ts 25 + renderGateNodes.ts 85.
- wall.conformance.test.tsx 340 → wall.conformance.test.tsx 153 (gates E/A/B) + wall.conformance.bus.test.ts 143 (gates C/D/F) + wallTestKit.ts 38 + domShims.ts 39 (shared helpers).
- cap.test.ts 220 → cap.test.ts 178 (gate 9) + capCeiling.test.ts 54 (gate 14).
- render.dom.test.tsx 212 → 184 (shim block replaced by shared domShims.ts installer).

GraphView.tsx (196) and verdict.ts (185) were already under 200 — untouched.

## Verification

- Suite: npx vitest run — 15 files, 152 tests, ALL GREEN (baseline 13 files /
  133 tests; +19 tests = the boundary gate's auto-census of the 19 new src
  files; no test removed, no assertion weakened; wall conformance 15/15 and cap
  10/10 tests preserved across the splits).
- npx tsc --noEmit: exit 0. (npm test == vitest run — not distinct.)
- Boundary gate (gate 1): green WITHOUT weakening — no rule or allow-list
  change; all new files use only relative imports + already-allowed deps.
- Determinism gate (gate 15) green — probe streams byte-identical across runs.
- packages/schema: python schemagen.py --check exit 0 (8 artifacts in sync,
  schemaHash 3f3123699c45…). Goldens/fixtures untouched.

## Final line-count table (every file in src/, ceiling < 200 proven)

| lines | file |
| --- | --- |
| 197 | edgeEquality.test.ts |
| 196 | GraphView.tsx |
| 194 | ingest.test.ts |
| 191 | wall.ts |
| 187 | apply.ts |
| 185 | verdict.ts |
| 184 | render.dom.test.tsx |
| 178 | cap.test.ts |
| 173 | link.test.ts |
| 173 | cell.ts |
| 173 | cap.ts |
| 171 | ingest.ts |
| 169 | layoutIn.ts |
| 168 | link.ts |
| 164 | verdict.test.ts |
| 153 | wall.conformance.test.tsx |
| 153 | renderGate.ts |
| 145 | layout.test.ts |
| 143 | wall.conformance.bus.test.ts |
| 116 | probeBus.ts |
| 116 | layout.ts |
| 107 | boundary.test.ts |
| 105 | schemaSync.test.ts |
| 105 | ProofNode.tsx |
| 102 | skeleton.test.ts |
| 100 | catalogRenderLink.ts |
| 99 | layoutElk.ts |
| 97 | catalog.test.ts |
| 93 | linkIncoming.ts |
| 91 | ingestEdges.ts |
| 85 | renderGateNodes.ts |
| 79 | eventBus.ts |
| 78 | testUtil.ts |
| 75 | catalogVerdictLayout.ts |
| 72 | ingestChecks.ts |
| 69 | catalogIngestCap.ts |
| 64 | layoutDagre.ts |
| 58 | wallTypes.ts |
| 54 | capCeiling.test.ts |
| 53 | layoutGuard.ts |
| 51 | determinism.test.ts |
| 48 | schema.ts |
| 44 | probeCatalog.ts |
| 40 | layoutTypes.ts |
| 39 | domShims.ts |
| 38 | wallTestKit.ts |
| 36 | LeadEdge.tsx |
| 30 | linkTypes.ts |
| 25 | renderGateErrors.ts |
| 18 | catalogKit.ts |
| 15 | probeContext.ts |

Non-src: demo/main.tsx 96, vitest.config.ts 12, vite.config.ts 8,
demo/vite-env.d.ts 1 — all under 200. Exempt (data/lockfiles, rule 6):
package-lock.json, fixtures/*.schema.json, package.json, tsconfig.json.

## Bug noted (NOT fixed — behavior-preserving round)

ingest's seenEdgeIds set is declared and checked ("duplicate edge id …"
rejection) but NEVER populated — the duplicate-edge-id check is dead code. A
served payload with two edges sharing an id would pass ingest and only be
caught at renderGate's duplicate-aware phantom accounting (as a thrown
EdgeSetViolation rather than a probed ingest rejection). Preserved verbatim in
src/ingestEdges.ts (see comment-free duplicate check there).

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 5 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: src/ingest.ts 171→172; src/catalogRenderLink.ts 100→103; src/ingestEdges.ts 91→97; src/catalogVerdictLayout.ts 75→77; src/probeCatalog.ts 44→46. Assembled catalog re-counted: still 93 entries. Area max is still 197 (<200). All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
