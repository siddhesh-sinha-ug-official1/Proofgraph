// @vitest-environment jsdom
/**
 * S6 DOM half — React Flow actually mounts what passed the gate. Asserts the
 * rendered DOM (fill hatch, outline ring, dashed lead edge, provenance line,
 * the cap banner, the empty Monaco slot) AND the probes the DOM layer emits
 * (render.memo, link.expand.slot, link.select.out on click).
 */

import React from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, waitFor, fireEvent } from "@testing-library/react";
import { runGraphView } from "./cell";
import { createMockGraphEventBus } from "./eventBus";
import { GraphView } from "./GraphView";
import { installReactFlowDomShims } from "./domShims";
import { KNOWN_PROBE_IDS } from "./probeCatalog";
import { SKELETON, eventsFor, payloadOf } from "./testUtil";

// ── the standard React Flow jsdom shims (it measures real DOM) ───────────────
// (shared installer — extracted verbatim to domShims.ts, SUB200 restructure)
beforeAll(installReactFlowDomShims);

async function mountSkeleton(opts?: { maxNodes?: number; expanded?: string[] }) {
  const mockBus = createMockGraphEventBus();
  const cell = await runGraphView(SKELETON(), mockBus, {
    capConfig: opts?.maxNodes ? { maxNodes: opts.maxNodes } : undefined,
    // Initial expansion goes through the cell's cap-checked admission — the DOM
    // prop is a re-render channel, not a side door around MAX_EXPANDED.
    expandedIds: new Set(opts?.expanded ?? []),
  });
  const expandedIds = new Set(cell.controller.expandedIds);
  const utils = render(
    <div style={{ width: 800, height: 600 }}>
      <GraphView cell={cell} expandedIds={expandedIds} />
    </div>,
  );
  return { cell, mockBus, utils };
}

