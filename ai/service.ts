// ============================================================================
// V6 — the AI outlet skeleton (ASSEMBLY code, lives OUTSIDE every cell).
//
//   createAiOutlet({ byokWall, graph, provenance }) → { ask(question, opts),
//                                                       tools, pins }
//
// The outlet connects the byok-arena WALL to the composed system. The graph
// arrives as DATA (canonical envelope: nodes / edges / leads[]) — NEVER as
// imported types inside cell 6; cell 6's schema-absence gate stays intact.
// THIS module is assembly code and may (and does) import TYPE-ONLY shapes
// from packages/schema/gen — every such import is erased at runtime, so the
// outlet has zero runtime dependency on any cell's internals: the only value
// it touches from cell 6 is the injected `byokWall` face.
//
// Tool loop (thin skeleton, ONE round by design — bound logged, never silent):
//   byokWall.chat(...) → stopReason "tool_calls" → execute the requested
//   tools LOCALLY against the provided graph/provenance data →
//   byokWall.submitToolResults(...) → final text. A second tool round is
//   refused loudly: failure class `tool-loop-exceeded`.
//
// Failure classes raised here (seam catalog, V6):
//   key-leak            — key material reached an outlet pin / return surface;
//                         redacted at the outlet chokepoint + pinned loudly
//                         (the wall-side scanner remains the prover).
//   tool-loop-exceeded  — the model asked for tools again after the single
//                         permitted round (maxToolRounds = 1).
//   graph-data-stale    — provenance (unused/roots ids) references nodes that
//                         are not in the graph snapshot handed to the outlet,
//                         i.e. provenance was minted from a DIFFERENT snapshot.
//                         (Semantics: the graph and its derived query results
//                         must come from the same ingest; id-set membership is
//                         the implemented detector — a timestamp-only check
//                         could not prove same-snapshot-ness.)
//   unknown-tool        — the model requested a tool outside the declared
//                         four; answered with an isError tool result, never
//                         silently dropped.
//   lead-in-edges       — reused class: the envelope handed in carries a
//                         resolved=false record inside edges[] (or a
//                         resolved=true record inside leads[]). Leads stay
//                         leads; the outlet refuses the envelope.
//
// SECURITY: the api key travels ONLY as an argument into byokWall.chat /
// submitToolResults. It is never stored on the outlet, never placed in any
// outlet pin (the question is pinned as sha256+length, not text), never in
// any tool payload (tools answer from graph data only), and never in ask()'s
// return. A defensive scrub runs at the outlet-pin chokepoint and over the
// final answer; any hit is redacted AND pinned (`outlet.keyLeak.redacted`).
// ============================================================================
//
// SUB200 restructure: this file is now the FACADE. The implementation lives in
// ai/outlet/ (types.ts · pins.ts · tools.ts · ask.ts · core.ts); the full
// public surface is re-exported here unchanged — importers need zero changes.

export {
  MAX_TOOL_ROUNDS,
  TOOL_OUTPUT_MAX_BYTES,
  OutletFailure,
} from "./outlet/types.ts";
export type {
  OutletFailureClass,
  OutletGraph,
  OutletProvenance,
  OutletProbeEvent,
  AskOptions,
  AskResult,
  AiOutlet,
  AiOutletConfig,
} from "./outlet/types.ts";
export { createAiOutlet } from "./outlet/core.ts";
