/**
 * S6 (headless half) — the render commit gate. Emits every render.* structural probe
 * at the moment the RF arrays are handed to React Flow, and enforces the two
 * invariants BEFORE the canvas mounts:
 *   (1) {rendered edge ids} === {schema edge ids modulo logged cap} — no edge silently
 *       eaten (the Mermaid-`&` lesson), no phantom edge. Violation THROWS.
 *   (2) every resolved=false edge is a leadEdge, never a solid real relationship.
 * The DOM half (GraphView.tsx) mounts what passed this gate.
 *
 * SUB200 restructure: the violation classes live in renderGateErrors.ts and the
 * node-side probes + node-set equality in renderGateNodes.ts; this facade keeps
 * the edge side (lead guard + THE Mermaid-`&` assertion) and the viewport/timing
 * tail. Importers of "./renderGate" are unchanged.
 */

import type { ProbeBus } from "./probeBus";
import type { ApplyResult, RFEdge, RFNode } from "./apply";
import type { CapDecision } from "./cap";
import type { GraphModel } from "./schema";
import { EdgeSetViolation, LeadPromotionViolation } from "./renderGateErrors";
import { gateNodes } from "./renderGateNodes";

export { EdgeSetViolation, NodeSetViolation, LeadPromotionViolation } from "./renderGateErrors";

const STAGE = "S6";

export interface RenderGateResult {
  rfNodes: RFNode[];
  rfEdges: RFEdge[];
  cause: string;
}

export function renderGate(
  model: GraphModel,
  cap: CapDecision,
  applied: ApplyResult,
  bus: ProbeBus,
): RenderGateResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { rfNodes, rfEdges } = applied;

  // ── per-node render probes + node-set equality (throws NodeSetViolation) ──
  gateNodes(model, cap, applied, bus);

  // ── per-edge render probes + the resolved=false lead guard ────────────────
  for (const e of rfEdges) {
    const style = e.type === "leadEdge" ? "lead-dashed" : "solid";
    const edgeCause = bus.emit({
      probeId: "render.edge", stage: STAGE, kind: "edge",
      payload: { id: e.id, source: e.source, target: e.target, resolved: e.data.edge?.resolved ?? false, style },
      causeId: applied.cause,
    });
    if (e.data.edge && !e.data.edge.resolved) {
      if (e.type !== "leadEdge") {
        // Guard is enforced, not just probed: a promoted lead never ships.
        throw new LeadPromotionViolation(
          `edge ${e.id} has resolved=false but type ${e.type} — a lead may never be drawn as a solid real relationship`,
        );
      }
      bus.emit({
        probeId: "render.edge.leadGuard", stage: STAGE, kind: "branch",
        payload: {
          edgeId: e.id, resolved: false, style: "lead-dashed",
          reason: "resolved=false is a lead, not an edge — never drawn as a solid real relationship",
        },
        causeId: edgeCause,
      });
    }
  }
  const edgeCountCause = bus.emit({
    probeId: "render.edge.count", stage: STAGE, kind: "value",
    payload: { count: rfEdges.length }, causeId: applied.cause,
  });

  // ── THE Mermaid-`&` ASSERTION ─────────────────────────────────────────────
  // FULL schema edge-id set vs rendered edge-id set. The ONLY sanctioned subtraction
  // is cap.droppedEdgeIds — each of which was individually evented (cap.edge.dropped)
  // and named in the banner at S1, and is listed explicitly in this payload rather
  // than hidden inside a pre-shrunk "schema" list. Duplicate-aware: a doubled edge id
  // is a phantom occurrence, not a set-equality freebie.
  const withheldEdgeIds = cap.droppedEdgeIds;
  const withheldSet = new Set(withheldEdgeIds);
  const schemaEdgeIds = model.edges.map((e) => e.id);
  const expectedSet = new Set(schemaEdgeIds.filter((id) => !withheldSet.has(id)));
  const renderedEdgeIds = rfEdges.map((e) => e.id);
  const renderedSet = new Set(renderedEdgeIds);

  const eaten = [...expectedSet].filter((id) => !renderedSet.has(id));
  const duplicated = renderedEdgeIds.filter((id, i) => renderedEdgeIds.indexOf(id) !== i);
  const phantom = [
    ...renderedEdgeIds.filter((id) => !expectedSet.has(id)),
    ...applied.phantomEdgeIds,
    ...duplicated,
  ];
  const equal = eaten.length === 0 && phantom.length === 0;

  const equalityCause = bus.emit({
    probeId: "render.edge.equality", stage: STAGE, kind: "decision",
    payload: { schemaEdgeIds, withheldEdgeIds, renderedEdgeIds, equal, eaten, phantom },
    causeId: edgeCountCause,
  });
  if (!equal) {
    const edgeById = new Map(model.edges.map((e) => [e.id, e]));
    for (const id of eaten) {
      const e = edgeById.get(id);
      bus.emit({
        probeId: "render.edge.eaten", stage: STAGE, kind: "error",
        payload: { edgeId: id, srcId: e?.srcId ?? "?", dstId: e?.dstId ?? "?", kind: e?.kind ?? "?" },
        causeId: equalityCause,
      });
    }
    for (const id of phantom) {
      bus.emit({
        probeId: "render.edge.phantom", stage: STAGE, kind: "error",
        payload: { edgeId: id },
        causeId: equalityCause,
      });
    }
    // Fails loudly BEFORE the canvas mounts — an eaten edge never ships.
    throw new EdgeSetViolation(
      `render.edge.equality violated: eaten=[${eaten.join(",")}] phantom=[${phantom.join(",")}]`,
      eaten, phantom,
    );
  }

  // ── viewport + virtualization state ───────────────────────────────────────
  const viewportCause = bus.emit({
    probeId: "render.viewport", stage: STAGE, kind: "state",
    payload: { x: 0, y: 0, zoom: 1 },
    causeId: equalityCause,
  });
  bus.emit({
    probeId: "render.virtualize", stage: STAGE, kind: "decision",
    payload: {
      // Pre-mount every passed node is headed for the canvas; the DOM layer updates
      // these counts as the viewport moves. Culled ≠ capped — reconciles with
      // render.node.equality above.
      inViewport: rfNodes.length,
      culled: 0,
      cullingOn: cap.virtualize,
    },
    causeId: viewportCause,
  });

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  bus.emit({
    probeId: "render.timing", stage: STAGE, kind: "timing",
    payload: { wallNanos: Math.round((t1 - t0) * 1e6), nodeCount: rfNodes.length },
    causeId: equalityCause,
  });

  return { rfNodes, rfEdges, cause: equalityCause };
}
