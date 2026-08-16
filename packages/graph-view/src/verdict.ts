/**
 * S2 — VERDICT. fill.status → FILL color, outline.status → OUTLINE ring.
 * The two hard never-green guards live here:
 *   (a) fill.status="unknown"  → hatched grey, NEVER green (unknown ≠ green)
 *   (b) outline null|"unknown" → grey ring,    NEVER green
 * Plus the worst-case-wins verification LEAD (we render outline, we never compute it).
 */

import type { ProbeBus } from "./probeBus";
import { OUTLINE_WORST_ORDER, worstOfVerdict, type GraphModel, type SchemaNode, type VerdictStatus } from "./schema";

const STAGE = "S2";

export const COLORS: Record<VerdictStatus, string> = {
  green: "#2E7D32",
  amber: "#F9A825",
  red: "#C62828",
  blue: "#1565C0",
  unknown: "#9E9E9E",
};
export const HATCH_CSS =
  "repeating-linear-gradient(45deg,#9E9E9E,#9E9E9E 6px,#bdbdbd 6px,#bdbdbd 12px)";

/**
 * The canonical split order (assembly ruling 4): the fused "none/green" token is
 * BANNED from data; ranking and token→status now come from the canonical schema
 * package (rankWorstToken / WORST_TO_STATUS via worstOfVerdict), which carries
 * ruling 1: definition→blue (the local definition→green decision is overridden).
 * The cell KEEPS its pin-level honesty extra: an unrecognized token still flags
 * consistent:false (on top of the canonical rank-WORST + report-token policy).
 */
export const WORST_CASE_ORDER_STRING = OUTLINE_WORST_ORDER.join(">");

export interface VerdictPaint {
  nodeId: string;
  fillColor: string;
  fillStatus: VerdictStatus;
  fillHatched: boolean;
  outlineColor: string;
  outlineStatus: VerdictStatus | "none";
  outlineWasNull: boolean;
}

export interface VerdictResult {
  paints: Map<string, VerdictPaint>;
  counts: { green: number; amber: number; red: number; blue: number; unknown: number; nullOutline: number };
  outlineCounts: { green: number; amber: number; red: number; blue: number; unknown: number; none: number };
  cause: string;
}

export function paintVerdicts(model: GraphModel, bus: ProbeBus, capCause: string | null): VerdictResult {
  const paints = new Map<string, VerdictPaint>();
  const counts = { green: 0, amber: 0, red: 0, blue: 0, unknown: 0, nullOutline: 0 };
  const outlineCounts = { green: 0, amber: 0, red: 0, blue: 0, unknown: 0, none: 0 };
  let lastCause: string | null = capCause;

  for (const node of model.nodes) {
    lastCause = paintOne(node, bus, capCause, paints, counts, outlineCounts);
  }

  const outputCause = bus.emit({
    probeId: "verdict.output", stage: STAGE, kind: "output",
    payload: { paints: paints.size, counts: { ...counts }, outline: { ...outlineCounts } },
    causeId: lastCause,
  });
  return { paints, counts, outlineCounts, cause: outputCause };
}

