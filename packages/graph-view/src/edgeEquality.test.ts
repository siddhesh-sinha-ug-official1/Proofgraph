/**
 * Gates 3, 4, 5 — THE Mermaid-`&` gate, no-phantom-edge, and the lead guard.
 * F1 (the eaten edge): the mermaid-trap fixture has two edges sharing a source —
 * exactly the `X & Y --> …` shorthand shape a naive encoder collapses. The gate
 * asserts the edge-id SET survives the whole chain, then a NEGATIVE test injects
 * an encoder that drops one edge and proves the merge is blocked.
 * F3 (the promoted lead): every resolved=false edge is a leadEdge, on the probe.
 * F8 (the phantom edge): an edge never in the schema is refused.
 */

import { describe, expect, it } from "vitest";
import { ProbeBus } from "./probeBus";
import { KNOWN_PROBE_IDS } from "./probeCatalog";
import { runGraphView } from "./cell";
import { EdgeSetViolation, LeadPromotionViolation, renderGate } from "./renderGate";
import { createMockGraphEventBus } from "./eventBus";
import { ingest } from "./ingest";
import { capCheck } from "./cap";
import type { ApplyResult, RFEdge } from "./apply";
import type { EdgeEncoder } from "./layoutIn";
import { MERMAID_TRAP, SKELETON, eventsFor, payloadOf, soleEvent } from "./testUtil";

describe("gate 3 — edge-set equality (the Mermaid-& lesson)", () => {
  it("both shared-source edges survive schema → ELK-in → ELK-out → render as distinct edges", async () => {
    const cell = await runGraphView(MERMAID_TRAP(), createMockGraphEventBus());
    const bus = cell.bus;

    // The four-term equality chain.
    const t1 = payloadOf<{ accepted: number }>(soleEvent(bus, "ingest.edge.count")).accepted;
    const t2 = payloadOf<{ count: number }>(soleEvent(bus, "layout.in.edgeCount")).count;
    const t3 = payloadOf<{ count: number }>(soleEvent(bus, "layout.out.edgeCount")).count;
    const t4 = payloadOf<{ count: number }>(soleEvent(bus, "render.edge.count")).count;
    expect([t1, t2, t3, t4]).toEqual([2, 2, 2, 2]);

    const equality = payloadOf<{ equal: boolean; eaten: string[]; phantom: string[]; renderedEdgeIds: string[] }>(
      soleEvent(bus, "render.edge.equality"),
    );
    expect(equality.equal).toBe(true);
    expect(equality.eaten).toEqual([]);
    expect(equality.phantom).toEqual([]);
    expect([...equality.renderedEdgeIds].sort()).toEqual(["e-XY", "e-XZ"]);
    expect(eventsFor(bus, "render.edge.eaten")).toHaveLength(0);
  });

  it("NEGATIVE: an encoder that collapses shared-source edges is caught — render.edge.eaten fires and the merge is blocked", async () => {
    // The naive `X & Y --> Z` collapse: keep only the first edge per source.
    const collapsingEncoder: EdgeEncoder = (edges) => {
      const seenSources = new Set<string>();
      return edges.filter((e) => {
        if (seenSources.has(e.sources[0])) return false;
        seenSources.add(e.sources[0]);
        return true;
      });
    };
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    await expect(
      runGraphView(MERMAID_TRAP(), createMockGraphEventBus(), { bus, edgeEncoder: collapsingEncoder }),
    ).rejects.toThrow(EdgeSetViolation);

    const equality = payloadOf<{ equal: boolean; eaten: string[] }>(soleEvent(bus, "render.edge.equality"));
    expect(equality.equal).toBe(false);
    expect(equality.eaten).toEqual(["e-XZ"]);
    const eaten = soleEvent(bus, "render.edge.eaten");
    expect(payloadOf<object>(eaten)).toEqual({ edgeId: "e-XZ", srcId: "X", dstId: "Z", kind: "calls" });
  });
});

describe("gate 3b — the equality chain is multiplicity-aware (a doubled id is not a set-equality freebie)", () => {
  it("NEGATIVE (integration): an encoder that DUPLICATES an edge id is caught loudly by some gate", async () => {
    const duplicatingEncoder: EdgeEncoder = (edges) => [...edges, edges[0]];
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    // Which gate fires depends on whether the engine dedupes (S4 multiset mismatch)
    // or echoes both (S6 duplicate-as-phantom) — either way the merge is blocked.
    await expect(
      runGraphView(MERMAID_TRAP(), createMockGraphEventBus(), { bus, edgeEncoder: duplicatingEncoder }),
    ).rejects.toThrow();
    const layoutErrors = eventsFor(bus, "layout.error");
    const equality = bus.last("render.edge.equality");
    const caughtAtS4 = layoutErrors.length > 0;
    const caughtAtS6 = equality !== undefined && (equality.payload as { equal: boolean }).equal === false;
    expect(caughtAtS4 || caughtAtS6).toBe(true);
  });

  it("NEGATIVE (unit): renderGate flags a duplicated rendered edge id as phantom and throws", () => {
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    const { model } = ingest(MERMAID_TRAP(), bus);
    const cap = capCheck(model, bus);
    const mk = (id: string): RFEdge => {
      const e = model.edges.find((x) => x.id === id)!;
      return { id, source: e.srcId, target: e.dstId, type: "resolvedEdge", data: { edge: e, points: [] } };
    };
    const applied: ApplyResult = {
      rfNodes: model.nodes.map((n) => ({
        id: n.id, type: "proofNode", position: { x: 0, y: 0 }, width: 220, height: 64, handles: [],
        data: {
          node: n,
          paint: { nodeId: n.id, fillColor: "#2E7D32", fillStatus: "green", fillHatched: false, outlineColor: "#9E9E9E", outlineStatus: "unknown", outlineWasNull: true },
          mode: "light", placeholder: false,
        },
      })),
      rfEdges: [mk("e-XY"), mk("e-XZ"), mk("e-XY")], // e-XY doubled
      phantomEdgeIds: [],
      expectedPlaceholderIds: [],
      missingCoordIds: [],
      cause: "test#0",
    };
    expect(() => renderGate(model, cap, applied, bus)).toThrow(EdgeSetViolation);
    const equality = payloadOf<{ equal: boolean; phantom: string[] }>(soleEvent(bus, "render.edge.equality"));
    expect(equality.equal).toBe(false);
    expect(equality.phantom).toContain("e-XY");
  });
});

