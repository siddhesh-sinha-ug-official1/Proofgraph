/**
 * V5 SEAM TEST — editor-shell wall ⇄ graph-view wall joined by the bus
 * adapter, the ECHO-STORM BOUND + UNKNOWN-ID cases (SUB200 wave-2 split of
 * v5.bus.test.tsx; shared fixtures + mountJoint hoisted VERBATIM to
 * test/helpers/v5joint.ts).
 *
 * Proven HERE:
 *  (c) NO ECHO STORM — exact bounded event counts on both sides;
 *  (d) unknown nodeId from the editor side → link.select.unknownId, no crash,
 *      join stays live;
 *  (d′) skeleton fixture mount (brief-literal): unknown ids no-crash in BOTH
 *      directions.
 */

import { describe, test, expect } from "vitest";

import {
  ADD, CARET_ADD, CARET_DOUBLE, DOUBLE, UNUSED, lastPayload, mountJoint, of,
  registerJointTeardown, sharedEnvelope, skeletonEnvelope, type AnyEvent,
} from "./helpers/v5joint";

registerJointTeardown();

describe("V5 — editor bus ⇄ graph-view bus join adapter", () => {
  test("(c) NO ECHO STORM: one editor select + one graph click produce EXACTLY the bounded event counts on both sides", async () => {
    const j = await mountJoint(sharedEnvelope());

    j.editorAdapter.moveCursor(CARET_ADD);        // editor → graph
    j.graphWall.cell.controller.clickNode(UNUSED); // graph → editor

    // The joined bus itself: exactly 2 editor-side events (1 editor-origin +
    // 1 injected graph-origin), exactly 1 graph-side emission. A loop would
    // runaway these counts — they are asserted EXACT, not >=.
    expect(j.joined.editorSide.log.length).toBe(2);
    expect(j.joined.editorSide.log.map((e) => e.origin)).toEqual(["editor", "graph"]);
    expect(j.joined.graphSide.emitted.length).toBe(1);
    const s = j.joined.stats();
    expect(s.editorSideEmits).toBe(2);
    expect(s.graphSideEmits).toBe(1);
    expect(s.forwardedEditorToGraph).toBe(1);
    expect(s.forwardedGraphToEditor).toBe(1);
    expect(s.dropped).toBe(0);

    // T4 pins, exact counts: one emit, one recv, both echo-guard branches.
    const edHist = j.editorWall.pins.history() as AnyEvent[];
    expect(of(edHist, "editor.select.emit.bus").length).toBe(1);
    expect(of(edHist, "editor.select.recv.bus").length).toBe(1);
    const guards = of(edHist, "editor.select.echo.guard")
      .map((e) => e.payload as { suppressedReEmit: boolean });
    expect(guards.length).toBe(2); // 1 suppressed own-loopback + 1 "recv completed, no re-emit attempted"
    expect(guards.filter((g) => g.suppressedReEmit).length).toBe(1);

    // T5 pins, exact counts: one select in, one out, one wire emit, one
    // echo-ignore; selection state changed exactly twice (once per direction).
    const gvHist = j.graphWall.pins.history() as AnyEvent[];
    expect(of(gvHist, "link.select.in").length).toBe(1);
    expect(of(gvHist, "link.select.out").length).toBe(1);
    expect(of(gvHist, "link.bus.emit").length).toBe(1);
    expect(of(gvHist, "link.echo.ignored").length).toBe(1);
    expect(of(gvHist, "link.select.state").length).toBe(2);
    expect(of(gvHist, "link.select.unknownId").length).toBe(0);
  });

  test("(d) unknown nodeId from the editor side → T5 link.select.unknownId fires, no crash, and the join stays live", async () => {
    const j = await mountJoint(sharedEnvelope()); // envelope was served WITHOUT `double`

    j.editorAdapter.moveCursor(CARET_DOUBLE);

    // T4 pins: the editor honestly emitted double's id.
    const edHist = j.editorWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ busEvent: { nodeId: string } }>(edHist, "editor.select.emit.bus")
      .busEvent.nodeId === DOUBLE).toBe(true);

    // T5 pins: same id byte-equal at link.select.in, resolved NOT present,
    // unknown-id branch probed — a logged branch, never a crash.
    const gvHist = j.graphWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ nodeId: string }>(gvHist, "link.select.in").nodeId === DOUBLE).toBe(true);
    expect(lastPayload<{ nodeId: string; present: boolean }>(gvHist, "link.select.resolve").present).toBe(false);
    const unk = lastPayload<{ nodeId: string; reason: string }>(gvHist, "link.select.unknownId");
    expect(unk.nodeId === DOUBLE).toBe(true);
    expect(unk.reason).toContain("no-op, not a crash");
    expect(of(gvHist, "link.select.center").length).toBe(0); // never centered on an unknown id
    expect(j.graphWall.pins.dump().selection.selectedId).toBe(null);

    // Liveness after the unknown id: a valid select still crosses and lands.
    j.editorAdapter.moveCursor(CARET_ADD);
    const gvHist2 = j.graphWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ selectedId: string }>(gvHist2, "link.select.state").selectedId === ADD).toBe(true);
    const edHist2 = j.editorWall.pins.history() as AnyEvent[];
    expect(of(edHist2, "editor.select.emit.bus").length).toBe(2);
  });

  test("(d′) skeleton fixture mount (brief-literal): unknown ids no-crash in BOTH directions", async () => {
    const j = await mountJoint(skeletonEnvelope);

    // T5 stood on the skeleton (3 nodes, 1 edge, 1 lead — leads stay leads).
    const gvHist0 = j.graphWall.pins.history() as AnyEvent[];
    const face = lastPayload<{ nodes: number; edges: number; leads: number }>(gvHist0, "wall.face.result");
    expect(face.nodes).toBe(3);
    expect(face.edges).toBe(2); // rendered edge universe = 1 resolved + 1 lead…
    expect(face.leads).toBe(1); // …of which exactly 1 stays a dashed lead

    // editor → graph: clean.py's add is unknown to the skeleton universe.
    j.editorAdapter.moveCursor(CARET_ADD);
    const gvHist = j.graphWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ nodeId: string }>(gvHist, "link.select.in").nodeId === ADD).toBe(true);
    expect(lastPayload<{ nodeId: string }>(gvHist, "link.select.unknownId").nodeId === ADD).toBe(true);
    expect(j.graphWall.pins.dump().selection.selectedId).toBe(null);

    // graph → editor: skeleton's "A" is unknown to clean.py — recv.miss, probed.
    j.graphWall.cell.controller.clickNode("A");
    const edHist = j.editorWall.pins.history() as AnyEvent[];
    const busLog = (j.editorWall.pins.dump() as { busLog: { nodeId: string; origin: string }[] }).busLog;
    expect(busLog.some((e) => e.origin === "graph" && e.nodeId === "A")).toBe(true);
    expect(lastPayload<{ nodeId: string; found: boolean }>(edHist, "editor.select.recv.lookup").found).toBe(false);
    const miss = lastPayload<{ nodeId: string; reason: string }>(edHist, "editor.select.recv.miss");
    expect(miss.nodeId).toBe("A");
    expect(miss.reason).toBe("idNotInThisFile");
    expect(of(edHist, "editor.select.recv.reveal").length).toBe(0);

    // Both cells still alive after mutual unknowns.
    expect(j.graphWall.pins.dump().selection.selectedId).toBe("A"); // T5 selected its own node locally
    expect(j.joined.stats().dropped).toBe(0);
  });
});
