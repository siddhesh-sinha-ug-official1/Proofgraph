/**
 * Stub of the far end of the event bus — the role Tree 5's graph pane plays.
 * Records everything it hears; can re-broadcast an id as a graph-origin event
 * (the §9.3 round-trip driver). The stub itself is inspectable so tests can
 * assert what the OTHER pane received, not just what we think we sent.
 */

import type { BusEvent, SelectionBus } from "../../src/seams/bus.js";

export class StubGraphPane {
  private bus: SelectionBus;
  readonly heard: BusEvent[] = [];
  private clock = 0;

  constructor(bus: SelectionBus) {
    this.bus = bus;
    bus.subscribe((e) => {
      this.heard.push(e);
    });
  }

  /** Events that originated in the editor pane (what Tree 5 would act on). */
  heardFromEditor(): BusEvent[] {
    return this.heard.filter((e) => e.origin === "editor");
  }

  /** Simulate the graph pane selecting a node (drives the editor's recv path). */
  select(nodeId: string): void {
    this.bus.emit({ type: "node.select", nodeId, origin: "graph", clock: ++this.clock });
  }

  /** Re-broadcast a previously heard editor event as-is (echo scenario). */
  reflect(e: BusEvent): void {
    this.bus.emit(e);
  }
}
