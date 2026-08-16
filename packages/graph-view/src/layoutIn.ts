/**
 * S3 — LAYOUT-IN. Transform GraphModel → ElkGraph (the graph handed to ELK).
 * Layered/Sugiyama, direction DOWN: calls/imports/proof_uses flow top-to-bottom,
 * dependency depth increasing downward. Every child, every edge, and the whole
 * input JSON get probes; the edge count is term #2 of the equality chain.
 */

import type { ProbeBus } from "./probeBus";
import type { CapDecision } from "./cap";
import { isUnresolvedPlaceholder, type GraphModel } from "./schema";

const STAGE = "S3";

export const LIGHT_BOX = { width: 220, height: 64 };
export const EXPANDED_BOX = { width: 480, height: 320 }; // reserves the Monaco slot box
export const PLACEHOLDER_BOX = { width: 160, height: 40 }; // ghost unresolved-target

export interface ElkChild {
  id: string;
  width: number;
  height: number;
}
export interface ElkEdgeIn {
  id: string;
  sources: string[];
  targets: string[];
}
export interface ElkGraph {
  id: "root";
  layoutOptions: Record<string, string>;
  children: ElkChild[];
  edges: ElkEdgeIn[];
}

export interface LayoutInResult {
  elkGraph: ElkGraph;
  /** Node ids actually laid out (schema nodes minus cap-withheld, plus placeholder ghosts). */
  laidOutNodeIds: string[];
  /** Synthesized ghost nodes for legal unresolved-target placeholders. */
  placeholderIds: string[];
  /** Edge ids placed into the layout (edges whose endpoints survived the cap). */
  laidOutEdgeIds: string[];
  modeByNode: Map<string, "light" | "expanded">;
  cause: string;
}

/**
 * Optional test seam: the "cheap edge-encoding connector" — the exact place the
 * Mermaid-`&` failure class lives. Production uses the identity encoder; the
 * negative gates inject a faulty one to prove the assertion catches it.
 */
export type EdgeEncoder = (edges: ElkEdgeIn[]) => ElkEdgeIn[];

export function buildElkGraph(
  model: GraphModel,
  cap: CapDecision,
  expandedIds: ReadonlySet<string>,
  bus: ProbeBus,
  paintCause: string | null,
  edgeEncoder: EdgeEncoder = (e) => e,
  engineName: "elkjs" | "@dagrejs/dagre" = "elkjs",
): LayoutInResult {
  const layoutOptions: Record<string, string> = {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    "elk.spacing.nodeNode": "40",
    "elk.portConstraints": "FIXED_ORDER",
  };
  const buildCause = bus.emit({
    probeId: "layout.in.build", stage: STAGE, kind: "value",
    payload: { algorithm: "layered", direction: "DOWN", options: layoutOptions },
    causeId: paintCause,
  });

  // ELK's real port constraints are its distinguishing feature — ideal for the fixed
  // top-target / bottom-source Handles on code-slice nodes. dagre has no equivalent.
  const usePorts = engineName === "elkjs";
  bus.emit({
    probeId: "layout.in.ports", stage: STAGE, kind: "decision",
    payload: {
      portConstraints: usePorts ? "FIXED_ORDER" : "FREE",
      reason: usePorts
        ? "ELK port constraints pin edges to the fixed top-target/bottom-source Handles of proofNode"
        : "dagre fallback has no port-constraint equivalent — ports placed freely",
    },
    causeId: buildCause,
  });
  if (!usePorts) delete layoutOptions["elk.portConstraints"];

  const dropped = new Set(cap.droppedIds);
  const droppedEdges = new Set(cap.droppedEdgeIds);
  const liveNodes = model.nodes.filter((n) => !dropped.has(n.id));
  const schemaNodeIds = new Set(model.nodes.map((n) => n.id));

  const children: ElkChild[] = [];
  const modeByNode = new Map<string, "light" | "expanded">();
  for (const node of liveNodes) {
    // In light-only / refuse degrade modes expansion is disabled — every node is light.
    const mode: "light" | "expanded" =
      cap.mode === "full" && expandedIds.has(node.id) ? "expanded" : "light";
    const box = mode === "expanded" ? EXPANDED_BOX : LIGHT_BOX;
    modeByNode.set(node.id, mode);
    children.push({ id: node.id, width: box.width, height: box.height });
    bus.emit({
      probeId: "layout.in.node", stage: STAGE, kind: "node",
      payload: { id: node.id, width: box.width, height: box.height, mode },
      causeId: buildCause,
    });
  }

  // Edges surviving the cap: cap.droppedEdgeIds (each individually evented at S1)
  // is the ONLY sanctioned subtraction. Everything else must reach the render gate.
  const survivingEdges = model.edges.filter((e) => !droppedEdges.has(e.id));

  // Ghost placeholder nodes: a legal unresolved-target placeholder dst has no schema
  // node, but the lead edge must still be drawable. Synthesized ONLY when the id is
  // not a schema node at all (a cap-withheld real node that merely SPELLS like a
  // placeholder keeps its withheld-edge semantics — never resurrected as a ghost),
  // and only from cap-surviving edges (a withheld edge spawns no orphan ghost).
  // Accounted separately in render.node.equality, never confused with schema nodes.
  const placeholderIds: string[] = [];
  for (const edge of survivingEdges) {
    if (isUnresolvedPlaceholder(edge.dstId) && !schemaNodeIds.has(edge.dstId) && !placeholderIds.includes(edge.dstId)) {
      placeholderIds.push(edge.dstId);
      modeByNode.set(edge.dstId, "light");
      children.push({ id: edge.dstId, width: PLACEHOLDER_BOX.width, height: PLACEHOLDER_BOX.height });
      bus.emit({
        probeId: "layout.in.node", stage: STAGE, kind: "node",
        payload: { id: edge.dstId, width: PLACEHOLDER_BOX.width, height: PLACEHOLDER_BOX.height, mode: "light", placeholder: true },
        causeId: buildCause,
      });
    }
  }

  const rawElkEdges: ElkEdgeIn[] = survivingEdges.map((e) => ({ id: e.id, sources: [e.srcId], targets: [e.dstId] }));

  // THE seam where the Mermaid-`&` failure class lives (test 3 injects a faulty encoder here).
  const elkEdges = edgeEncoder(rawElkEdges);

  for (const e of elkEdges) {
    bus.emit({
      probeId: "layout.in.edge", stage: STAGE, kind: "edge",
      payload: { id: e.id, sources: e.sources.slice(), targets: e.targets.slice() },
      causeId: buildCause,
    });
  }
  bus.emit({
    probeId: "layout.in.edgeCount", stage: STAGE, kind: "value",
    payload: { count: elkEdges.length },
    causeId: buildCause,
  });

  const elkGraph: ElkGraph = { id: "root", layoutOptions, children, edges: elkEdges };
  const outCause = bus.emit({
    probeId: "layout.in.output", stage: STAGE, kind: "output",
    payload: elkGraph, // the EXACT object passed to elk.layout — what the engine actually sees
    causeId: buildCause,
  });

  return {
    elkGraph,
    laidOutNodeIds: children.map((c) => c.id),
    placeholderIds,
    laidOutEdgeIds: elkEdges.map((e) => e.id),
    modeByNode,
    cause: outCause,
  };
}
