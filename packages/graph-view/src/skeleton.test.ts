/**
 * Gate 17 — self-test-in-isolation: the full S0–S7 walking skeleton (§8) against
 * the 3-node/2-edge fixture with a MOCK Tree 4 bus and no real Tree 1 producer,
 * asserting purely on probe output. A cell that can't self-test in isolation is
 * not done.
 */

import { describe, expect, it } from "vitest";
import { runGraphView } from "./cell";
import { createMockGraphEventBus } from "./eventBus";
import { SKELETON, eventsFor, payloadOf, soleEvent } from "./testUtil";
import type { ProbeEvent } from "./probeBus";

describe("the walking skeleton (§8) — smallest end-to-end slice, fully instrumented", () => {
  it("runs S0–S7 end-to-end with the expected paint, counts, gates, and introspection", async () => {
    const mockBus = createMockGraphEventBus();
    // A stand-in DOM centering hook so link.select.center can honestly report
    // centered:true (without one it reports false with a reason — see link.test).
    const cell = await runGraphView(SKELETON(), mockBus, {
      linkHooks: { centerAndHighlight: () => ({ x: 0, y: 0, zoom: 1.2 }) },
    });
    const bus = cell.bus;

    // ── §8.2 paint: A green/green, B amber body + RED ring (worst-of), C the never-green pair
    const dump = cell.dump();
    expect(dump.paints["A"]).toMatchObject({ fillColor: "#2E7D32", outlineColor: "#2E7D32" });
    expect(dump.paints["B"]).toMatchObject({ fillColor: "#F9A825", outlineColor: "#C62828" });
    expect(dump.paints["C"]).toMatchObject({
      fillColor: "#9E9E9E", fillHatched: true, outlineColor: "#9E9E9E", outlineWasNull: true,
    });
    expect(eventsFor(bus, "verdict.fill.unknownGuard")).toHaveLength(1);
    expect(eventsFor(bus, "verdict.outline.nullBranch")).toHaveLength(1);

    // ── §8.3 layout: ELK ran, 2 edges in == 2 edges out, coordinates applied
    expect(payloadOf<{ count: number }>(soleEvent(bus, "layout.in.edgeCount")).count).toBe(2);
    expect(payloadOf<{ count: number }>(soleEvent(bus, "layout.out.edgeCount")).count).toBe(2);
    expect(eventsFor(bus, "apply.node.position")).toHaveLength(3);

    // ── §8.4 render: 3 light nodes + 2 edges (one solid, one lead-dashed), equality gates green
    expect(cell.rfNodes).toHaveLength(3);
    for (const n of cell.rfNodes) expect(n.data.mode).toBe("light");
    expect(payloadOf<{ equal: boolean; eaten: string[]; phantom: string[] }>(
      soleEvent(bus, "render.edge.equality"),
    )).toMatchObject({ equal: true, eaten: [], phantom: [] });
    expect(eventsFor(bus, "render.edge.leadGuard")).toHaveLength(1);
    expect(payloadOf<{ edgeId: string }>(eventsFor(bus, "render.edge.leadGuard")[0]).edgeId).toBe("e-BC");

    // ── §8.5 brushing: click A → out; deliver B → center; deliver ZZZ → logged branch; expand A
    cell.controller.clickNode("A");
    expect(mockBus.emitted.at(-1)).toEqual({ type: "select", nodeId: "A", source: "graph" });

    mockBus.deliverSelect("B");
    expect(payloadOf<{ nodeId: string; centered: boolean; highlighted: boolean }>(
      eventsFor(bus, "link.select.center").at(-1)!,
    )).toMatchObject({ nodeId: "B", centered: true, highlighted: true });

    mockBus.deliverSelect("ZZZ");
    expect(payloadOf<{ nodeId: string }>(soleEvent(bus, "link.select.unknownId")).nodeId).toBe("ZZZ");

    expect(cell.controller.requestExpand("A")).toBe(true);
    expect(payloadOf<{ granted: boolean }>(eventsFor(bus, "link.expand.request").at(-1)!).granted).toBe(true);

    // ── §8.6 introspection
    expect(cell.probeCatalog().length).toBeGreaterThanOrEqual(61);
    const history = cell.history();
    expect(history.length).toBeGreaterThan(50);
    expect(history.map((e) => e.logicalClock)).toEqual(history.map((_, i) => i));

    const d = cell.dump();
    expect(d.model.nodes).toHaveLength(3);
    expect(d.cap.mode).toBe("full");
    expect(d.elkIn.children).toHaveLength(3);
    expect(d.elkOut.children).toHaveLength(3);
    expect(d.rfNodes).toHaveLength(3);
    expect(d.engine.name).toBe("elkjs");
    expect(d.selection.selectedId).toBe("B"); // the delivered select landed
    expect(d.selection.expandedIds).toEqual(["A"]);
  });

  it("tap(probeId) streams one live lead (tap render.edge.equality watches the Mermaid-& gate)", async () => {
    const mockBus = createMockGraphEventBus();
    // tap() needs the bus before the run: inject one (the production entry point
    // exposes tap post-run for the NEXT run; the injected-bus seam covers live taps).
    const { ProbeBus } = await import("./probeBus");
    const { KNOWN_PROBE_IDS } = await import("./probeCatalog");
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    const seen: ProbeEvent[] = [];
    const untap = bus.tap("render.edge.equality", (e) => seen.push(e));
    await runGraphView(SKELETON(), mockBus, { bus });
    expect(seen).toHaveLength(1);
    expect((seen[0].payload as { equal: boolean }).equal).toBe(true);
    untap();
  });

  it("the cap-bite variant (§8.2): MAX_NODES=2 on the 3-node graph — banner shown, nothing silently dropped", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus(), { capConfig: { maxNodes: 2 } });
    const log = payloadOf<{ bannerShown: boolean }>(soleEvent(cell.bus, "cap.log"));
    expect(log.bannerShown).toBe(true);
    expect(eventsFor(cell.bus, "cap.dropped")).toHaveLength(0);
    expect(cell.rfNodes).toHaveLength(3); // all three still render, light-only
  });
});
