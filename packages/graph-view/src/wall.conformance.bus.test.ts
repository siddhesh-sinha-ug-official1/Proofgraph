/**
 * PHASE-1 CONFORMANCE — pins vs face (WALL-CONVENTIONS rule 5), continued.
 * This file: gates C, D, F; gates E, A, B live in wall.conformance.test.tsx
 * (SUB200 restructure — shared helpers in wallTestKit.ts; the gate letters and
 * assertions are unchanged):
 *   (C) select IN/OUT through the wall's bus equals the link.* pins;
 *   (D) wall rejections are NAMED failure classes with the pins still attached;
 *   (F) no silent caps and no dark leads through the wall.
 * Headless throughout — no DOM mounts here, so this half runs under node.
 */

import { describe, expect, it } from "vitest";
import { createGraphViewWall, GraphViewWallError } from "./wall";
import { createMockGraphEventBus } from "./eventBus";
import { KNOWN_PROBE_IDS } from "./probeCatalog";
import { pinEvents, serve, solePin, standWall } from "./wallTestKit";

describe("wall C — select IN/OUT through the wall's bus equals the link.* pins", () => {
  it("OUT: clickNode('A') → the mock Tree-4 bus received EXACTLY what the link.* pins recorded", async () => {
    const { wall, mockBus } = await standWall();
    wall.cell.controller.clickNode("A");

    expect(mockBus.emitted).toEqual([{ type: "select", nodeId: "A", source: "graph" }]);
    // The wire == the pins: link.bus.emit is the raw outbound call, link.select.out the intent.
    expect(solePin(wall.pins, "link.bus.emit").payload).toEqual(mockBus.emitted[0]);
    expect(solePin(wall.pins, "link.select.out").payload).toEqual({
      nodeId: "A", source: "graph", trigger: "click",
    });
    // Declared selection == pinned state transition.
    expect(solePin(wall.pins, "link.select.state").payload).toEqual({ selectedId: "A", previousId: null });
    expect(wall.cell.controller.selectedId).toBe("A");
    expect(wall.pins.dump().selection.selectedId).toBe("A");
    // The bus echo was filtered and probed, never re-entering as an editor selection.
    expect(pinEvents(wall.pins, "link.echo.ignored")).toHaveLength(1);
    expect(pinEvents(wall.pins, "link.select.in")).toHaveLength(0);
  });

  it("IN: deliverSelect('B') from the editor side → link.select.in/resolve pins == declared selection", async () => {
    const { wall, mockBus } = await standWall();
    mockBus.deliverSelect("B");

    expect(solePin(wall.pins, "link.select.in").payload).toEqual({ nodeId: "B", source: "editor" });
    expect(solePin(wall.pins, "link.select.resolve").payload).toEqual({ nodeId: "B", present: true });
    expect(wall.cell.controller.selectedId).toBe("B");
    expect(wall.pins.dump().selection.selectedId).toBe("B");
  });

  it("IN, unknown id: a logged branch pin, no crash, declared selection unchanged", async () => {
    const { wall, mockBus } = await standWall();
    mockBus.deliverSelect("ZZZ");

    expect(solePin(wall.pins, "link.select.resolve").payload).toEqual({ nodeId: "ZZZ", present: false });
    expect(pinEvents(wall.pins, "link.select.unknownId")).toHaveLength(1);
    expect(wall.cell.controller.selectedId).toBe(null);
    expect(wall.pins.dump().selection.selectedId).toBe(null);
  });

  it("pins.tap() is LIVE through the wall: a tap placed on the wall hears the click", async () => {
    const { wall } = await standWall();
    const heard: string[] = [];
    const off = wall.pins.tap("link.select.out", (e) => heard.push((e.payload as { nodeId: string }).nodeId));
    wall.cell.controller.clickNode("B");
    off();
    wall.cell.controller.clickNode("A"); // after unsubscribe — not heard
    expect(heard).toEqual(["B"]);
  });
});

