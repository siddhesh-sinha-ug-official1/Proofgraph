# ai/outlet — the V6 outlet implementation

Implementation modules behind the `ai/service.ts` facade: the bounds and
typed OutletFailure shapes, the scrubbed in-memory pin stream, the four
local tools answering purely from handed-in graph data, the one-tool-round
`ask()` closure over the byok wall, and the `createAiOutlet` wiring with its
lead-in-edges / graph-data-stale construction gates. Exercised by the
ai suite (14 tests; `audit/AUDIT-ai.json`).

## Files (verified)

Verified purposes from `audit/AUDIT-ai.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `types.ts` | 89 | Defines the outlet's bounds (MAX_TOOL_ROUNDS=1, TOOL_OUTPUT_MAX_BYTES=16384), the OutletFailure error carrying one of five class names, and the type-only data shapes (graph envelope, provenance, probe events, ask options/result, outlet config) consumed by the other outlet modules; all cell imports are type-only and erased at runtime. |
| `pins.ts` | 56 | In-memory probe-event stream for the outlet: emit() records seq-numbered events routing every payload through scrub(), which replaces any active secret with a [REDACTED-BY-OUTLET:last4=...] marker and pins outlet.keyLeak.redacted (failure class key-leak) on every hit; setActiveSecrets is set by ask() for one run and cleared in its finally block. |
| `tools.ts` | 161 | Builds the four declared tool defs (listUnused, trustBase, nodeInfo, listLeads), the local executor answering purely from the handed-in graph/provenance data (honest no-claim when no unused set was provided; unknown tool -> named isError result), and the byte-bound wrapper truncating outputs over 16384 bytes with a logged pin; called only by outlet/core.ts. |
| `ask.ts` | 143 | makeAsk() returns the ask() closure: validates question/apiKey/model, sets the api key as the pin-scrub active secret for the run, performs one byokWall.chat, executes any requested tools locally via the bound executor, submits results once via byokWall.submitToolResults, throws OutletFailure tool-loop-exceeded if the continuation requests tools again (bound pinned first), scrubs the final text and pins it digest-only; the key exists only as call arguments. |
| `core.ts` | 83 | createAiOutlet(): checks the byokWall face and envelope shape (plain Errors), refuses lead-in-edges (resolved flag on the wrong side) and graph-data-stale (provenance ids absent from this snapshot) as typed OutletFailures with the stale check pinned either way, then wires pins + tools + ask and returns the {ask, tools, pins} outlet; called by server/askroute.ts and the tests. |
