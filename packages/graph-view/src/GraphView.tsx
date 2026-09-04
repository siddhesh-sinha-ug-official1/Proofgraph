/**
 * S6 (DOM half) — the React Flow canvas. Mounts ONLY what passed the render gate.
 * The cap banner is the user-visible no-silent-caps surface. Node clicks/hovers
 * route through the S7 controller (shared IDs out); incoming bus selects center
 * via the injected setCenter. Viewport moves are probed (render.viewport).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  ReactFlow,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphViewCell } from "./cell";
import type { RFEdgeData, RFNodeData } from "./apply";
import { ProofNode } from "./ProofNode";
import { LeadEdge } from "./LeadEdge";
import { ProbeBusContext } from "./probeContext";

const nodeTypes = { proofNode: ProofNode };
const edgeTypes = { resolvedEdge: undefined as never, leadEdge: LeadEdge };

export interface GraphViewProps {
  cell: GraphViewCell;
  /** DOM override of the expanded set (kept in sync with the controller). */
  expandedIds?: ReadonlySet<string>;
}

function CapBanner({ banner }: { banner: GraphViewCell["banner"] }) {
  if (!banner.bannerShown) return null;
  return (
    <div
      role="alert"
      data-testid="cap-banner"
      style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        background: "#C62828", color: "#fff", padding: "6px 12px",
        fontSize: 12, fontFamily: "system-ui, sans-serif",
      }}
    >
      ⚠ {banner.message}
    </div>
  );
}

function GraphViewInner({ cell, expandedIds }: GraphViewProps) {
  const { setCenter } = useReactFlow();
  const bus = cell.bus;
  const rootRef = useRef<HTMLDivElement>(null);

  // Post-mount DOM reconciliation on the render.virtualize lead: the DOM-mounted
  // counts vs the model. Culled ≠ dropped — and a DOM layer that silently ate
  // edges (e.g. an environment that never fires ResizeObserver) is visible here.
  useEffect(() => {
    // setTimeout, not requestAnimationFrame: environments with suppressed painting
    // (embedded panes, headless) defer rAF indefinitely — the same class of quirk
    // that suppresses ResizeObserver — and this lead exists precisely to audit them.
    const timer = setTimeout(() => {
      const root = rootRef.current;
      const mountedNodes = root?.querySelectorAll(".react-flow__node").length ?? 0;
      const mountedEdges = root?.querySelectorAll(".react-flow__edge").length ?? 0;
      bus.emit({
        probeId: "render.virtualize", stage: "S6", kind: "decision",
        payload: {
          inViewport: mountedNodes,
          culled: cell.rfNodes.length - mountedNodes,
          cullingOn: cell.cap.virtualize,
          domEdges: mountedEdges,
          modelEdges: cell.rfEdges.length,
        },
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [bus, cell]);

  // Per-instance render.memo sink: travels inside node data, bound to THIS cell's
  // bus — two mounted canvases never cross-wire, and an unmount darkens nothing.
  const memoProbe = useCallback(
    (nodeId: string, memoHit: boolean) => {
      bus.emit({ probeId: "render.memo", stage: "S6", kind: "value", payload: { nodeId, memoHit } });
    },
    [bus],
  );

  const [selectedId, setSelectedId] = useState<string | null>(cell.controller.selectedId);

  // O(1) lookup map for centerAndHighlight (P-4: replaces O(n) find per click).
  const rfNodeById = useMemo(() => {
    const m = new Map<string, (typeof cell.rfNodes)[number]>();
    for (const n of cell.rfNodes) m.set(n.id, n);
    return m;
  }, [cell.rfNodes]);

  // Late-bind the DOM centering into the S7 hooks (link.ts reads them at call time).
  useEffect(() => {
    cell.linkHooks.centerAndHighlight = (nodeId: string) => {
      const n = rfNodeById.get(nodeId);
      const viewport = n
        ? { x: n.position.x + n.width / 2, y: n.position.y + n.height / 2, zoom: 1.2 }
        : { x: 0, y: 0, zoom: 1 };
      if (n) setCenter(viewport.x, viewport.y, { zoom: viewport.zoom, duration: 200 });
      setSelectedId(nodeId);
      return viewport;
    };
    return () => { delete cell.linkHooks.centerAndHighlight; };
  }, [cell, setCenter, rfNodeById]);

  const nodes: Node<RFNodeData>[] = useMemo(
    () =>
      cell.rfNodes.map((n) => ({
        id: n.id,
        type: "proofNode",
        position: n.position,
        width: n.width,
        height: n.height,
        // Static handle geometry: edges render measurement-independently (v12 SSR
        // path) — environments that never fire ResizeObserver would otherwise
        // silently eat every edge at the DOM layer. (Cast: RF types position as its
        // Position enum whose VALUES are these same strings.)
        handles: n.handles as unknown as Node<RFNodeData>["handles"],
        selected: n.id === selectedId,
        data: {
          ...n.data,
          // The prop only re-renders what the cap-checked controller GRANTED —
          // it is a re-render channel, not a side door around MAX_EXPANDED.
          mode:
            expandedIds?.has(n.id) && cell.controller.expandedIds.has(n.id)
              ? ("expanded" as const)
              : n.data.mode,
          memoProbe,
        },
      })),
    [cell, selectedId, expandedIds, memoProbe],
  );

  const edges: Edge<RFEdgeData>[] = useMemo(
    () =>
      cell.rfEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        // resolvedEdge = React Flow's default solid edge; leadEdge = dashed ghost.
        ...(e.type === "leadEdge" ? { type: "leadEdge" } : {}),
        data: e.data,
      })),
    [cell.rfEdges],
  );

  const onNodeClick = useCallback(
    (_evt: unknown, node: { id: string }) => {
      cell.controller.clickNode(node.id);
      setSelectedId(node.id);
    },
    [cell],
  );

  const onNodeMouseEnter = useCallback(
    (_evt: unknown, node: { id: string }) => cell.controller.hoverNode(node.id),
    [cell],
  );

  const onMove = useCallback(
    (_evt: unknown, viewport: Viewport) => {
      bus.emit({ probeId: "render.viewport", stage: "S6", kind: "state", payload: viewport });
    },
    [bus],
  );

  return (
    <ProbeBusContext.Provider value={bus}>
      <div ref={rootRef} style={{ width: "100%", height: "100%", position: "relative" }} data-testid="graph-view-root">
        <CapBanner banner={cell.banner} />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes as never}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onMove={onMove}
          onlyRenderVisibleElements={cell.cap.virtualize}
          fitView
          minZoom={0.05}
        >
          <Background />
        </ReactFlow>
      </div>
    </ProbeBusContext.Provider>
  );
}

export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}