describe("wall D — named failure classes, pins attached to the refusal", () => {
  it("served schemaVersion 'v1' → GraphViewWallError failure-class=schema-pin-mismatch; pins prove the whole-payload rejection", async () => {
    const drifted = { ...serve(), schemaVersion: "v1" };
    let thrown: unknown = null;
    try {
      await createGraphViewWall(drifted, createMockGraphEventBus());
    } catch (e) { thrown = e; }

    expect(thrown).toBeInstanceOf(GraphViewWallError);
    const err = thrown as GraphViewWallError;
    expect(err.failureClass).toBe("schema-pin-mismatch");
    expect(err.message).toContain("failure-class=schema-pin-mismatch");
    // The pins ride the refusal: pin-level truth matches the declared failure.
    expect(err.pins).not.toBeNull();
    const envPin = solePin(err.pins!, "ingest.envelope.version").payload as { present: boolean; value?: string; ok: boolean };
    expect(envPin).toMatchObject({ present: true, value: "v1", ok: false });
    const reject = solePin(err.pins!, "wall.face.reject").payload as { failureClass: string };
    expect(reject.failureClass).toBe("schema-pin-mismatch");
    // Whole payload refused — nothing rendered, nothing declared.
    expect(err.pins!.dump().model.nodes).toEqual([]);
    expect(err.pins!.dump().rfNodes).toEqual([]);
    expect(pinEvents(err.pins!, "wall.face.result")).toHaveLength(0);
  });

  it("served envelope MISSING schemaVersion → failure-class=envelope-rejected (ruling 3), probed", async () => {
    const bare = serve() as unknown as Record<string, unknown>;
    delete bare.schemaVersion;
    let thrown: unknown = null;
    try {
      await createGraphViewWall(bare, createMockGraphEventBus());
    } catch (e) { thrown = e; }

    expect(thrown).toBeInstanceOf(GraphViewWallError);
    const err = thrown as GraphViewWallError;
    expect(err.failureClass).toBe("envelope-rejected");
    expect(err.message).toContain("failure-class=envelope-rejected");
    const envPin = solePin(err.pins!, "ingest.envelope.version").payload as { present: boolean; ok: boolean };
    expect(envPin).toMatchObject({ present: false, ok: false });
    expect((solePin(err.pins!, "wall.face.reject").payload as { failureClass: string }).failureClass)
      .toBe("envelope-rejected");
  });
});

describe("wall F — no silent caps and no dark leads through the wall", () => {
  it("capConfig passes through and the cap stays probed + bannered: declared banner == cap.log pin, nothing dropped", async () => {
    const { wall } = await standWall({ capConfig: { maxNodes: 2 } });
    const declared = solePin(wall.pins, "wall.face.result").payload as { capMode: string; bannerShown: boolean; nodes: number };
    const capLog = solePin(wall.pins, "cap.log").payload as { bannerShown: boolean; message: string };

    expect(declared.capMode).toBe("light-only");
    expect(declared.bannerShown).toBe(true);
    expect(capLog.bannerShown).toBe(true); // pin and face tell the SAME story
    expect(wall.cell.banner.message).toBe(capLog.message);
    // light-only keeps every node visible — capped fidelity, not silent drops.
    expect(declared.nodes).toBe(3);
    expect(pinEvents(wall.pins, "cap.dropped")).toHaveLength(0);
  });

  it("a full wall run (construction + render + brushing) emits ONLY cataloged leads — pins.probeCatalog() covers the stream", async () => {
    const { wall, mockBus } = await standWall();
    wall.cell.controller.clickNode("A");
    wall.cell.controller.hoverNode("B");
    mockBus.deliverSelect("C");

    const catalogIds = new Set(wall.pins.probeCatalog().map((e) => e.probeId));
    for (const id of ["wall.construct", "wall.pin.assert", "wall.face.result", "wall.face.reject"]) {
      expect(catalogIds.has(id), `wall lead ${id} missing from the catalog`).toBe(true);
    }
    expect(wall.cell.bus.uncataloged).toEqual([]);
    for (const e of wall.pins.history()) {
      expect(KNOWN_PROBE_IDS.has(e.probeId), `wall-run lead ${e.probeId} missing from catalog`).toBe(true);
      expect(catalogIds.has(e.probeId)).toBe(true);
    }
  });
});
