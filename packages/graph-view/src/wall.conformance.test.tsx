// @vitest-environment jsdom
/**
 * PHASE-1 CONFORMANCE — pins vs face (WALL-CONVENTIONS rule 5).
 * Drive the WALL (never the cell directly), then read the PINS through the wall's
 * own pins accessor and assert the pin-level truth equals what the wall declared.
 * This file: gates E, A, B; gates C, D, F live in wall.conformance.bus.test.ts
 * (SUB200 restructure — shared helpers in wallTestKit.ts, DOM shims in
 * domShims.ts; the gate letters and assertions are unchanged):
 *   (A) dump().rfNodes / rfEdges / leads set-equal the SERVED canonical envelope —
 *       the cheap-serializer (Mermaid-&) gate seen through the wall;
 *   (B) honest ceiling: a node served with fill "unknown" renders unknown (hatched
 *       grey, never green) at pin level, on the declared face, and in the real DOM;
 *   (E) the wall's carried schema pin IS the canonical pin (extracted-constant
 *       equality — the construction-time assert has teeth).
 */

import React from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createGraphViewWall, WALL_SCHEMA_HASH, WALL_SCHEMA_VERSION, WALL_VERSION } from "./wall";
import { createMockGraphEventBus } from "./eventBus";
import { GraphView } from "./GraphView";
import { installReactFlowDomShims } from "./domShims";
import { idSet, pinEvents, serve, solePin, standWall } from "./wallTestKit";
import { PINNED_SCHEMA_HASH, PINNED_SCHEMA_VERSION } from "../../schema/gen/pin";

// ── the standard React Flow jsdom shims (it measures real DOM) ───────────────
beforeAll(installReactFlowDomShims);

describe("wall E — versioned + the carried pin IS the canonical pin", () => {
  it("WALL_VERSION is graph-view-wall/1.0.0 and the face is exactly {cell, pins}", async () => {
    expect(WALL_VERSION).toBe("graph-view-wall/1.0.0");
    const { wall } = await standWall();
    expect(Object.keys(wall).sort()).toEqual(["cell", "pins"]);
    expect(Object.keys(wall.pins).sort()).toEqual(["dump", "history", "probeCatalog", "tap"]);
  });

  it("the wall's carried (schemaVersion, schemaHash) equals the canonical gen/pin.ts pair — the construction assert has teeth", () => {
    expect(WALL_SCHEMA_VERSION).toBe(PINNED_SCHEMA_VERSION);
    expect(WALL_SCHEMA_HASH).toBe(PINNED_SCHEMA_HASH);
  });

  it("construction probes the wall chain: wall.construct → wall.pin.assert ok:true → wall.face.result; no rejection", async () => {
    const { wall } = await standWall();
    const construct = solePin(wall.pins, "wall.construct");
    expect(construct.logicalClock).toBe(0); // the wall stands up BEFORE S0 runs
    expect(construct.payload).toEqual({
      wallVersion: WALL_VERSION, schemaVersion: PINNED_SCHEMA_VERSION,
      schemaHash: PINNED_SCHEMA_HASH, capConfigOverridden: false,
    });
    const assert = solePin(wall.pins, "wall.pin.assert");
    expect(assert.payload).toEqual({
      ok: true, carriedVersion: PINNED_SCHEMA_VERSION, pinnedVersion: PINNED_SCHEMA_VERSION,
      carriedHash: PINNED_SCHEMA_HASH,
    });
    expect(assert.causeId).toBe(`wall.construct#${construct.logicalClock}`);
    expect(pinEvents(wall.pins, "wall.face.reject")).toHaveLength(0);
    expect(pinEvents(wall.pins, "wall.face.result")).toHaveLength(1);
  });
});

