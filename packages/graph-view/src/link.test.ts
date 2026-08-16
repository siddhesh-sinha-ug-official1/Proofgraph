/**
 * Gates 10 + 11 — selection round-trips OUT and IN via the shared-ID bus.
 * The one-line wire still gets a test (Operating Contract rule 4). An absent
 * incoming id is a logged branch, never a crash.
 */

import { describe, expect, it } from "vitest";
import { runGraphView } from "./cell";
import { createMockGraphEventBus } from "./eventBus";
import { SKELETON, eventsFor, payloadOf, soleEvent } from "./testUtil";

describe("gate 10 — selection round-trip OUT (graph → bus)", () => {
  it("click node A → link.select.out + link.bus.emit carry the exact shared nodeId", async () => {
    const mockBus = createMockGraphEventBus();
    const cell = await runGraphView(SKELETON(), mockBus);
    cell.controller.clickNode("A");

    expect(payloadOf<object>(soleEvent(cell.bus, "link.select.out"))).toEqual({
      nodeId: "A", source: "graph", trigger: "click",
    });
    const busEmits = eventsFor(cell.bus, "link.bus.emit");
    expect(busEmits).toHaveLength(1);
    expect(payloadOf<object>(busEmits[0])).toEqual({ type: "select", nodeId: "A", source: "graph" });

    // The wire actually carried it: the mock Tree 4 bus received the exact event.
    expect(mockBus.emitted).toEqual([{ type: "select", nodeId: "A", source: "graph" }]);

    // Selection state transition probed for causal replay — EXACTLY once. The bus
    // loops our own emission back; the echo must be filtered (probed, not silent),
    // never re-entering the editor→graph path for a purely local click.
    const state = eventsFor(cell.bus, "link.select.state");
    expect(state).toHaveLength(1);
    expect(payloadOf<object>(state[0])).toEqual({ selectedId: "A", previousId: null });
    expect(eventsFor(cell.bus, "link.select.in")).toHaveLength(0);
    expect(eventsFor(cell.bus, "link.select.center")).toHaveLength(0);
    const echo = eventsFor(cell.bus, "link.echo.ignored");
    expect(echo).toHaveLength(1);
    expect(payloadOf<{ type: string; nodeId: string; source: string }>(echo[0])).toMatchObject({
      type: "select", nodeId: "A", source: "graph",
    });
  });

  it("hover brushing: hovering a node emits a soft-brush id to the bus", async () => {
    const mockBus = createMockGraphEventBus();
    const cell = await runGraphView(SKELETON(), mockBus);
    cell.controller.hoverNode("B");

    expect(payloadOf<object>(soleEvent(cell.bus, "link.hover.out"))).toEqual({
      nodeId: "B", source: "graph", trigger: "hover",
    });
    expect(mockBus.emittedHover).toEqual([{ type: "hover", nodeId: "B", source: "graph" }]);
  });

  it("multi-select round-trips a SET of ids, with each add/remove transition probed", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    cell.controller.clickNode("A", { multi: true });
    cell.controller.clickNode("B", { multi: true });
    cell.controller.clickNode("A", { multi: true }); // toggle off

    const transitions = eventsFor(cell.bus, "link.multiSelect").map((e) => e.payload);
    expect(transitions).toEqual([
      { selectedIds: ["A"], added: "A" },
      { selectedIds: ["A", "B"], added: "B" },
      { selectedIds: ["B"], removed: "A" },
    ]);
    expect([...cell.controller.multiSelected]).toEqual(["B"]);
    // The echo must not corrupt single-selection: a multi-click never sets
    // selectedId via the looped-back event.
    expect(cell.controller.selectedId).toBe(null);
    expect(eventsFor(cell.bus, "link.select.state")).toHaveLength(0);
    expect(eventsFor(cell.bus, "link.echo.ignored")).toHaveLength(3);
  });
});