function paintOne(
  node: SchemaNode,
  bus: ProbeBus,
  capCause: string | null,
  paints: Map<string, VerdictPaint>,
  counts: VerdictResult["counts"],
  outlineCounts: VerdictResult["outlineCounts"],
): string {
  // ── FILL ──────────────────────────────────────────────────────────────────
  const fillIn = bus.emit({
    probeId: "verdict.fill.in", stage: STAGE, kind: "input",
    payload: { nodeId: node.id, status: node.fill.status, source: node.fill.source },
    causeId: capCause,
  });
  const fillStatus = node.fill.status;
  const fillHatched = fillStatus === "unknown";
  const fillColor = COLORS[fillStatus];
  counts[fillStatus]++;
  const fillDecision = bus.emit({
    probeId: "verdict.fill.decision", stage: STAGE, kind: "decision",
    payload: { nodeId: node.id, status: fillStatus, color: fillColor, hatched: fillHatched },
    causeId: fillIn,
  });
  if (fillHatched) {
    bus.emit({
      probeId: "verdict.fill.unknownGuard", stage: STAGE, kind: "branch",
      payload: { nodeId: node.id, wouldBeGreen: false, mappedTo: "#9E9E9E hatched", reason: "unknown ≠ green" },
      causeId: fillDecision,
    });
  }

  // ── OUTLINE ───────────────────────────────────────────────────────────────
  const outlineIn = bus.emit({
    probeId: "verdict.outline.in", stage: STAGE, kind: "input",
    payload: { nodeId: node.id, outline: node.outline },
    causeId: fillDecision,
  });

  let outlineStatus: VerdictStatus;
  let outlineWasNull = false;
  let outlineDecision: string;
  if (node.outline === null) {
    outlineWasNull = true;
    outlineStatus = "unknown"; // render as unknown, NEVER green
    counts.nullOutline++;
    outlineCounts.none++;
    const nullBranch = bus.emit({
      probeId: "verdict.outline.nullBranch", stage: STAGE, kind: "branch",
      payload: {
        nodeId: node.id, mappedTo: "grey ring", outlineWasNull: true,
        reason: "outline not computed — render as unknown, never green",
      },
      causeId: outlineIn,
    });
    outlineDecision = bus.emit({
      probeId: "verdict.outline.decision", stage: STAGE, kind: "decision",
      payload: { nodeId: node.id, status: "unknown", ringColor: COLORS.unknown },
      causeId: nullBranch,
    });
  } else {
    outlineStatus = node.outline.status;
    outlineCounts[outlineStatus]++;
    outlineDecision = bus.emit({
      probeId: "verdict.outline.decision", stage: STAGE, kind: "decision",
      payload: { nodeId: node.id, status: outlineStatus, ringColor: COLORS[outlineStatus] },
      causeId: outlineIn,
    });
    if (outlineStatus === "unknown") {
      bus.emit({
        probeId: "verdict.outline.unknownGuard", stage: STAGE, kind: "branch",
        payload: { nodeId: node.id, wouldBeGreen: false, mappedTo: "grey ring", reason: "unknown ≠ green" },
        causeId: outlineDecision,
      });
    }
    // The worst-case-wins VERIFICATION lead — we do not own the computation (gap
    // analysis does), but a mismatch between declared status and re-derived worst
    // is a red flag worth a lead.
    // Canonical reduction (rulings 1 + 4): worstOfVerdict ranks by the split
    // OUTLINE_WORST_ORDER, ranks an unrecognized token WORST and reports it, and
    // maps definition→blue. The cell's extra: unrecognized ⇒ consistent:false.
    const worstOf = node.outline.worstOf;
    const { worstToken: derivedWorst, status: expectedStatus, unrecognized } = worstOfVerdict(worstOf);
    const sawUnrecognized = unrecognized.length > 0;
    const consistent = !sawUnrecognized && expectedStatus === outlineStatus;
    bus.emit({
      probeId: "verdict.outline.worstOfCheck", stage: STAGE, kind: "decision",
      payload: {
        nodeId: node.id, worstOf: worstOf.slice(), derivedWorst,
        declaredStatus: outlineStatus, consistent,
        order: WORST_CASE_ORDER_STRING,
        // Ruling 4: report the offending token(s), never silently skip them.
        ...(sawUnrecognized ? { unrecognizedToken: true, unrecognizedTokens: unrecognized.slice() } : {}),
      },
      causeId: outlineDecision,
    });
  }

  const paint: VerdictPaint = {
    nodeId: node.id,
    fillColor, fillStatus, fillHatched,
    outlineColor: COLORS[outlineStatus],
    outlineStatus,
    outlineWasNull,
  };
  paints.set(node.id, paint);

  // The running verdict census as it is built — the single most decision-relevant
  // aggregate lead. Emitted per node (firehose; no sampling, contract §5).
  return bus.emit({
    probeId: "verdict.histogram", stage: STAGE, kind: "value",
    payload: {
      fill: { green: counts.green, amber: counts.amber, red: counts.red, blue: counts.blue, unknown: counts.unknown },
      outline: { ...outlineCounts },
    },
    causeId: outlineDecision,
  });
}