describe("wall A — declared face == pins == served envelope (the cheap-serializer gate through the wall)", () => {
  it("dump().rfNodes/rfEdges/leads are set-equal to the served envelope, and the declared arrays ARE the pinned arrays", async () => {
    const served = serve();
    const mockBus = createMockGraphEventBus();
    const wall = await createGraphViewWall(served, mockBus);
    const d = wall.pins.dump();

    // Set-equality with the SERVED envelope: nodes; edges ∪ leads; leads stay leads.
    expect(idSet(d.rfNodes)).toEqual(idSet(served.nodes));
    expect(idSet(d.rfEdges)).toEqual(new Set([...idSet(served.edges), ...idSet(served.leads)]));
    expect(idSet(d.rfEdges.filter((e) => e.type === "leadEdge"))).toEqual(idSet(served.leads));
    expect(idSet(d.rfEdges.filter((e) => e.type === "resolvedEdge"))).toEqual(idSet(served.edges));

    // Declared face == pins by IDENTITY: the wall hands out the gated arrays, not a
    // copy that could drift from what the pins audited.
    expect(d.rfNodes).toBe(wall.cell.rfNodes);
    expect(d.rfEdges).toBe(wall.cell.rfEdges);

    // The pins' own equality gate agrees, seen through the wall.
    const equality = solePin(wall.pins, "render.edge.equality").payload as {
      equal: boolean; eaten: string[]; phantom: string[]; renderedEdgeIds: string[];
    };
    expect(equality.equal).toBe(true);
    expect(equality.eaten).toEqual([]);
    expect(equality.phantom).toEqual([]);
    expect(new Set(equality.renderedEdgeIds)).toEqual(idSet(wall.cell.rfEdges));
  });

  it("wall.face.result declares exactly what the pins prove: counts == render.*.count pins, engine + cap as probed", async () => {
    const { wall } = await standWall();
    const declared = solePin(wall.pins, "wall.face.result").payload as {
      wallVersion: string; nodes: number; edges: number; leads: number;
      engine: string; capMode: string; bannerShown: boolean;
    };
    const nodeCount = solePin(wall.pins, "render.node.count").payload as { count: number };
    const edgeCount = solePin(wall.pins, "render.edge.count").payload as { count: number };
    const leadGuards = pinEvents(wall.pins, "render.edge.leadGuard");
    const capLog = solePin(wall.pins, "cap.log").payload as { bannerShown: boolean };

    expect(declared.wallVersion).toBe(WALL_VERSION);
    expect(declared.nodes).toBe(nodeCount.count);
    expect(declared.edges).toBe(edgeCount.count);
    expect(declared.leads).toBe(leadGuards.length); // every lead was guard-probed, 1:1
    expect(declared.capMode).toBe("full");
    expect(declared.bannerShown).toBe(capLog.bannerShown);
    expect(declared.engine).toBe(wall.cell.engine.name); // declared engine == probed engine identity
  });
});

describe("wall B — honest ceiling: fill unknown renders unknown through the wall (never green)", () => {
  it("pin truth == declared paint for served-unknown node C: hatched grey fill, grey ring (outline null)", async () => {
    const served = serve();
    const unknownServed = served.nodes.filter((n) => n.fill.status === "unknown").map((n) => n.id);
    expect(unknownServed).toEqual(["C"]); // fixture honesty: the skeleton serves one unknown node

    const { wall } = await standWall();
    // Pin level: the never-green guards fired for exactly the served-unknown node.
    const guard = solePin(wall.pins, "verdict.fill.unknownGuard").payload as { nodeId: string; wouldBeGreen: boolean };
    expect(guard.nodeId).toBe("C");
    expect(guard.wouldBeGreen).toBe(false);
    const nullBranch = solePin(wall.pins, "verdict.outline.nullBranch").payload as { nodeId: string };
    expect(nullBranch.nodeId).toBe("C");

    // Declared face: the paint the wall hands out says the same thing.
    const paintC = wall.pins.dump().paints["C"];
    expect(paintC.fillStatus).toBe("unknown");
    expect(paintC.fillHatched).toBe(true);
    expect(paintC.fillColor).toBe("#9E9E9E");
    expect(paintC.outlineStatus).toBe("unknown");
    expect(paintC.outlineWasNull).toBe(true);
    const rfC = wall.cell.rfNodes.find((n) => n.id === "C")!;
    expect(rfC.data.paint).toEqual(paintC);
  });

  it("the real DOM mounted from the wall's handle renders C hatched grey — no green anywhere on an unknown node", async () => {
    const { wall } = await standWall();
    const utils = render(
      <div style={{ width: 800, height: 600 }}>
        <GraphView cell={wall.cell} expandedIds={new Set()} />
      </div>,
    );
    await waitFor(() => {
      expect(utils.container.querySelectorAll(".proof-node")).toHaveLength(3);
    });
    const nodeC = utils.container.querySelector('[data-node-id="C"]') as HTMLElement;
    expect(nodeC.classList.contains("hatched")).toBe(true);
    expect(nodeC.style.background).toContain("repeating-linear-gradient");
    expect(nodeC.style.background).not.toContain("rgb(46, 125, 50)"); // never green
    expect(nodeC.style.boxShadow.toUpperCase()).toContain("#9E9E9E"); // grey ring
    cleanup();
  });
});
