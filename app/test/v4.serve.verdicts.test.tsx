/**
 * V4 SEAM TEST — graph-model wall → hub HTTP → graph-view wall, the VERDICT +
 * LEAD honesty tests (SUB200 wave-2 split of v4.serve.test.tsx; shared
 * lifecycle + pin helpers hoisted VERBATIM to test/helpers/v4hub.ts +
 * v4pins.ts; this file spawns its OWN hub on ephemeral ports).
 *
 * Proven HERE:
 *  - unknown renders unknown through THREE membranes (extractor→model→hub→
 *    view) — never green;
 *  - leads render as leadEdge (dashed), never resolvedEdge — and hover
 *    degrades OUT LOUD (link.hover.unsupported).
 */

import { describe, test, expect } from "vitest";

import { setupV4Hub, getJson } from "./helpers/v4hub";
import { of, last, pinsHistory, rfPartition, setEq, type AnyEvent } from "./helpers/v4pins";

const ctx = setupV4Hub();

describe("V4 — graph-model wall → hub → graph-view wall (Python↔TS)", () => {

  test("unknown renders unknown through THREE membranes (extractor→model→hub→view) — never green", async () => {
    const { truth, served, viewWall, INFO } = ctx;
    // Membrane 1→2 output (the model wall's pin surface): every fill is unknown
    // (no compiler is attached anywhere on this path — honest ceiling).
    for (const n of truth.envelope.nodes) {
      expect((n as any).fill.status).toBe("unknown");
      expect((n as any).outline).toBeNull();
    }
    // Membrane 2→hub: /verdict passes unknown through UNINVENTED, and both the
    // model wall's verdict pin and the hub's serve pin carry it.
    const entryId = INFO.declaredRoots[0];
    const { status, body: verdict } = await getJson(`${ctx.BASE}/verdict/${entryId}`);
    expect(status).toBe(200);
    expect(verdict.fill.status).toBe("unknown");
    expect(verdict.outline).toBeNull();
    const hist = await pinsHistory(ctx.BASE);
    const verdictPin = last(hist.cells["graph-model"].events, "graph-model.wall.verdict").payload;
    expect(verdictPin.nodeId).toBe(entryId);
    expect(verdictPin.fill.status).toBe("unknown");
    expect(last(hist.hub.events, "hub.serve.verdict").payload).toMatchObject({
      nodeId: entryId, fillStatus: "unknown",
    });
    // Membrane hub→view: dump().paints — hatched grey, outline unknown, NEVER green.
    const paints = viewWall.pins.dump().paints as Record<string, any>;
    for (const id of served.idSets.nodes) {
      const paint = paints[id];
      expect(paint, `no paint for ${id}`).toBeDefined();
      expect(paint.fillStatus).toBe("unknown");
      expect(paint.fillHatched).toBe(true);
      expect(paint.fillColor).not.toBe("#2E7D32"); // the green fill hex
      expect(paint.outlineWasNull).toBe(true);
      expect(paint.outlineStatus).toBe("unknown"); // null outline → unknown ring, never green
    }
    // The view's own unknown-guards fired once per node (pin side of the same claim).
    const vh: AnyEvent[] = viewWall.pins.history();
    expect(of(vh, "verdict.fill.unknownGuard").length).toBe(13);
  });

  test("leads render as leadEdge (dashed), never resolvedEdge — and hover degrades OUT LOUD", async () => {
    const { truth, viewWall } = ctx;
    // Model-wall side: every lead kept the canonical placeholder + resolved:false.
    for (const l of truth.envelope.leads) {
      expect((l as any).resolved).toBe(false);
      expect(String((l as any).dstId).startsWith("unresolved:")).toBe(true);
    }
    const hist = await pinsHistory(ctx.BASE);
    expect(last(hist.cells["graph-model"].events, "graph-model.wall.ingest.verify.leads").payload)
      .toMatchObject({ pass: true, checked: 3, violations: [] });

    // View side: type partition exact; a lead id NEVER appears as resolvedEdge.
    const { leadEdgeIds, resolvedEdgeIds } = rfPartition(viewWall);
    setEq(leadEdgeIds, truth.idSets.leads);
    for (const id of truth.idSets.leads) expect(resolvedEdgeIds).not.toContain(id);

    // View pins: the leadGuard branch fired for exactly the lead set, dashed style.
    const vh: AnyEvent[] = viewWall.pins.history();
    const guarded = of(vh, "render.edge.leadGuard").map((e) => String(e.payload.edgeId));
    setEq(guarded, truth.idSets.leads);
    for (const e of of(vh, "render.edge.leadGuard")) {
      expect(e.payload.style).toBe("lead-dashed");
      expect(e.payload.resolved).toBe(false);
    }
    const leadRenderStyles = of(vh, "render.edge")
      .filter((e) => truth.idSets.leads.includes(String(e.payload.id)))
      .map((e) => e.payload.style);
    expect(leadRenderStyles).toEqual(["lead-dashed", "lead-dashed", "lead-dashed"]);

    // hover-unbridged surfaced honestly: our assembly bus is select-only; a hover
    // attempt through the wall is declared unsupported ON THE PINS (link.hover.
    // unsupported), never silently dropped.
    viewWall.cell.controller.hoverNode(truth.idSets.nodes[0]);
    const vh2: AnyEvent[] = viewWall.pins.history();
    const unsupported = last(vh2, "link.hover.unsupported").payload;
    expect(unsupported.nodeId).toBe(truth.idSets.nodes[0]);
  });
});
