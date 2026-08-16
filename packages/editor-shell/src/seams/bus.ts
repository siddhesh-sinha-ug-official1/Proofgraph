/**
 * Tree 5 seam — the shared selection event bus (shape per build prompt §7.7(c);
 * Tree 5 exports the identical interface; §9.3 proves ids cross it untouched).
 */

export interface BusEvent {
  type: "node.select";
  nodeId: string;
  origin: "editor" | "graph";
  clock: number;
}

export interface SelectionBus {
  emit(e: BusEvent): void;
  subscribe(handler: (e: BusEvent) => void): () => void; // returns unsubscribe
}

/** Simple synchronous local bus — deterministic delivery order (FIFO handlers). */
export class LocalSelectionBus implements SelectionBus {
  private handlers: Array<(e: BusEvent) => void> = [];
  readonly log: BusEvent[] = [];

  emit(e: BusEvent): void {
    this.log.push(e);
    for (const h of [...this.handlers]) h(e);
  }

  subscribe(handler: (e: BusEvent) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const i = this.handlers.indexOf(handler);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }
}
