/**
 * Gates 12 + 13 — layout round-trip (F6: the lost coordinate) and the
 * two-layout-engine cross-check: topology is invariant under layout engine;
 * coordinates differ, node-id and edge-id sets must not.
 */

import { describe, expect, it } from "vitest";
import { ProbeBus } from "./probeBus";
import { KNOWN_PROBE_IDS } from "./probeCatalog";
import { runGraphView } from "./cell";
import { createMockGraphEventBus } from "./eventBus";
import { ingest } from "./ingest";
import { capCheck } from "./cap";
import { paintVerdicts } from "./verdict";
import { buildElkGraph } from "./layoutIn";
import { applyCoords } from "./apply";
import { enforceEngineEdgeSet, EngineEdgeSetViolation, type ElkResult } from "./layout";
import { MERMAID_TRAP, SKELETON, eventsFor, payloadOf, soleEvent } from "./testUtil";

describe("gate 12 — layout round-trip (F6)", () => {
  it("layout.in.edgeCount == layout.out.edgeCount and every node comes back with a coordinate", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    const bus = cell.bus;

    const inCount = payloadOf<{ count: number }>(soleEvent(bus, "layout.in.edgeCount")).count;
    const outCount = payloadOf<{ count: number }>(soleEvent(bus, "layout.out.edgeCount")).count;
    expect(inCount).toBe(2);
    expect(outCount).toBe(2);

    const outNodes = eventsFor(bus, "layout.out.node");
    expect(outNodes).toHaveLength(3);
    for (const e of outNodes) {
      const p = payloadOf<{ x: number; y: number }>(e);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(eventsFor(bus, "apply.node.missingCoord")).toHaveLength(0);

    // Sugiyama sanity: direction DOWN means the dependency (A, used by B) does not
    // sit above its user arbitrarily — B→A and B→C edges rank the layers; just assert
    // the three nodes are not all at one y (layers exist).
    const ys = new Set(outNodes.map((e) => payloadOf<{ y: number }>(e).y));
    expect(ys.size).toBeGreaterThan(1);
  });

  it("a node the engine returned no coordinate for fires apply.node.missingCoord — caught, not a silent 0,0", () => {
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    const { model } = ingest(SKELETON(), bus);
    const cap = capCheck(model, bus);
    const verdict = paintVerdicts(model, bus, cap.cause);
    const layoutIn = buildElkGraph(model, cap, new Set(), bus, verdict.cause);

    // Doctored engine output: node C never placed.
    const doctored: ElkResult = {
      children: [
        { id: "A", x: 0, y: 0, width: 220, height: 64 },
        { id: "B", x: 0, y: 150, width: 220, height: 64 },
      ],
      edges: [
        { id: "e-AB", sections: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 150 }, bendPoints: [] }] },
        { id: "e-BC", sections: [{ startPoint: { x: 0, y: 150 }, endPoint: { x: 0, y: 300 }, bendPoints: [] }] },
      ],
    };
    const applied = applyCoords(model, verdict.paints, layoutIn, doctored, bus, "test#0");

    expect(applied.missingCoordIds).toEqual(["C"]);
    const missing = soleEvent(bus, "apply.node.missingCoord");
    expect(payloadOf<object>(missing)).toEqual({ id: "C", reason: "engine returned no position for this node" });
  });
});

