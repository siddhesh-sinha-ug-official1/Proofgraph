/**
 * V5 — THE JOIN ADAPTER: editor-shell bus ⇄ graph-view bus.
 *
 * Assembly code (proofgraph/app), NOT cell code: it satisfies BOTH cells' bus
 * interfaces exactly as their walls speak them today and maps shapes between
 * them, preserving nodeIds byte-identical. Neither cell is modified.
 *
 *   T4 (editor-shell)  SelectionBus:      BusEvent {type:"node.select", nodeId, origin:"editor"|"graph", clock}
 *   T5 (graph-view)    GraphEventBus:     {type:"select", nodeId, source:"graph"|"editor"|string} (+ optional hover)
 *
 * ECHO SAFETY — both cells' own guards must keep working through the join:
 *   - T4 echo-guards by ORIGIN: it ignores origin:"editor" events looped back
 *     to it (selection.ts "own editor-origin event reflected back") and its
 *     recv path never re-emits (inRecv flag). So the editor side of this
 *     adapter behaves exactly like the cell's LocalSelectionBus: emissions
 *     loop back to ALL editor-side subscribers (including the emitter).
 *   - T5 echo-filters on the LITERAL source string "graph" (link.ts:
 *     `if (evt.source === "graph")` → link.echo.ignored). So graph-side
 *     emissions loop back to T5's own subscribers (its mock bus documents
 *     "a real bus loops events back to all subscribers") where its own filter
 *     eats them, and editor-origin events are delivered with source:"editor",
 *     which passes the filter.
 *
 * TRANSLATION (the only place shapes cross):
 *   editor → graph:  BusEvent{origin:"editor"}          → deliver {nodeId, source:"editor"} to T5 subscribers
 *   graph  → editor: {type:"select", source:"graph"}    → editorSide.emit({type:"node.select", origin:"graph", clock: adapter-local})
 * Cross-delivery goes to the far side's SUBSCRIBERS directly (editor→graph) or
 * through the editor bus's own emit (graph→editor, so T4's dump().busLog pin —
 * which reads `bus.log` — carries the received event, same as LocalSelectionBus
 * would). An injected event is flagged so the adapter never re-forwards its own
 * injection: the loop has no fixed point that crosses the seam twice.
 *
 * ORIGIN-SPOOF GUARD (failure class `bus-origin-spoof`): an event claiming the
 * FAR side's identity injected at the wrong port is never cross-forwarded —
 * origin:"graph" arriving via editorSide.emit() (only the adapter itself may
 * inject those) or source !== "graph" arriving via graphSide.emit() (T5's link
 * layer only ever emits source:"graph"). Local loopback still happens (each
 * cell's own guard/branch probes it); the drop is logged here, never silent.
 *
 * HOVER (failure/degradation class `hover-unbridged`): T4's SelectionBus has NO
 * hover event — BusEvent's type union is exactly {"node.select"}. Both sides
 * would have to support hover for a pass-through; they don't, so the graph side
 * deliberately exposes NO emitHover/onHover. T5 then (a) subscribes select-only
 * (its link.bus.subscribe pin reports eventTypes:["select"]) and (b) probes
 * every un-deliverable soft-brush as link.hover.unsupported — the degradation
 * is visible on the CELL's own pins, and logged here at join time. Not silent.
 *
 * KNOWN LIMITATION (inherited from T5, logged): T5 filters on the literal
 * source string "graph", so two graph views on one joined bus would ignore each
 * other's selections. This round's assembly shape is ONE editor + ONE view;
 * a per-view origin token is a future membrane round (T5's own comment in
 * link.ts says the same).
 *
 * The adapter keeps its own append-only log + counters (assembly components are
 * fully probed). It never touches either cell's probe bus — those catalogs are
 * the cells' own; the seam test asserts on BOTH cells' pins PLUS this log.
 *
 * SUB200 restructure: this module is now the FACADE — types + shared context
 * in busAdapterCore.ts, the two port factories in busAdapterSides.ts; the
 * join assembly (and the two config log entries) stays here. Public surface
 * unchanged.
 */

import { createAdapterCtx, type JoinedBus } from "./busAdapterCore";
import { makeEditorSide, makeGraphSide } from "./busAdapterSides";

export {
  ADAPTER_VERSION,
  type AdapterFailureClass, type AdapterLogEntry, type EditorSideBus,
  type GraphSideBus, type JoinedBus, type JoinedBusStats,
} from "./busAdapterCore";

export function createJoinedBus(): JoinedBus {
  const ctx = createAdapterCtx();
  const editorSide = makeEditorSide(ctx);
  const graphSide = makeGraphSide(ctx, editorSide);

  ctx.emitLog({
    dir: "config",
    action: "degraded",
    nodeId: null,
    failureClass: "hover-unbridged",
    reason:
      "T4's SelectionBus has no hover event (BusEvent type union is exactly \"node.select\") — hover is NOT bridged; " +
      "graph side exposes no emitHover/onHover, so T5 subscribes select-only (link.bus.subscribe eventTypes:[\"select\"]) " +
      "and probes each soft-brush as link.hover.unsupported. Degradation probed on the cell's pins + logged here.",
  });
  ctx.emitLog({
    dir: "config",
    action: "degraded",
    nodeId: null,
    failureClass: null,
    reason:
      "shape note (inherited T5 limitation): T5 echo-filters on the literal source \"graph\", so two graph views on one " +
      "joined bus would ignore each other. This round's assembly shape is ONE editor + ONE graph view.",
  });

  return {
    editorSide,
    graphSide,
    log: ctx.log,
    stats: () => ({ ...ctx.stats }),
  };
}
