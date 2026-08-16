/**
 * S1 — CAP. The node-count ceiling, the degrade decision, and the user-visible banner.
 * No silent caps (Operating Contract rule 8): if a cap bites, the banner is shown and
 * every withheld node gets its own cap.dropped event. Culling ≠ dropping (cap.virtualize).
 */

import type { ProbeBus } from "./probeBus";
import type { GraphModel } from "./schema";

const STAGE = "S1";

export interface CapConfig {
  maxNodes: number;      // light-node ceiling
  maxExpanded: number;   // simultaneous-Monaco ceiling
  hardMaxNodes: number;  // past this, even light DOM freezes the tab → refuse mode
  virtualizeThreshold: number; // enable React Flow viewport culling past this
}

export const DEFAULT_CAP_CONFIG: CapConfig = {
  // DOM-per-node caps out around hundreds to low-thousands; React Flow is comfortable
  // to hundreds / low-thousands with memoization. 1500 is the honest light-node ceiling.
  maxNodes: 1500,
  // With a Monaco instance inside each node it is realistically dozens–low-hundreds;
  // 8 simultaneous expanded nodes is deliberately conservative.
  maxExpanded: 8,
  hardMaxNodes: 4000,
  virtualizeThreshold: 200,
};

export interface CapDecision {
  limit: number;
  live: number;
  over: boolean;
  mode: "full" | "light-only" | "refuse";
  droppedIds: string[]; // MUST be empty unless mode=refuse AND the banner is shown
  /** Edges withheld because an endpoint node was withheld — evented per edge, never silent. */
  droppedEdgeIds: string[];
  reason: string;
  banner: { bannerShown: boolean; message: string; withheldCount: number };
  virtualize: boolean;
  config: CapConfig;
  cause: string;
}

