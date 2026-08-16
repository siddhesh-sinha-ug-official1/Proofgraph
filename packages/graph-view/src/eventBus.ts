/**
 * Tree 4's event-bus contract — the vasculature carrying SHARED IDs.
 * Clean-room stub: this cell imports ONLY this interface (§7.6), never the editor.
 * The real Tree 4 bus wires in later by satisfying this same interface — the seam
 * is this file, nothing else.
 */

export interface SelectEvent {
  type: "select";
  nodeId: string;
  source: "graph" | "editor" | string;
}

export interface HoverEvent {
  type: "hover";
  nodeId: string;
  source: "graph" | "editor" | string;
}

export interface GraphEventBus {
  emit(evt: { type: "select"; nodeId: string; source: "graph" | "editor" | string }): void;
  on(type: "select", cb: (evt: { nodeId: string; source: string }) => void): () => void; // returns unsubscribe
}

/**
 * Optional extension this cell also drives when the bus supports it (hover-brushing).
 * The mock implements it; a real bus that lacks it degrades to select-only linking.
 */
export interface GraphEventBusWithHover extends GraphEventBus {
  emitHover?(evt: HoverEvent): void;
  onHover?(cb: (evt: { nodeId: string; source: string }) => void): () => void;
}

/** Local mock of Tree 4's bus — the self-test substrate (Operating Contract rule 6). */
export function createMockGraphEventBus(): GraphEventBusWithHover & {
  emitted: SelectEvent[];
  emittedHover: HoverEvent[];
  /** Test helper: deliver an event as if the editor sent it. */
  deliverSelect(nodeId: string, source?: string): void;
  deliverHover(nodeId: string, source?: string): void;
} {
  const selectSubs: ((evt: { nodeId: string; source: string }) => void)[] = [];
  const hoverSubs: ((evt: { nodeId: string; source: string }) => void)[] = [];
  const emitted: SelectEvent[] = [];
  const emittedHover: HoverEvent[] = [];
  return {
    emitted,
    emittedHover,
    emit(evt) {
      emitted.push(evt as SelectEvent);
      // A real bus loops events back to all subscribers, including the sender's own view.
      selectSubs.forEach((cb) => cb({ nodeId: evt.nodeId, source: evt.source }));
    },
    on(_type, cb) {
      selectSubs.push(cb);
      return () => {
        const i = selectSubs.indexOf(cb);
        if (i >= 0) selectSubs.splice(i, 1);
      };
    },
    emitHover(evt) {
      emittedHover.push(evt);
      hoverSubs.forEach((cb) => cb({ nodeId: evt.nodeId, source: evt.source }));
    },
    onHover(cb) {
      hoverSubs.push(cb);
      return () => {
        const i = hoverSubs.indexOf(cb);
        if (i >= 0) hoverSubs.splice(i, 1);
      };
    },
    deliverSelect(nodeId, source = "editor") {
      selectSubs.forEach((cb) => cb({ nodeId, source }));
    },
    deliverHover(nodeId, source = "editor") {
      hoverSubs.forEach((cb) => cb({ nodeId, source }));
    },
  };
}