describe("gate 12b — term 3 is ENFORCED: the engine's output edge-id multiset must equal its input", () => {
  const echo = { note: "elk input echo" };

  it("an engine-EATEN edge → layout.error probe + EngineEdgeSetViolation throw", () => {
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    expect(() => enforceEngineEdgeSet(["e-1", "e-2"], ["e-1"], bus, "test#0", echo)).toThrow(EngineEdgeSetViolation);
    const err = payloadOf<{ message: string }>(soleEvent(bus, "layout.error"));
    expect(err.message).toContain("missing=[e-2]");
  });

  it("an engine-INVENTED edge → layout.error probe + throw", () => {
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    expect(() => enforceEngineEdgeSet(["e-1"], ["e-1", "e-GHOST"], bus, "test#0", echo)).toThrow(EngineEdgeSetViolation);
    expect(payloadOf<{ message: string }>(soleEvent(bus, "layout.error")).message).toContain("invented=[e-GHOST]");
  });

  it("an engine-DUPLICATED edge → layout.error probe + throw", () => {
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    expect(() => enforceEngineEdgeSet(["e-1"], ["e-1", "e-1"], bus, "test#0", echo)).toThrow(EngineEdgeSetViolation);
    expect(payloadOf<{ message: string }>(soleEvent(bus, "layout.error")).message).toContain("duplicated=[e-1]");
  });

  it("a faithful engine passes with no layout.error", () => {
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    expect(() => enforceEngineEdgeSet(["e-1", "e-2"], ["e-2", "e-1"], bus, "test#0", echo)).not.toThrow();
    expect(eventsFor(bus, "layout.error")).toHaveLength(0);
  });
});

describe("gate 13 — two-layout-engine cross-check (topology invariant under engine)", () => {
  for (const fixtureName of ["skeleton", "mermaid-trap"] as const) {
    it(`${fixtureName}: ELK and dagre render identical node-id and edge-id sets`, async () => {
      const fixture = fixtureName === "skeleton" ? SKELETON() : MERMAID_TRAP();
      const fixture2 = fixtureName === "skeleton" ? SKELETON() : MERMAID_TRAP();
      const elkCell = await runGraphView(fixture, createMockGraphEventBus(), { engine: "elkjs" });
      const dagreCell = await runGraphView(fixture2, createMockGraphEventBus(), { engine: "@dagrejs/dagre" });

      const nodeIds = (c: typeof elkCell) => c.rfNodes.map((n) => n.id).sort();
      const edgeIds = (c: typeof elkCell) => c.rfEdges.map((e) => e.id).sort();
      expect(nodeIds(elkCell)).toEqual(nodeIds(dagreCell));
      expect(edgeIds(elkCell)).toEqual(edgeIds(dagreCell));

      // The ENGINE OUTPUT id sets must also agree — comparing only the rendered
      // arrays would compare engine-independent data with itself (a vacuous gate).
      const outNodeIds = (c: typeof elkCell) =>
        eventsFor(c.bus, "layout.out.node").map((e) => payloadOf<{ id: string }>(e).id).sort();
      const outEdgeIds = (c: typeof elkCell) =>
        eventsFor(c.bus, "layout.out.edge").map((e) => payloadOf<{ id: string }>(e).id).sort();
      expect(outNodeIds(elkCell)).toEqual(outNodeIds(dagreCell));
      expect(outEdgeIds(elkCell)).toEqual(outEdgeIds(dagreCell));
      for (const cell of [elkCell, dagreCell]) {
        expect(eventsFor(cell.bus, "apply.node.missingCoord")).toHaveLength(0);
      }

      // Both engines pass both equality gates, on the probes.
      for (const cell of [elkCell, dagreCell]) {
        expect(payloadOf<{ equal: boolean }>(soleEvent(cell.bus, "render.node.equality")).equal).toBe(true);
        expect(payloadOf<{ equal: boolean }>(soleEvent(cell.bus, "render.edge.equality")).equal).toBe(true);
      }

      // Honest engine identity differs and is probed.
      expect(payloadOf<{ name: string; spdx: string }>(soleEvent(elkCell.bus, "layout.engine"))).toMatchObject({
        name: "elkjs", spdx: "EPL-2.0",
      });
      expect(payloadOf<{ name: string; spdx: string }>(soleEvent(dagreCell.bus, "layout.engine"))).toMatchObject({
        name: "@dagrejs/dagre", spdx: "MIT",
      });

      // dagre reads FREE port constraints (no ELK-style ports).
      expect(payloadOf<{ portConstraints: string }>(soleEvent(dagreCell.bus, "layout.in.ports")).portConstraints).toBe("FREE");
      expect(payloadOf<{ portConstraints: string }>(soleEvent(elkCell.bus, "layout.in.ports")).portConstraints).toBe("FIXED_ORDER");
    });
  }
});