export function capCheck(
  model: GraphModel,
  bus: ProbeBus,
  config: CapConfig = DEFAULT_CAP_CONFIG,
  /** Size of the caller-requested initial expansion set — measured, never assumed. */
  requestedExpanded = 0,
): CapDecision {
  const limitCause = bus.emit({
    probeId: "cap.limit", stage: STAGE, kind: "value",
    payload: {
      maxNodes: config.maxNodes, maxExpanded: config.maxExpanded,
      rationale:
        "DOM-per-node caps at hundreds–low-thousands (each node is a real React component); " +
        "a Monaco instance per node drops that to dozens–low-hundreds, so expansion is capped separately.",
    },
    causeId: null,
  });
  bus.emit({ probeId: "cap.expanded.limit", stage: STAGE, kind: "value", payload: { maxExpanded: config.maxExpanded }, causeId: limitCause });

  const liveNodes = model.nodes.length;
  const liveEdges = model.edges.length;
  const liveCause = bus.emit({ probeId: "cap.live", stage: STAGE, kind: "value", payload: { liveNodes, liveEdges }, causeId: limitCause });

  const overNodes = liveNodes > config.maxNodes;
  const overHard = liveNodes > config.hardMaxNodes;
  const overExpanded = requestedExpanded > config.maxExpanded;
  const compareCause = bus.emit({
    probeId: "cap.compare", stage: STAGE, kind: "decision",
    payload: { overNodes, overExpanded, requestedExpanded, liveNodes, maxNodes: config.maxNodes },
    causeId: liveCause,
  });

  let mode: CapDecision["mode"];
  let reason: string;
  let droppedIds: string[] = [];
  if (!overNodes) {
    mode = "full";
    reason = `liveNodes ${liveNodes} <= maxNodes ${config.maxNodes} — full fidelity`;
  } else if (!overHard) {
    mode = "light-only";
    reason = `liveNodes ${liveNodes} > maxNodes ${config.maxNodes} — all nodes kept visible as cheap light nodes; expansion disabled`;
  } else {
    mode = "refuse";
    droppedIds = model.nodes.slice(config.hardMaxNodes).map((n) => n.id);
    reason = `liveNodes ${liveNodes} > hardMaxNodes ${config.hardMaxNodes} — even light DOM would freeze the tab; withholding ${droppedIds.length} nodes WITH a visible banner`;
  }

  const degradeCause = bus.emit({ probeId: "cap.degrade", stage: STAGE, kind: "decision", payload: { mode, reason }, causeId: compareCause });

  // The branches NOT taken, each with the reason (Probe Density Contract §2).
  const allModes: CapDecision["mode"][] = ["full", "light-only", "refuse"];
  for (const rejected of allModes) {
    if (rejected === mode) continue;
    let why: string;
    if (rejected === "full") why = `did not stay full: liveNodes ${liveNodes} exceeds maxNodes ${config.maxNodes}`;
    else if (rejected === "light-only") {
      why = mode === "full"
        ? `did not degrade to light-only: under the ceiling (${liveNodes} <= ${config.maxNodes})`
        : `did not stop at light-only: liveNodes ${liveNodes} exceeds even hardMaxNodes ${config.hardMaxNodes}`;
    } else {
      why = mode === "full"
        ? `did not refuse: under the ceiling (${liveNodes} <= ${config.maxNodes})`
        : `did not refuse: light-only keeps all ${liveNodes} nodes visible without freezing (<= hardMaxNodes ${config.hardMaxNodes})`;
    }
    bus.emit({ probeId: "cap.degrade.notTaken", stage: STAGE, kind: "branch", payload: { rejectedMode: rejected, reason: why }, causeId: degradeCause });
  }

  // Edges withheld WITH their withheld endpoint — accounted here, per edge, so the
  // edge side of the cap is as loud as the node side (an unaccounted subtraction
  // anywhere in the chain is exactly failure class F4 applied to edges).
  const droppedNodeSet = new Set(droppedIds);
  const droppedEdgeIds =
    droppedIds.length === 0
      ? []
      : model.edges.filter((e) => droppedNodeSet.has(e.srcId) || droppedNodeSet.has(e.dstId)).map((e) => e.id);

  const bannerShown = mode !== "full";
  const banner = {
    bannerShown,
    message:
      mode === "full"
        ? ""
        : mode === "light-only"
          ? `Graph over the ${config.maxNodes}-node ceiling (${liveNodes} nodes): rendering ALL nodes in light-only mode; node expansion disabled. Nothing was dropped.`
          : `Graph over the ${config.hardMaxNodes}-node hard ceiling (${liveNodes} nodes): withheld ${droppedIds.length} nodes: ${droppedIds.join(", ")}` +
            (droppedEdgeIds.length > 0 ? ` and ${droppedEdgeIds.length} edges touching them: ${droppedEdgeIds.join(", ")}` : ""),
    withheldCount: droppedIds.length,
  };
  const logCause = bus.emit({ probeId: "cap.log", stage: STAGE, kind: "state", payload: banner, causeId: degradeCause });

  // cap.dropped / cap.edge.dropped: ONLY in refuse mode, one per withheld node and
  // one per withheld edge, only with the banner shown.
  if (mode === "refuse" && bannerShown) {
    for (const nodeId of droppedIds) {
      bus.emit({
        probeId: "cap.dropped", stage: STAGE, kind: "node",
        payload: { nodeId, reason: `withheld in refuse mode (hardMaxNodes ${config.hardMaxNodes}); listed in the visible banner` },
        causeId: logCause,
      });
    }
    const edgeById = new Map(model.edges.map((e) => [e.id, e]));
    for (const edgeId of droppedEdgeIds) {
      const e = edgeById.get(edgeId)!;
      bus.emit({
        probeId: "cap.edge.dropped", stage: STAGE, kind: "edge",
        payload: { edgeId, srcId: e.srcId, dstId: e.dstId, reason: "endpoint node withheld in refuse mode; listed in the visible banner" },
        causeId: logCause,
      });
    }
  }

  const virtualize = liveNodes > config.virtualizeThreshold;
  bus.emit({
    probeId: "cap.virtualize", stage: STAGE, kind: "decision",
    payload: {
      onlyRenderVisibleElements: virtualize,
      reason: virtualize
        ? `liveNodes ${liveNodes} > ${config.virtualizeThreshold}: viewport culling ON. Culling ≠ dropping — a culled node is still in the model and re-renders on pan.`
        : `liveNodes ${liveNodes} <= ${config.virtualizeThreshold}: culling unnecessary`,
    },
    causeId: compareCause,
  });

  return {
    limit: config.maxNodes, live: liveNodes, over: overNodes,
    mode, droppedIds, droppedEdgeIds, reason, banner, virtualize, config,
    cause: degradeCause,
  };
}
