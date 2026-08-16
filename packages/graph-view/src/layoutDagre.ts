/**
 * S4 — LAYOUT, dagre engine half: @dagrejs/dagre (MIT) is the vetted
 * pure-permissive fallback. Runs synchronously on the calling thread (fast to a
 * few hundred nodes with the tight-tree ranker); output is normalized to ELK's
 * result conventions. Split from layout.ts (SUB200 restructure).
 */

import type { ProbeBus } from "./probeBus";
import type { ElkGraph } from "./layoutIn";
import type { ElkPoint, ElkResult, ElkResultEdge, ElkResultNode, ElkSection } from "./layoutTypes";

const STAGE = "S4";

export async function runDagre(elkGraph: ElkGraph, bus: ProbeBus, requestCause: string): Promise<{ raw: ElkResult; worker: boolean }> {
  bus.emit({
    probeId: "layout.worker.decision", stage: STAGE, kind: "decision",
    payload: {
      useWorker: false,
      reason: "dagre fallback runs synchronously on the calling thread (fast to a few hundred nodes with tight-tree ranker)",
      nodeCount: elkGraph.children.length,
    },
    causeId: requestCause,
  });
  const mod = await import("@dagrejs/dagre");
  const Dagre = ((mod as { default?: unknown }).default ?? mod) as {
    graphlib: { Graph: new (opts?: { multigraph?: boolean }) => DagreGraph };
    layout: (g: DagreGraph) => void;
  };
  interface DagreGraph {
    setDefaultEdgeLabel(fn: () => object): DagreGraph;
    setGraph(opts: object): DagreGraph;
    setNode(id: string, attrs: object): void;
    setEdge(src: string, dst: string, attrs: object, name?: string): void;
    node(id: string): { x: number; y: number; width: number; height: number };
    edge(e: { v: string; w: string; name?: string }): { points?: ElkPoint[] };
    edges(): { v: string; w: string; name?: string }[];
  }
  // multigraph: named edges (we key every edge by its schema id — two edges may share endpoints).
  const g = new Dagre.graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}));
  // tight-tree ranker: the default network-simplex is O(N^3) — multi-minute stalls past ~1–2k nodes.
  g.setGraph({ rankdir: "TB", ranker: "tight-tree", ranksep: 80, nodesep: 40 });
  for (const c of elkGraph.children) g.setNode(c.id, { width: c.width, height: c.height });
  const edgeIdByKey = new Map<string, string>();
  for (const e of elkGraph.edges) {
    g.setEdge(e.sources[0], e.targets[0], {}, e.id);
    edgeIdByKey.set(`${e.sources[0]}→${e.targets[0]}→${e.id}`, e.id);
  }
  Dagre.layout(g);

  const children: ElkResultNode[] = elkGraph.children.map((c) => {
    const n = g.node(c.id);
    // dagre positions are CENTERS; ELK's are top-left. Normalize to ELK's convention.
    return { id: c.id, x: n.x - c.width / 2, y: n.y - c.height / 2, width: c.width, height: c.height };
  });
  const edges: ElkResultEdge[] = g.edges().map((ek) => {
    const points = g.edge(ek).points ?? [];
    const id = ek.name ?? edgeIdByKey.get(`${ek.v}→${ek.w}→${ek.name}`) ?? `${ek.v}→${ek.w}`;
    const section: ElkSection = points.length >= 2
      ? { startPoint: points[0], endPoint: points[points.length - 1], bendPoints: points.slice(1, -1) }
      : { startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, bendPoints: [] };
    return { id, sections: [section] };
  });
  return { raw: { children, edges }, worker: false };
}
