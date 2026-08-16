/**
 * V5 bus adapter core (SUB200 split of busAdapter.ts — no behavior change):
 * the adapter's public types + the shared mutable context (log, counters,
 * handler lists, inject flag/clock) both sides close over. The side factories
 * live in busAdapterSides.ts; busAdapter.ts stays the facade and carries the
 * adapter's full design doc (echo safety, spoof guard, hover-unbridged).
 */

import type { BusEvent, SelectionBus } from "../../packages/editor-shell/src/seams/bus.js";
import type { GraphEventBusWithHover, SelectEvent } from "../../packages/graph-view/src/eventBus";

export const ADAPTER_VERSION = "v5-bus-adapter/1.0.0" as const;

export type AdapterFailureClass = "bus-origin-spoof" | "bus-shape-mismatch" | "hover-unbridged";

export interface AdapterLogEntry {
  seq: number;
  dir: "editor->graph" | "graph->editor" | "config";
  action: "forwarded" | "dropped" | "degraded";
  nodeId: string | null;
  failureClass: AdapterFailureClass | null;
  reason: string;
}

export interface JoinedBusStats {
  /** emit() calls on the editor side — includes the adapter's own graph→editor injections (they go through emit so T4's busLog pin sees them). */
  editorSideEmits: number;
  /** emit() calls on the graph side (T5's outgoing port). */
  graphSideEmits: number;
  forwardedEditorToGraph: number;
  forwardedGraphToEditor: number;
  /** Cross-forwards refused by the origin-spoof / shape guards (each one logged). */
  dropped: number;
}

/** The editor side IS a SelectionBus with the `log` property T4's dump().busLog
 *  pin reads (`(this.bus as {log?}).log`) — same contract as LocalSelectionBus. */
export interface EditorSideBus extends SelectionBus {
  readonly log: BusEvent[];
}

/** The graph side IS a GraphEventBusWithHover; `emitted` records T5's outgoing
 *  events (same inspectability the cell's own mock bus provides). emitHover /
 *  onHover are deliberately ABSENT — see HOVER in busAdapter.ts. */
export interface GraphSideBus extends GraphEventBusWithHover {
  readonly emitted: SelectEvent[];
}

export interface JoinedBus {
  editorSide: EditorSideBus;
  graphSide: GraphSideBus;
  /** Append-only adapter probe log — the vessel's own diagnostic surface. */
  readonly log: readonly AdapterLogEntry[];
  stats(): JoinedBusStats;
}

/** The shared mutable state both side factories close over (one per join). */
export interface AdapterCtx {
  log: AdapterLogEntry[];
  emitLog(e: Omit<AdapterLogEntry, "seq">): void;
  stats: JoinedBusStats;
  // ── editor side (T4's SelectionBus shape) ─────────────────────────────────
  editorHandlers: Array<(e: BusEvent) => void>;
  editorLog: BusEvent[];
  // ── graph side (T5's GraphEventBus shape) ─────────────────────────────────
  graphSelectHandlers: Array<(evt: { nodeId: string; source: string }) => void>;
  graphEmitted: SelectEvent[];
  /** Adapter-local monotonic clock for injected graph→editor BusEvents. It is
   *  NOT the editor's probe clock — T4 treats clock as opaque payload here. */
  injectClock: number;
  /** True only while the adapter itself is emitting its own graph→editor
   *  injection on the editor bus — that emission must not be re-forwarded. */
  injecting: boolean;
  deliverToGraphSubscribers(nodeId: string, source: string): void;
}

export function createAdapterCtx(): AdapterCtx {
  const log: AdapterLogEntry[] = [];
  let seq = 0;
  const ctx: AdapterCtx = {
    log,
    emitLog: (e) => { log.push({ seq: ++seq, ...e }); },
    stats: {
      editorSideEmits: 0,
      graphSideEmits: 0,
      forwardedEditorToGraph: 0,
      forwardedGraphToEditor: 0,
      dropped: 0,
    },
    editorHandlers: [],
    editorLog: [],
    graphSelectHandlers: [],
    graphEmitted: [],
    injectClock: 0,
    injecting: false,
    deliverToGraphSubscribers: (nodeId, source) => {
      for (const cb of [...ctx.graphSelectHandlers]) cb({ nodeId, source });
    },
  };
  return ctx;
}