describe("S6 DOM — the canvas renders the gated arrays with honest paint", () => {
  it("mounts 3 proof nodes: A solid green, B amber with a RED ring, C hatched grey — never green", async () => {
    const { utils } = await mountSkeleton();
    await waitFor(() => {
      expect(utils.container.querySelectorAll(".proof-node")).toHaveLength(3);
    });

    const nodeA = utils.container.querySelector('[data-node-id="A"]') as HTMLElement;
    const nodeB = utils.container.querySelector('[data-node-id="B"]') as HTMLElement;
    const nodeC = utils.container.querySelector('[data-node-id="C"]') as HTMLElement;

    expect(nodeA.style.background).toContain("rgb(46, 125, 50)"); // #2E7D32
    expect(nodeB.style.background).toContain("rgb(249, 168, 37)"); // #F9A825 body…
    expect(nodeB.style.boxShadow.toUpperCase()).toContain("#C62828"); // …with the red worst-of ring
    expect(nodeC.classList.contains("hatched")).toBe(true);
    expect(nodeC.style.background).toContain("repeating-linear-gradient"); // the unmistakable hatch
    expect(nodeC.style.background).not.toContain("rgb(46, 125, 50)"); // and no green anywhere on C
    expect(nodeC.style.boxShadow.toUpperCase()).toContain("#9E9E9E"); // grey ring (outline was null)

    // Provenance is surfaced, never anonymous.
    expect(nodeA.querySelector('[data-testid="provenance"]')?.textContent).toContain("tier T1");
    expect(nodeC.querySelector('[data-testid="provenance"]')?.textContent).toContain("given");
    cleanup();
  });

  it("draws 2 edges: e-AB solid, e-BC dashed lead labeled unresolved", async () => {
    const { utils } = await mountSkeleton();
    await waitFor(() => {
      expect(utils.container.querySelectorAll(".react-flow__edge")).toHaveLength(2);
    });
    const leadPath = utils.container.querySelector(
      '[data-id="e-BC"] path.react-flow__edge-path',
    ) as SVGPathElement | null;
    expect(leadPath).not.toBeNull();
    expect(leadPath!.style.strokeDasharray).toBe("4 4");
    expect(utils.container.textContent).toContain("unresolved");

    const solidPath = utils.container.querySelector(
      '[data-id="e-AB"] path.react-flow__edge-path',
    ) as SVGPathElement | null;
    expect(solidPath).not.toBeNull();
    expect(solidPath!.style.strokeDasharray ?? "").not.toBe("4 4");
    cleanup();
  });

  it("no banner in full mode; the cap banner appears when the cap bites (no silent caps at the DOM level)", async () => {
    const full = await mountSkeleton();
    expect(full.utils.queryByTestId("cap-banner")).toBeNull();
    cleanup();

    const capped = await mountSkeleton({ maxNodes: 2 });
    const banner = capped.utils.getByTestId("cap-banner");
    expect(banner.textContent).toContain("light-only");
    // The banner in the DOM and the cap.log probe tell the SAME story.
    expect(payloadOf<{ bannerShown: boolean }>(capped.cell.bus.last("cap.log")!).bannerShown).toBe(true);
    cleanup();
  });

  it("the expanded node mounts the EMPTY Monaco slot [data-slot=monaco] and probes link.expand.slot", async () => {
    const { cell, utils } = await mountSkeleton({ expanded: ["A"] });
    await waitFor(() => {
      expect(utils.container.querySelector('[data-slot="monaco"]')).not.toBeNull();
    });
    const slot = utils.container.querySelector('[data-slot="monaco"]') as HTMLElement;
    expect(slot.children).toHaveLength(0); // empty this round — Monaco mounts here later
    const slotProbes = eventsFor(cell.bus, "link.expand.slot");
    expect(slotProbes.length).toBeGreaterThanOrEqual(1);
    expect(payloadOf<object>(slotProbes[0])).toEqual({
      nodeId: "A", slotMounted: true, slotSelector: '[data-slot="monaco"]',
    });
    cleanup();
  });

  it("clicking a node in the real DOM routes through S7: link.select.out reaches the mock Tree 4 bus", async () => {
    const { cell, mockBus, utils } = await mountSkeleton();
    await waitFor(() => {
      expect(utils.container.querySelectorAll(".proof-node")).toHaveLength(3);
    });
    const rfNodeA = utils.container.querySelector('.react-flow__node[data-id="A"]') as HTMLElement;
    fireEvent.click(rfNodeA);

    await waitFor(() => {
      expect(eventsFor(cell.bus, "link.select.out")).toHaveLength(1);
    });
    expect(payloadOf<{ nodeId: string }>(eventsFor(cell.bus, "link.select.out")[0]).nodeId).toBe("A");
    expect(mockBus.emitted).toEqual([{ type: "select", nodeId: "A", source: "graph" }]);
    cleanup();
  });

  it("the post-mount DOM reconciliation lead fires: domEdges == modelEdges (F1's DOM twin is audited)", async () => {
    const { cell } = await mountSkeleton();
    await waitFor(() => {
      const virt = eventsFor(cell.bus, "render.virtualize");
      expect(virt.length).toBeGreaterThanOrEqual(2); // pre-mount + post-mount
    });
    const post = payloadOf<{ inViewport: number; domEdges: number; modelEdges: number }>(
      eventsFor(cell.bus, "render.virtualize").at(-1)!,
    );
    expect(post.inViewport).toBe(3);
    expect(post.modelEdges).toBe(2);
    expect(post.domEdges).toBe(post.modelEdges); // the DOM tells the same story as the model
    cleanup();
  });

  it("render.memo fires from the per-instance sink on re-render (memo hit for unchanged node data)", async () => {
    const { cell, utils } = await mountSkeleton();
    await waitFor(() => {
      expect(utils.container.querySelectorAll(".proof-node")).toHaveLength(3);
    });
    utils.rerender(
      <div style={{ width: 800, height: 600 }}>
        <GraphView cell={cell} expandedIds={new Set()} />
      </div>,
    );
    await waitFor(() => {
      expect(eventsFor(cell.bus, "render.memo").length).toBeGreaterThan(0);
    });
    for (const e of eventsFor(cell.bus, "render.memo")) {
      expect(typeof payloadOf<{ memoHit: boolean }>(e).memoHit).toBe("boolean");
    }
    cleanup();
  });

  it("gate 16 (DOM half): a DOM-mounted stream has no dark leads — every emitted probeId is cataloged", async () => {
    const { cell, utils } = await mountSkeleton({ expanded: ["A"] });
    await waitFor(() => {
      expect(utils.container.querySelector('[data-slot="monaco"]')).not.toBeNull();
    });
    // Exercise the DOM-only emitters (memo comparator, expand slot, post-mount
    // reconciliation), then sweep the whole stream against the catalog.
    utils.rerender(
      <div style={{ width: 800, height: 600 }}>
        <GraphView cell={cell} expandedIds={new Set(cell.controller.expandedIds)} />
      </div>,
    );
    await waitFor(() => {
      expect(eventsFor(cell.bus, "render.virtualize").length).toBeGreaterThanOrEqual(2);
    });
    expect(cell.bus.uncataloged).toEqual([]);
    for (const e of cell.history()) {
      expect(KNOWN_PROBE_IDS.has(e.probeId), `DOM-run lead ${e.probeId} missing from catalog`).toBe(true);
    }
    cleanup();
  });
});
