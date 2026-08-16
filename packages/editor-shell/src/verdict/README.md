# editor-shell/src/verdict

S5 verdict engine: `verdict.ts` decides fill/outline and paints in deterministic order; `fill-decision.ts` is the pure green-guard decision (green only at CT with status, source, provenance and resolved:true all present); `tooltip.ts` the provenance tooltip and legend; `verdict-types.ts` the types and the cell-local FILL_RANK.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `verdict.ts` | 199 | S5 engine: decideFill delegates to decideFillCore and records decision+ref per node; decideOutline computes worst-case-wins via canonical worstOfVerdict (null outline -> not-yet-computed, unrecognized -> unknown); paintAll paints gutter+outline in deterministic byteStart/id order chaining each paint to its decision; hoverTooltip + legend delegate; WORST_TO_STATUS re-exported from the schema seam. |
| `fill-decision.ts` | 196 | The pure per-node FILL decision: green requires status green + non-empty source + provenance present + resolved:true + tier CT (guard probed with the failing reason; blocks probed green.blocked, downgrade blue for given origin else unknown); live diagnostics win only strictly downward (FILL_RANK); origin treatment given->blue / assumed->amber never hides live red; decision probe chains gutter paint -> decision -> guard -> input. |
| `tooltip.ts` | 74 | Provenance tooltip: reports the last DECIDED status (an undecided green claim reports unknown with an explanatory note - never raw schema green) plus source/tier/serverName/provenance, probed as gutter.hover; emitLegendProbe emits the six-entry legend naming 'unknown != green' and green-only-from-a-real-verdict. |
| `verdict-types.ts` | 48 | VerdictDecision/OutlineDecision types, ORDER_STRING (the fused 'none/green' spelling kept ONLY as historical prose, pinned by test 05), and FILL_RANK - the cell-local fill-severity table for the downward-only conflict rule (deliberately not canonical). |