describe("gate 4 — no phantom edge (F8)", () => {
  it("an edge rendered that was never in the schema fires render.edge.phantom and blocks the merge", async () => {
    const phantomEncoder: EdgeEncoder = (edges) => [
      ...edges,
      { id: "e-GHOST", sources: ["X"], targets: ["Y"] },
    ];
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    await expect(
      runGraphView(MERMAID_TRAP(), createMockGraphEventBus(), { bus, edgeEncoder: phantomEncoder }),
    ).rejects.toThrow(EdgeSetViolation);

    const equality = payloadOf<{ equal: boolean; phantom: string[] }>(soleEvent(bus, "render.edge.equality"));
    expect(equality.equal).toBe(false);
    expect(equality.phantom).toContain("e-GHOST");
    expect(payloadOf<{ edgeId: string }>(soleEvent(bus, "render.edge.phantom")).edgeId).toBe("e-GHOST");
  });
});

describe("gate 5 — resolved=false is a lead, never a solid edge (F3)", () => {
  it("NEGATIVE: a lead promoted to a solid edge makes renderGate THROW (the guard can actually fail)", () => {
    const bus = new ProbeBus(KNOWN_PROBE_IDS);
    const { model } = ingest(SKELETON(), bus);
    const cap = capCheck(model, bus);
    const applied: ApplyResult = {
      rfNodes: model.nodes.map((n) => ({
        id: n.id, type: "proofNode", position: { x: 0, y: 0 }, width: 220, height: 64, handles: [],
        data: {
          node: n,
          paint: { nodeId: n.id, fillColor: "#9E9E9E", fillStatus: "unknown", fillHatched: true, outlineColor: "#9E9E9E", outlineStatus: "unknown", outlineWasNull: true },
          mode: "light", placeholder: false,
        },
      })),
      rfEdges: model.edges.map((e) => ({
        id: e.id, source: e.srcId, target: e.dstId,
        type: "resolvedEdge", // e-BC has resolved=false — this is the promotion defect
        data: { edge: e, points: [] },
      })),
      phantomEdgeIds: [],
      expectedPlaceholderIds: [],
      missingCoordIds: [],
      cause: "test#0",
    };
    expect(() => renderGate(model, cap, applied, bus)).toThrow(LeadPromotionViolation);
  });

  it("e-BC renders as leadEdge with the guard branch on the probe stream", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    const bus = cell.bus;

    const leadEdge = cell.rfEdges.find((e) => e.id === "e-BC")!;
    expect(leadEdge.type).toBe("leadEdge");
    const solidEdge = cell.rfEdges.find((e) => e.id === "e-AB")!;
    expect(solidEdge.type).toBe("resolvedEdge");

    // Assert on the probe, not just the object (Probe Density Contract §7).
    const guards = eventsFor(bus, "render.edge.leadGuard");
    expect(guards).toHaveLength(1);
    expect(payloadOf<object>(guards[0])).toEqual({
      edgeId: "e-BC", resolved: false, style: "lead-dashed",
      reason: "resolved=false is a lead, not an edge — never drawn as a solid real relationship",
    });
    const renderedBC = eventsFor(bus, "render.edge").find((e) => (e.payload as { id: string }).id === "e-BC")!;
    expect(payloadOf<{ style: string; resolved: boolean }>(renderedBC)).toMatchObject({
      style: "lead-dashed", resolved: false,
    });
  });

  it("an edge to an unresolved-target placeholder still renders as a lead against a ghost node", async () => {
    // Ruling 3: the placeholder-targeting lead lives in leads[] now.
    const fixture = SKELETON() as { leads: { dstId: string }[] };
    fixture.leads[0].dstId = "unresolved:ext.mystery";
    const cell = await runGraphView(fixture, createMockGraphEventBus());

    const ghost = cell.rfNodes.find((n) => n.id === "unresolved:ext.mystery")!;
    expect(ghost.data.placeholder).toBe(true);
    expect(ghost.data.paint.fillHatched).toBe(true); // a ghost has no verdict — never green
    const equality = payloadOf<{ equal: boolean; placeholderNodes: number }>(
      soleEvent(cell.bus, "render.node.equality"),
    );
    expect(equality.equal).toBe(true);
    expect(equality.placeholderNodes).toBe(1);
    expect(payloadOf<{ equal: boolean }>(soleEvent(cell.bus, "render.edge.equality")).equal).toBe(true);
  });
});
