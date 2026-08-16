/**
 * S5 provenance tooltip + legend (SUB200 restructure: split from
 * VerdictEngine.hoverTooltip / emitLegend, logic and probes verbatim).
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { FillStatus, SchemaNode } from "../schema/schema.js";
import type { DepthTier } from "../seams/capability.js";
import type { VerdictDecision } from "./verdict-types.js";

export interface VerdictTooltip {
  status: FillStatus;
  source: string;
  tier: DepthTier;
  serverName: string;
  provenance: SchemaNode["provenance"];
  decided: boolean;
  note: string | null;
}

/** Provenance tooltip — every rendered verdict names where it came from. */
export function hoverTooltipCore(
  probe: ProbeBus,
  tier: DepthTier,
  serverName: string,
  lastDecisions: Map<string, VerdictDecision>,
  node: SchemaNode,
  causeId: string | null,
): VerdictTooltip {
  const last = lastDecisions.get(node.id);
  // No decision for this node (e.g. a foreign-file node never painted here):
  // the tooltip must not fabricate a status the guard never approved — an
  // undecided GREEN claim reports unknown (review finding: tooltip bypassed
  // the green-honesty guard via the raw-schema fallback).
  const status: FillStatus = last
    ? last.displayedStatus
    : node.fill.status === "green"
      ? "unknown"
      : node.fill.status;
  const tooltip: VerdictTooltip = {
    status,
    source: node.fill.source,
    tier,
    serverName,
    provenance: { ...node.provenance },
    decided: !!last,
    note: last
      ? null
      : "no verdict decision exists for this node in this pane; an undecided green claim renders unknown (green may never be faked)",
  };
  probe.emit(
    "editor.verdict.gutter.hover",
    { nodeId: node.id, tooltip },
    causeId,
  );
  return tooltip;
}

export function emitLegendProbe(probe: ProbeBus, causeId: string | null): void {
  probe.emit(
    "editor.verdict.legend",
    {
      entries: [
        { status: "green", meaning: "verified", source: "a REAL compiler/kernel verdict at tier CT — never faked" },
        { status: "amber", meaning: "debt / assumed", source: "assumed origin or warning diagnostics" },
        { status: "red", meaning: "error", source: "compiler diagnostics or a red schema verdict" },
        { status: "blue", meaning: "given / external", source: "origin given; trusted from outside" },
        { status: "unknown", meaning: "no verdict — NOT green", source: "no compiler verdict available (unknown ≠ green)" },
        { status: "not-yet-computed", meaning: "OUTLINE pending gap analysis", source: "outline is null until Tree 3 runs; never green" },
      ],
    },
    causeId,
  );
}
