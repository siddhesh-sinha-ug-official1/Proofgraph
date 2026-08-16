/**
 * V5 bus adapter sides (SUB200 split of busAdapter.ts — no behavior change):
 * the editor-side (T4 SelectionBus shape) and graph-side (T5 GraphEventBus
 * shape) port factories over the shared AdapterCtx. Every cross-forward,
 * drop and degradation is logged through ctx.emitLog — see busAdapter.ts for
 * the full echo-safety / origin-spoof / hover-unbridged design doc.
 */

import type { BusEvent } from "../../packages/editor-shell/src/seams/bus.js";
import type { SelectEvent } from "../../packages/graph-view/src/eventBus";
import type { AdapterCtx, EditorSideBus, GraphSideBus } from "./busAdapterCore";

export function makeEditorSide(ctx: AdapterCtx): EditorSideBus {
  return {
    log: ctx.editorLog,
    emit(e: BusEvent): void {
      ctx.stats.editorSideEmits++;
      ctx.editorLog.push(e);
      // Loop back to ALL editor-side subscribers first (LocalSelectionBus
      // semantics — T4's origin echo-guard depends on seeing its own event).
      for (const h of [...ctx.editorHandlers]) h(e);

      if (ctx.injecting) return; // our own graph→editor injection: forwarded already, never re-crossed

      if (e.type !== "node.select") {
        ctx.stats.dropped++;
        ctx.emitLog({
          dir: "editor->graph",
          action: "dropped",
          nodeId: (e as { nodeId?: string }).nodeId ?? null,
          failureClass: "bus-shape-mismatch",
          reason: `editor-side event type ${JSON.stringify((e as { type?: string }).type)} is not "node.select" — not a T4 bus shape; not forwarded`,
        });
        return;
      }
      if (e.origin !== "editor") {
        // Only the adapter itself may put graph-origin events on the editor
        // bus. A third party claiming the far side's origin at this port is a
        // spoof: T4 still sees it (its own recv guards probe it), but it never
        // crosses the seam — forwarding it to T5 as an "editor" selection
        // would fabricate identity, and forwarding as "graph" could echo.
        ctx.stats.dropped++;
        ctx.emitLog({
          dir: "editor->graph",
          action: "dropped",
          nodeId: e.nodeId,
          failureClass: "bus-origin-spoof",
          reason: `origin ${JSON.stringify(e.origin)} injected at the editor port by a non-adapter party — not cross-forwarded`,
        });
        return;
      }
      // editor → graph: T5 expects incoming NON-"graph" sources; "editor" is
      // the honest literal (its link.select.in pin records it verbatim).
      ctx.stats.forwardedEditorToGraph++;
      ctx.emitLog({
        dir: "editor->graph",
        action: "forwarded",
        nodeId: e.nodeId,
        failureClass: null,
        reason: `BusEvent{type:"node.select",origin:"editor",clock:${e.clock}} → {nodeId, source:"editor"} (nodeId byte-identical)`,
      });
      ctx.deliverToGraphSubscribers(e.nodeId, "editor");
    },
    subscribe(handler: (e: BusEvent) => void): () => void {
      ctx.editorHandlers.push(handler);
      return () => {
        const i = ctx.editorHandlers.indexOf(handler);
        if (i >= 0) ctx.editorHandlers.splice(i, 1);
      };
    },
  };
}

export function makeGraphSide(ctx: AdapterCtx, editorSide: EditorSideBus): GraphSideBus {
  return {
    emitted: ctx.graphEmitted,
    emit(evt: { type: "select"; nodeId: string; source: "graph" | "editor" | string }): void {
      ctx.stats.graphSideEmits++;
      ctx.graphEmitted.push(evt as SelectEvent);
      if ((evt as { type?: string }).type !== "select") {
        ctx.stats.dropped++;
        ctx.emitLog({
          dir: "graph->editor",
          action: "dropped",
          nodeId: (evt as { nodeId?: string }).nodeId ?? null,
          failureClass: "bus-shape-mismatch",
          reason: `graph-side event type ${JSON.stringify((evt as { type?: string }).type)} is not "select" — not a T5 bus shape; not looped, not forwarded`,
        });
        return;
      }
      // Loop back to ALL graph-side subscribers (T5's bus contract: "a real
      // bus loops events back to all subscribers" — its source==="graph"
      // filter exists precisely for this, and probes link.echo.ignored).
      ctx.deliverToGraphSubscribers(evt.nodeId, evt.source);

      if (evt.source !== "graph") {
        // T5's link layer only ever EMITS source:"graph". Anything else at
        // this port is a foreign injection wearing the editor's (or a
        // stranger's) identity — the loopback above already let T5's own
        // guards see and probe it; it must not cross to T4 as if the graph
        // pane selected it.
        ctx.stats.dropped++;
        ctx.emitLog({
          dir: "graph->editor",
          action: "dropped",
          nodeId: evt.nodeId,
          failureClass: "bus-origin-spoof",
          reason: `source ${JSON.stringify(evt.source)} emitted at the graph port (T5 emits only "graph") — not cross-forwarded`,
        });
        return;
      }
      // graph → editor: through editorSide.emit so T4's busLog pin carries the
      // event; the `injecting` flag stops the adapter re-forwarding it.
      ctx.stats.forwardedGraphToEditor++;
      ctx.emitLog({
        dir: "graph->editor",
        action: "forwarded",
        nodeId: evt.nodeId,
        failureClass: null,
        reason: `{type:"select",source:"graph"} → BusEvent{type:"node.select",origin:"graph",clock:${ctx.injectClock + 1}} (nodeId byte-identical)`,
      });
      ctx.injecting = true;
      try {
        editorSide.emit({ type: "node.select", nodeId: evt.nodeId, origin: "graph", clock: ++ctx.injectClock });
      } finally {
        ctx.injecting = false;
      }
    },
    on(_type: "select", cb: (evt: { nodeId: string; source: string }) => void): () => void {
      ctx.graphSelectHandlers.push(cb);
      return () => {
        const i = ctx.graphSelectHandlers.indexOf(cb);
        if (i >= 0) ctx.graphSelectHandlers.splice(i, 1);
      };
    },
    // emitHover / onHover DELIBERATELY absent (hover-unbridged, logged at join time).
  };
}