describe("gate 11 — selection round-trip IN (bus → graph)", () => {
  it("a present id → link.select.in → resolve → center (highlight + center), state transition probed", async () => {
    const mockBus = createMockGraphEventBus();
    const centered: string[] = [];
    const cell = await runGraphView(SKELETON(), mockBus, {
      linkHooks: {
        centerAndHighlight: (nodeId) => {
          centered.push(nodeId);
          return { x: 10, y: 20, zoom: 1.2 };
        },
      },
    });
    mockBus.deliverSelect("B");

    expect(payloadOf<object>(soleEvent(cell.bus, "link.select.in"))).toEqual({ nodeId: "B", source: "editor" });
    expect(payloadOf<object>(soleEvent(cell.bus, "link.select.resolve"))).toEqual({ nodeId: "B", present: true });
    expect(payloadOf<object>(soleEvent(cell.bus, "link.select.center"))).toEqual({
      nodeId: "B", centered: true, highlighted: true, viewport: { x: 10, y: 20, zoom: 1.2 },
    });
    expect(centered).toEqual(["B"]);
    expect(cell.controller.selectedId).toBe("B");

    // Causal chain: in → resolve → center.
    const inEvt = soleEvent(cell.bus, "link.select.in");
    const resolveEvt = soleEvent(cell.bus, "link.select.resolve");
    const centerEvt = soleEvent(cell.bus, "link.select.center");
    expect(resolveEvt.causeId).toBe(`link.select.in#${inEvt.logicalClock}`);
    expect(centerEvt.causeId).toBe(`link.select.resolve#${resolveEvt.logicalClock}`);
  });

  it("an absent id → link.select.unknownId branch, no crash, no selection change", async () => {
    const mockBus = createMockGraphEventBus();
    const cell = await runGraphView(SKELETON(), mockBus);
    mockBus.deliverSelect("ZZZ");

    expect(payloadOf<object>(soleEvent(cell.bus, "link.select.resolve"))).toEqual({ nodeId: "ZZZ", present: false });
    expect(payloadOf<object>(soleEvent(cell.bus, "link.select.unknownId"))).toEqual({
      nodeId: "ZZZ", reason: "selected id not in this graph — no-op, not a crash",
    });
    expect(eventsFor(cell.bus, "link.select.center")).toHaveLength(0);
    expect(cell.controller.selectedId).toBe(null);
  });

  it("incoming hover-brush highlights without centering or changing selection", async () => {
    const mockBus = createMockGraphEventBus();
    const hovered: (string | null)[] = [];
    const cell = await runGraphView(SKELETON(), mockBus, {
      linkHooks: { onHoverIn: (id) => hovered.push(id) },
    });
    mockBus.deliverHover("A");

    expect(payloadOf<object>(soleEvent(cell.bus, "link.hover.in"))).toEqual({ nodeId: "A", source: "editor" });
    expect(hovered).toEqual(["A"]);
    expect(cell.controller.selectedId).toBe(null); // hover never selects
    expect(eventsFor(cell.bus, "link.select.center")).toHaveLength(0); // and never centers
  });

  it("the bus subscription itself is probed and reports what was ACTUALLY subscribed", async () => {
    // The mock bus supports hover, so the subscription probe must say so.
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    expect(payloadOf<object>(soleEvent(cell.bus, "link.bus.subscribe"))).toEqual({
      busId: "tree4.event-bus", eventTypes: ["select", "hover"],
    });
  });

  it("a hover-less Tree 4 bus degrades to select-only linking OUT LOUD", async () => {
    // A minimal bus implementing ONLY the required GraphEventBus contract.
    const subs: ((evt: { nodeId: string; source: string }) => void)[] = [];
    const bareBus = {
      emit() {},
      on(_t: "select", cb: (evt: { nodeId: string; source: string }) => void) {
        subs.push(cb);
        return () => {};
      },
    };
    const cell = await runGraphView(SKELETON(), bareBus);
    expect(payloadOf<{ eventTypes: string[] }>(soleEvent(cell.bus, "link.bus.subscribe")).eventTypes).toEqual(["select"]);
    cell.controller.hoverNode("A");
    expect(payloadOf<object>(soleEvent(cell.bus, "link.hover.unsupported"))).toMatchObject({
      nodeId: "A",
    });
    // link.hover.out fired (the intent), but no link.bus.emit for it (the drop is probed).
    expect(eventsFor(cell.bus, "link.hover.out")).toHaveLength(1);
    expect(eventsFor(cell.bus, "link.bus.emit")).toHaveLength(0);
  });

  it("headless center honesty: with no DOM hook bound, link.select.center reports centered:false with a reason", async () => {
    const mockBus = createMockGraphEventBus();
    const cell = await runGraphView(SKELETON(), mockBus); // no linkHooks
    mockBus.deliverSelect("B");
    const center = payloadOf<{ centered: boolean; highlighted: boolean; reason?: string }>(
      soleEvent(cell.bus, "link.select.center"),
    );
    expect(center.centered).toBe(false);
    expect(center.highlighted).toBe(false);
    expect(center.reason).toContain("no DOM centering hook");
    expect(cell.controller.selectedId).toBe("B"); // selection still applies
  });
});
