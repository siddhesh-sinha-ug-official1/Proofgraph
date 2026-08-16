/**
 * Gate 16 — catalog completeness (Probe Density Contract §3). Every runtime
 * probeId is present in probeCatalog(); a lead not in the catalog fails the build.
 * The spec's §6 enumeration (61 stated as a floor; 84 by verbatim count) must all
 * be present with kind/payloadType/description.
 */

import { describe, expect, it } from "vitest";
import { probeCatalog, KNOWN_PROBE_IDS, PROBE_CATALOG } from "./probeCatalog";
import { runGraphView } from "./cell";
import { createMockGraphEventBus } from "./eventBus";
import { SKELETON } from "./testUtil";

/** The §6 probe map, transcribed verbatim. */
const SPEC_PROBE_IDS = [
  // S0
  "ingest.input", "ingest.schema.valid", "ingest.node", "ingest.node.field.missing",
  "ingest.node.enum.bad", "ingest.node.reject", "ingest.edge", "ingest.edge.reject",
  "ingest.edge.danglingRef", "ingest.node.count", "ingest.edge.count",
  "ingest.node.langDist", "ingest.node.kindDist", "ingest.edge.kindDist", "ingest.output",
  // S1
  "cap.limit", "cap.live", "cap.compare", "cap.degrade", "cap.degrade.notTaken",
  "cap.expanded.limit", "cap.log", "cap.dropped", "cap.virtualize",
  // S2
  "verdict.fill.in", "verdict.fill.decision", "verdict.fill.unknownGuard",
  "verdict.outline.in", "verdict.outline.nullBranch", "verdict.outline.decision",
  "verdict.outline.unknownGuard", "verdict.outline.worstOfCheck", "verdict.histogram", "verdict.output",
  // S3
  "layout.in.build", "layout.in.ports", "layout.in.node", "layout.in.edge",
  "layout.in.edgeCount", "layout.in.output",
  // S4
  "layout.engine", "layout.call.request", "layout.worker.decision", "layout.worker.spawn",
  "layout.worker.message", "layout.worker.terminate", "layout.call.response",
  "layout.out.node", "layout.out.edge", "layout.out.edgeCount", "layout.timing", "layout.error",
  // S5
  "apply.node.position", "apply.node.missingCoord", "apply.edge.route", "apply.output",
  // S6
  "render.node", "render.node.mode", "render.node.count", "render.node.equality",
  "render.edge", "render.edge.count", "render.edge.equality", "render.edge.eaten",
  "render.edge.phantom", "render.edge.leadGuard", "render.viewport", "render.virtualize",
  "render.memo", "render.timing",
  // S7
  "link.bus.subscribe", "link.select.out", "link.bus.emit", "link.select.in",
  "link.select.resolve", "link.select.center", "link.select.unknownId", "link.select.state",
  "link.expand.request", "link.expand.slot", "link.expand.refused",
  "link.hover.out", "link.hover.in", "link.multiSelect",
];

describe("gate 16 — probeCatalog() completeness", () => {
  it("every §6 lead is in the catalog (84 verbatim; 61 was the stated floor)", () => {
    expect(SPEC_PROBE_IDS).toHaveLength(84);
    const catalogIds = new Set(probeCatalog().map((e) => e.probeId));
    for (const id of SPEC_PROBE_IDS) {
      expect(catalogIds.has(id), `catalog is missing spec lead ${id}`).toBe(true);
    }
    expect(probeCatalog().length).toBeGreaterThanOrEqual(61);
    // The leads this build ADDED beyond §6 (the floor, not the ceiling):
    // per-edge cap withholding, bus-echo filtering, hover degradation, the
    // two Phase-0 assembly leads (canonical envelope pin gate + leads segregation,
    // assembly ruling 3), and the four Phase-1 WALL leads (construction, pin
    // assert, declared face, named rejection — graph-view-wall/1.0.0, stage "W").
    // A membrane never deletes a pin — the catalog only grows.
    for (const added of [
      "cap.edge.dropped", "link.echo.ignored", "link.hover.unsupported",
      "ingest.envelope.version", "ingest.edge.segregation",
      "wall.construct", "wall.pin.assert", "wall.face.result", "wall.face.reject",
    ]) {
      expect(catalogIds.has(added), `local lead ${added} missing from catalog`).toBe(true);
    }
  });

  it("every catalog entry is fully self-describing: probeId, kind, payloadType, description", () => {
    for (const entry of PROBE_CATALOG) {
      expect(entry.probeId).toBeTruthy();
      expect(entry.kind).toBeTruthy();
      expect(entry.payloadType).toBeTruthy();
      expect(entry.description.length).toBeGreaterThan(10);
    }
    // No duplicate leads.
    expect(new Set(PROBE_CATALOG.map((e) => e.probeId)).size).toBe(PROBE_CATALOG.length);
  });

  it("every probeId emitted at runtime is in the catalog (a dark lead fails the build)", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus(), {
      capConfig: { maxNodes: 1, hardMaxNodes: 2 }, // force the cap/drop paths to fire too
    });
    // Exercise S7 so its leads hit the stream as well.
    cell.controller.clickNode("A");
    cell.controller.hoverNode("B");
    cell.controller.requestExpand("A");

    expect(cell.bus.uncataloged).toEqual([]);
    for (const e of cell.history()) {
      expect(KNOWN_PROBE_IDS.has(e.probeId), `runtime lead ${e.probeId} missing from catalog`).toBe(true);
    }
  });
});
