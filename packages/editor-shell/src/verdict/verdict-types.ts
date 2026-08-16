/**
 * S5 verdict decision types + cell-local rank tables (SUB200 restructure:
 * split from verdict.ts, verbatim).
 */

import type { FillStatus } from "../schema/schema.js";
import type { DepthTier } from "../seams/capability.js";

export interface VerdictDecision {
  nodeId: string;
  displayedStatus: FillStatus;
  source: "schema-fill" | "lsp-live" | "none";
  tier: DepthTier;
  greenAllowed: boolean;
  reason: string;
}

export interface OutlineDecision {
  nodeId: string;
  worstOf: string[];
  chosen: string;
  displayedStatus: FillStatus | "not-yet-computed";
  order: string;
}

// Human-readable label carried in probe payloads (pinned by test 05). The
// fused "none/green" spelling survives ONLY as this historical prose — the
// canonical data order is SPLIT (assembly ruling 4): red, amber, blue,
// definition, lemma, none, green — see schema.ts OUTLINE_WORST_ORDER.
export const ORDER_STRING = "red>amber>blue>definition>lemma>none/green";

/**
 * FILL severity rank: lower = worse. Live diagnostics may move a displayed
 * status only DOWNWARD (toward red) — a live warning must never soften a
 * recorded red verdict (review finding: red→amber upshade).
 *
 * CELL-LOCAL EXTENSION (kept deliberately, see ASSEMBLY-CHANGES.md): this
 * ranks FILL statuses for the live-vs-schema conflict rule. It is NOT the
 * canonical OUTLINE order — the canonical schema package has no fill-severity
 * table; this is a pin-adjacent local invariant of the editor cell.
 */
export const FILL_RANK: Record<FillStatus, number> = {
  red: 0,
  amber: 1,
  blue: 2,
  unknown: 3,
  green: 4,
};
