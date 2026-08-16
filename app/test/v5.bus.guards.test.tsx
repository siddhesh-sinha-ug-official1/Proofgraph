/**
 * V5 SEAM TEST — editor-shell wall ⇄ graph-view wall joined by the bus
 * adapter, the DEGRADATION + GUARD + TEARDOWN cases (SUB200 wave-2 split of
 * v5.bus.test.tsx; shared fixtures + mountJoint hoisted VERBATIM to
 * test/helpers/v5joint.ts).
 *
 * Proven HERE:
 *  - hover degrades PROBED, never silent (link.hover.unsupported; nothing
 *    reaches T4);
 *  - origin-spoof guard (bus-origin-spoof): wrong-origin injections never
 *    cross the seam; each drop logged; cells' own guards probe them;
 *  - teardown: after editor wall dispose + controller dispose, nothing
 *    crosses and nothing crashes (second dispose idempotent).
 */

import { describe, test, expect } from "vitest";

import {
  ADD, CARET_ADD, UNUSED, lastPayload, mountJoint, of, registerJointTeardown,
  sharedEnvelope, type AnyEvent,
} from "./helpers/v5joint";

registerJointTeardown();

describe("V5 — editor bus ⇄ graph-view bus join adapter", () => {
  test("hover degrades PROBED, never silent: T5's soft-brush reports link.hover.unsupported; nothing reaches T4", async () => {
    const j = await mountJoint(sharedEnvelope());
    const recvBefore = of(j.editorWall.pins.history() as AnyEvent[], "editor.select.recv.bus").length;
    const busLenBefore = j.joined.editorSide.log.length;

    j.graphWall.cell.controller.hoverNode(ADD);

    // T5 pins: hover attempted, degradation branch probed with the reason.
    const gvHist = j.graphWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ nodeId: string }>(gvHist, "link.hover.out").nodeId === ADD).toBe(true);
    const unsupported = lastPayload<{ nodeId: string; reason: string }>(gvHist, "link.hover.unsupported");
    expect(unsupported.nodeId === ADD).toBe(true);
    expect(unsupported.reason).toContain("select-only");

    // T4 pins + joined bus: NOTHING crossed.
    expect(of(j.editorWall.pins.history() as AnyEvent[], "editor.select.recv.bus").length).toBe(recvBefore);
    expect(j.joined.editorSide.log.length).toBe(busLenBefore);

    // Adapter log declared hover-unbridged at join time (config entry).
    const hoverLog = j.joined.log.filter((e) => e.failureClass === "hover-unbridged");
    expect(hoverLog.length).toBe(1);
    expect(hoverLog[0].reason).toContain("link.hover.unsupported");
  });

  test("origin-spoof guard (bus-origin-spoof): wrong-origin injections never cross the seam; each drop logged; cells' own guards probe them", async () => {
    const j = await mountJoint(sharedEnvelope());

    // Spoof 1: a third party claims GRAPH origin at the EDITOR port.
    j.joined.editorSide.emit({ type: "node.select", nodeId: "spoof-ed-port", origin: "graph", clock: 999 });
    // T4 (on that bus) sees it and probes its own miss branch — no crash…
    const edHist = j.editorWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ nodeId: string }>(edHist, "editor.select.recv.miss").nodeId).toBe("spoof-ed-port");
    // …but T5 NEVER hears of it (absence proven on T5's pins).
    const gvHist = j.graphWall.pins.history() as AnyEvent[];
    expect(of(gvHist, "link.select.in").some((e) => (e.payload as { nodeId: string }).nodeId === "spoof-ed-port")).toBe(false);
    expect(of(gvHist, "link.echo.ignored").some((e) => (e.payload as { nodeId: string }).nodeId === "spoof-ed-port")).toBe(false);

    // Spoof 2: something claims EDITOR source at the GRAPH port.
    j.joined.graphSide.emit({ type: "select", nodeId: "spoof-gv-port", source: "editor" });
    // T5's local loopback lets its OWN guards probe it (unknown id branch)…
    const gvHist2 = j.graphWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ nodeId: string }>(gvHist2, "link.select.unknownId").nodeId).toBe("spoof-gv-port");
    // …but it never crosses to T4 (absence proven on T4's pins + busLog).
    const busLog = (j.editorWall.pins.dump() as { busLog: { nodeId: string }[] }).busLog;
    expect(busLog.some((e) => e.nodeId === "spoof-gv-port")).toBe(false);
    const edHist2 = j.editorWall.pins.history() as AnyEvent[];
    expect(of(edHist2, "editor.select.recv.bus").some((e) => (e.payload as { nodeId: string }).nodeId === "spoof-gv-port")).toBe(false);

    // Adapter log: both drops named bus-origin-spoof, counted, never silent.
    const drops = j.joined.log.filter((e) => e.failureClass === "bus-origin-spoof");
    expect(drops.length).toBe(2);
    expect(drops.map((d) => d.nodeId)).toEqual(["spoof-ed-port", "spoof-gv-port"]);
    expect(j.joined.stats().dropped).toBe(2);
  });

  test("teardown: after editor wall dispose + controller dispose, nothing crosses and nothing crashes", async () => {
    const j = await mountJoint(sharedEnvelope());
    j.editorAdapter.moveCursor(CARET_ADD); // prove the join was live first
    const gvInBefore = of(j.graphWall.pins.history() as AnyEvent[], "link.select.in").length;
    expect(gvInBefore).toBe(1);

    const edHistBefore = j.editorWall.pins.history() as AnyEvent[];
    const recvBefore = of(edHistBefore, "editor.select.recv.bus").length;

    await j.editorWall.dispose("v5: deliberate mid-test teardown");
    j.graphWall.cell.controller.dispose();

    // A graph click after teardown: the adapter still logs the injection on the
    // editor bus (busLog is append-only truth), but T4's bridge is unsubscribed
    // — no recv probes, no crash; T5's controller is unsubscribed — no select.in.
    j.graphWall.cell.controller.clickNode(UNUSED);
    const edHist = j.editorWall.pins.history() as AnyEvent[];
    expect(of(edHist, "editor.select.recv.bus").length).toBe(recvBefore);
    const gvHist = j.graphWall.pins.history() as AnyEvent[];
    expect(of(gvHist, "link.select.in").length).toBe(gvInBefore);

    // Second dispose is idempotent (T4 wall contract) — still no crash.
    await j.editorWall.dispose();
  });
});
