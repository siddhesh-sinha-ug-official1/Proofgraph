/**
 * S5 — APPLY. Write the engine's coordinates back onto React Flow nodes/edges.
 * RF edges are built from the edges that SURVIVED the layout pipeline (joined back
 * to schema edges by id) — this is deliberately the render path the Mermaid-`&`
 * assertion audits: an edge eaten anywhere upstream is missing here and caught at S6.
 * A node the engine returned no coordinate for fires apply.node.missingCoord
 * (caught, not a silent 0,0).
 */

import type { ProbeBus } from "./probeBus";
import type { LayoutInResult } from "./layoutIn";
import type { ElkResult } from "./layout";
import type { VerdictPaint } from "./verdict";
import type { GraphModel, SchemaEdge, SchemaNode } from "./schema";
import { COLORS } from "./verdict";

const STAGE = "S5";

export interface RFNodeData {
  node: SchemaNode | null; // null for a synthesized unresolved-target placeholder ghost
  paint: VerdictPaint;
  mode: "light" | "expanded";
  placeholder: boolean;
  /** Per-canvas render.memo sink, bound by GraphView to ITS bus (never a module global). */
  memoProbe?: (nodeId: string, memoHit: boolean) => void;
  [key: string]: unknown;
}

export interface RFNodeHandle {
  type: "source" | "target";
  position: "top" | "bottom";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RFNode {
  id: string; // SHARED ID
  type: "proofNode";
  position: { x: number; y: number };
  width: number;  // known dims from layout — lets React Flow draw edges without DOM measurement
  height: number;
  /**
   * Static handle geometry (React Flow v12 SSR field). Our Handles are FIXED
   * (target top-center, source bottom-center) and node boxes come from the layout
   * engine, so edges render without DOM measurement — measurement-independent
   * rendering (some embedded/headless environments never fire ResizeObserver,
   * which would otherwise silently eat every edge at the DOM layer).
   */
  handles: RFNodeHandle[];
  data: RFNodeData;
}

/** 8px React Flow default handle, centered on the top/bottom node border. */
export function fixedHandles(width: number, height: number): RFNodeHandle[] {
  return [
    { type: "target", position: "top", x: width / 2 - 4, y: -4, width: 8, height: 8 },
    { type: "source", position: "bottom", x: width / 2 - 4, y: height - 4, width: 8, height: 8 },
  ];
}

export interface RFEdgeData {
  edge: SchemaEdge | null; // null only for a phantom (which S6 rejects before mount)
  points: { x: number; y: number }[];
  [key: string]: unknown;
}

export interface RFEdge {
  id: string; // SHARED ID
  source: string;
  target: string;
  type: "resolvedEdge" | "leadEdge"; // resolved=false renders as a LEAD, dashed/ghost
  data: RFEdgeData;
}

export interface ApplyResult {
  rfNodes: RFNode[];
  rfEdges: RFEdge[];
  /** Edge ids that came out of layout but match no schema edge — phantoms for S6. */
  phantomEdgeIds: string[];
  /** Ghost placeholders S3 EXPECTED to render — S6 checks the rendered set against
   *  this, not against itself (a self-derived count could never miss an eaten ghost). */
  expectedPlaceholderIds: string[];
  missingCoordIds: string[];
  cause: string;
}

function placeholderPaint(id: string): VerdictPaint {
  // A ghost target has no verdict of its own: render as unknown — never green.
  return {
    nodeId: id,
    fillColor: COLORS.unknown, fillStatus: "unknown", fillHatched: true,
    outlineColor: COLORS.unknown, outlineStatus: "unknown", outlineWasNull: true,
  };
}

export function applyCoords(
  model: GraphModel,
  paints: Map<string, VerdictPaint>,
  layoutIn: LayoutInResult,
  elkOut: ElkResult,
  bus: ProbeBus,
  layoutCause: string,
): ApplyResult {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(model.edges.map((e) => [e.id, e]));
  const coordById = new Map(elkOut.children.map((c) => [c.id, c]));

  const rfNodes: RFNode[] = [];
  const missingCoordIds: string[] = [];
  let lastCause = layoutCause;

  for (const id of layoutIn.laidOutNodeIds) {
    const coord = coordById.get(id);
    let position = { x: 0, y: 0 };
    let width = 220, height = 64;
    if (!coord || Number.isNaN(coord.x) || Number.isNaN(coord.y)) {
      lastCause = bus.emit({
        probeId: "apply.node.missingCoord", stage: STAGE, kind: "branch",
        payload: { id, reason: "engine returned no position for this node" },
        causeId: layoutCause,
      });
      missingCoordIds.push(id);
    } else {
      position = { x: coord.x, y: coord.y };
      width = coord.width; height = coord.height;
    }
    lastCause = bus.emit({
      probeId: "apply.node.position", stage: STAGE, kind: "node",
      payload: { id, position }, causeId: layoutCause,
    });
    const isPlaceholder = layoutIn.placeholderIds.includes(id);
    const schemaNode = nodeById.get(id) ?? null;
    const paint = isPlaceholder ? placeholderPaint(id) : paints.get(id);
    if (!paint) continue; // unreachable: every laid-out non-placeholder node was painted at S2
    rfNodes.push({
      id, type: "proofNode", position, width, height,
      handles: fixedHandles(width, height),
      data: {
        node: schemaNode,
        paint,
        mode: layoutIn.modeByNode.get(id) ?? "light",
        placeholder: isPlaceholder,
      },
    });
  }

  // Build RF edges from what SURVIVED layout, joined back to the schema by id.
  const rfEdges: RFEdge[] = [];
  const phantomEdgeIds: string[] = [];
  const routeById = new Map(elkOut.edges.map((e) => [e.id, e]));
  const survivedIds = layoutIn.laidOutEdgeIds;

  for (const edgeId of survivedIds) {
    const schemaEdge = edgeById.get(edgeId);
    const route = routeById.get(edgeId);
    const points = route?.sections?.[0]
      ? [route.sections[0].startPoint, ...route.sections[0].bendPoints, route.sections[0].endPoint]
      : [];
    lastCause = bus.emit({
      probeId: "apply.edge.route", stage: STAGE, kind: "edge",
      payload: { id: edgeId, points }, causeId: layoutCause,
    });
    if (!schemaEdge) {
      // An edge id layout produced that the schema never contained — a phantom.
      // Recorded here; S6's equality gate turns it into a loud failure before mount.
      phantomEdgeIds.push(edgeId);
      continue;
    }
    rfEdges.push({
      id: edgeId,
      source: schemaEdge.srcId,
      target: schemaEdge.dstId,
      type: schemaEdge.resolved ? "resolvedEdge" : "leadEdge",
      data: { edge: schemaEdge, points },
    });
  }

  const cause = bus.emit({
    probeId: "apply.output", stage: STAGE, kind: "output",
    payload: { rfNodes: rfNodes.length, rfEdges: rfEdges.length },
    causeId: lastCause,
  });

  return { rfNodes, rfEdges, phantomEdgeIds, expectedPlaceholderIds: layoutIn.placeholderIds.slice(), missingCoordIds, cause };
}
