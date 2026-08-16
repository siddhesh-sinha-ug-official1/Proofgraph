/**
 * Gate 9 — no-silent-cap (F4). Any bound is logged where the user sees it:
 * banner + cap.log + per-node cap.dropped. Culling ≠ dropping stays separable.
 * Gate 14 (the honest ceiling, F7) lives in capCeiling.test.ts (SUB200
 * restructure — same tests, unchanged assertions).
 */

import { describe, expect, it } from "vitest";
import { runGraphView } from "./cell";
import { createMockGraphEventBus } from "./eventBus";
import { SKELETON, eventsFor, payloadOf, soleEvent } from "./testUtil";

describe("gate 9 — no silent caps (F4)", () => {
  it("MAX_NODES below the node count → light-only, bannerShown=true, NOTHING dropped", async () => {
    // Walking-skeleton step 2: MAX_NODES artificially 2 so the cap bites on 3 nodes.
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus(), {
      capConfig: { maxNodes: 2 },
    });
    const bus = cell.bus;

    expect(payloadOf<{ mode: string }>(soleEvent(bus, "cap.degrade")).mode).toBe("light-only");
    const log = payloadOf<{ bannerShown: boolean; message: string; withheldCount: number }>(soleEvent(bus, "cap.log"));
    expect(log.bannerShown).toBe(true);
    expect(log.message).toContain("light-only");
    expect(log.withheldCount).toBe(0);
    expect(eventsFor(bus, "cap.dropped")).toHaveLength(0); // nothing silently OR loudly dropped

    // All three nodes still render (as light nodes).
    expect(cell.rfNodes.map((n) => n.id).sort()).toEqual(["A", "B", "C"]);
    expect(payloadOf<{ equal: boolean; withheldByCap: number }>(soleEvent(bus, "render.node.equality"))).toMatchObject({
      equal: true, withheldByCap: 0,
    });

    // The branch NOT taken is probed with its reason.
    const notTaken = eventsFor(bus, "cap.degrade.notTaken").map((e) => payloadOf<{ rejectedMode: string }>(e).rejectedMode);
    expect(notTaken.sort()).toEqual(["full", "refuse"]);
  });

  it("refuse mode: every withheld node gets cap.dropped, the banner lists them, equality accounts for them", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus(), {
      capConfig: { maxNodes: 1, hardMaxNodes: 2 },
    });
    const bus = cell.bus;

    expect(payloadOf<{ mode: string }>(soleEvent(bus, "cap.degrade")).mode).toBe("refuse");
    const log = payloadOf<{ bannerShown: boolean; message: string; withheldCount: number }>(soleEvent(bus, "cap.log"));
    expect(log.bannerShown).toBe(true);
    expect(log.withheldCount).toBe(1);
    expect(log.message).toContain("C"); // the banner LISTS what was withheld

    const dropped = eventsFor(bus, "cap.dropped");
    expect(dropped).toHaveLength(1);
    expect(payloadOf<{ nodeId: string }>(dropped[0]).nodeId).toBe("C");

    // cap.dropped only ever fires AFTER the shown banner (causal chain).
    const logEvent = soleEvent(bus, "cap.log");
    expect(dropped[0].causeId).toBe(`cap.log#${logEvent.logicalClock}`);

    // Edges are never withheld silently either: the edge touching the withheld node
    // gets its own cap.edge.dropped event, chained to the banner, and the banner
    // names it.
    const droppedEdges = eventsFor(bus, "cap.edge.dropped");
    expect(droppedEdges).toHaveLength(1);
    expect(payloadOf<object>(droppedEdges[0])).toMatchObject({ edgeId: "e-BC", srcId: "B", dstId: "C" });
    expect(droppedEdges[0].causeId).toBe(`cap.log#${logEvent.logicalClock}`);
    expect(payloadOf<{ message: string }>(logEvent).message).toContain("e-BC");

    // The four-term chain reconciles through the evented withholding:
    // accepted − withheldEdges == layout.in == layout.out == rendered.
    const accepted = payloadOf<{ accepted: number }>(soleEvent(bus, "ingest.edge.count")).accepted;
    const inCount = payloadOf<{ count: number }>(soleEvent(bus, "layout.in.edgeCount")).count;
    const outCount = payloadOf<{ count: number }>(soleEvent(bus, "layout.out.edgeCount")).count;
    const rendered = payloadOf<{ count: number }>(soleEvent(bus, "render.edge.count")).count;
    expect(accepted - droppedEdges.length).toBe(inCount);
    expect(inCount).toBe(outCount);
    expect(outCount).toBe(rendered);

    // render.node.equality accounts for every missing node — none vanished silently.
    expect(payloadOf<object>(soleEvent(bus, "render.node.equality"))).toMatchObject({
      schemaNodes: 3, renderedNodes: 2, withheldByCap: 1, equal: true,
    });
    expect(cell.rfNodes.map((n) => n.id).sort()).toEqual(["A", "B"]);
    // The equality payload reports the FULL schema set with the withholding explicit —
    // never a pre-shrunk "schema" list that hides the subtraction.
    const equality = payloadOf<{ schemaEdgeIds: string[]; withheldEdgeIds: string[]; equal: boolean }>(
      soleEvent(bus, "render.edge.equality"),
    );
    expect(equality.equal).toBe(true);
    expect(equality.schemaEdgeIds.sort()).toEqual(["e-AB", "e-BC"]);
    expect(equality.withheldEdgeIds).toEqual(["e-BC"]);
  });

  it("full mode: no banner, and the rejected degrade branches are still probed with reasons", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    const log = payloadOf<{ bannerShown: boolean }>(soleEvent(cell.bus, "cap.log"));
    expect(log.bannerShown).toBe(false);
    const notTaken = eventsFor(cell.bus, "cap.degrade.notTaken");
    expect(notTaken).toHaveLength(2);
    for (const e of notTaken) expect(payloadOf<{ reason: string }>(e).reason).toContain("under the ceiling");
  });

  it("the initial expandedIds set goes through the SAME cap-checked admission — no side door", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus(), {
      capConfig: { maxExpanded: 2 },
      expandedIds: new Set(["A", "B", "C"]),
    });
    const bus = cell.bus;

    // overExpanded is MEASURED, not a constant.
    expect(payloadOf<{ overExpanded: boolean; requestedExpanded: number }>(soleEvent(bus, "cap.compare"))).toMatchObject({
      overExpanded: true, requestedExpanded: 3,
    });

    // Every requested id got a decision; the third was refused at the ceiling, loudly.
    const requests = eventsFor(bus, "link.expand.request");
    expect(requests).toHaveLength(3);
    expect(requests.map((e) => payloadOf<{ granted: boolean }>(e).granted)).toEqual([true, true, false]);
    const refused = eventsFor(bus, "link.expand.refused");
    expect(refused).toHaveLength(1);
    expect(payloadOf<{ nodeId: string; reason: string }>(refused[0])).toMatchObject({
      nodeId: "C", reason: "MAX_EXPANDED reached",
    });

    // Only the GRANTED set reached layout (expanded Monaco boxes) and the controller.
    const expandedLayout = eventsFor(bus, "layout.in.node")
      .filter((e) => payloadOf<{ mode: string }>(e).mode === "expanded")
      .map((e) => payloadOf<{ id: string }>(e).id);
    expect(expandedLayout.sort()).toEqual(["A", "B"]);
    expect([...cell.controller.expandedIds].sort()).toEqual(["A", "B"]);

    // The controller's budget covers the seeded set: the next expand is refused...
    expect(cell.controller.requestExpand("C")).toBe(false);
    // ...and a pre-expanded node is collapsible (then re-expandable).
    cell.controller.collapseNode("A");
    expect(cell.controller.requestExpand("C")).toBe(true);
  });

  it("in a degraded mode the initial expandedIds are ALL refused with the degrade reason", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus(), {
      capConfig: { maxNodes: 2 }, // light-only
      expandedIds: new Set(["A"]),
    });
    const refused = eventsFor(cell.bus, "link.expand.refused");
    expect(refused).toHaveLength(1);
    expect(payloadOf<{ reason: string }>(refused[0]).reason).toContain("degrade mode light-only");
    expect([...cell.controller.expandedIds]).toEqual([]);
    for (const n of cell.rfNodes) expect(n.data.mode).toBe("light");
  });

  it("MAX_EXPANDED reached → link.expand.refused fires (not a silent no-op)", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus(), {
      capConfig: { maxExpanded: 1 },
    });
    expect(cell.controller.requestExpand("A")).toBe(true);
    expect(cell.controller.requestExpand("B")).toBe(false);

    const refused = eventsFor(cell.bus, "link.expand.refused");
    expect(refused).toHaveLength(1);
    expect(payloadOf<object>(refused[0])).toEqual({
      nodeId: "B", reason: "MAX_EXPANDED reached", maxExpanded: 1,
    });
    const requests = eventsFor(cell.bus, "link.expand.request");
    expect(payloadOf<{ granted: boolean }>(requests[0]).granted).toBe(true);
    expect(payloadOf<{ granted: boolean }>(requests[1]).granted).toBe(false);
  });

  it("culling ≠ dropping: cap.virtualize and render.virtualize reconcile with node equality", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    const capVirt = payloadOf<{ onlyRenderVisibleElements: boolean; reason: string }>(
      soleEvent(cell.bus, "cap.virtualize"),
    );
    expect(capVirt.onlyRenderVisibleElements).toBe(false); // 3 nodes — no culling needed
    const renderVirt = payloadOf<{ inViewport: number; culled: number; cullingOn: boolean }>(
      soleEvent(cell.bus, "render.virtualize"),
    );
    expect(renderVirt).toEqual({ inViewport: 3, culled: 0, cullingOn: false });
  });
});
