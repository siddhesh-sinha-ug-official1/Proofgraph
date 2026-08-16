/**
 * V5 SEAM TEST — editor-shell wall ⇄ graph-view wall joined by the bus adapter.
 *
 * Both walls mount in ONE process (jsdom): the editor wall headless on its own
 * sanctioned stubs (adapter/capability/server imported from OUTSIDE the cell —
 * packages/editor-shell/test/stub/*), the graph-view wall on a served canonical
 * envelope. EVERY test asserts on BOTH cells' pins across the boundary — never
 * on a return value alone — plus the adapter's own log.
 *
 * SUB200 restructure (wave 2): split by test groups — THIS file keeps the
 * join-stands + directional select cases (a)/(b); v5.bus.bounds.test.tsx has
 * the echo-storm bound (c) + unknown-id cases (d)/(d′);
 * v5.bus.guards.test.tsx has hover degradation, origin-spoof and teardown.
 * Shared fixtures + mountJoint hoisted VERBATIM to test/helpers/v5joint.ts.
 * No test renamed, no assertion weakened.
 */

import { describe, test, expect } from "vitest";

import { WALL_SCHEMA_PIN } from "@editor-shell/src/wall.js";
import { WALL_SCHEMA_VERSION, WALL_SCHEMA_HASH } from "@graph-view/src/wall";
import {
  ADD, CARET_ADD, UNUSED, lastPayload, mountJoint, of, registerJointTeardown,
  sharedEnvelope, type AnyEvent,
} from "./helpers/v5joint";

registerJointTeardown();

describe("V5 — editor bus ⇄ graph-view bus join adapter", () => {
  test("join stands: both walls mount on one joined bus and carry the SAME canonical schema pin", async () => {
    const j = await mountJoint(sharedEnvelope());

    // Cross-wall pin×pin: the two cells' carried schema pins are identical.
    expect(WALL_SCHEMA_PIN.schemaVersion).toBe(WALL_SCHEMA_VERSION);
    expect(WALL_SCHEMA_PIN.schemaHash).toBe(WALL_SCHEMA_HASH);

    // T4 pins: wall stood, pin check passed.
    const edHist = j.editorWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ pass: boolean }>(edHist, "editor.wall.pin.check").pass).toBe(true);
    expect(of(edHist, "editor.wall.mount").length).toBe(1);

    // T5 pins: wall stood, pin asserted, face declared (4 nodes, 0 edges).
    const gvHist = j.graphWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ ok: boolean }>(gvHist, "wall.pin.assert").ok).toBe(true);
    const face = lastPayload<{ nodes: number; edges: number; leads: number }>(gvHist, "wall.face.result");
    expect(face.nodes).toBe(4);
    expect(face.edges).toBe(0);

    // T5 subscribed select-only through the adapter (hover honestly absent).
    const sub = lastPayload<{ eventTypes: string[] }>(gvHist, "link.bus.subscribe");
    expect(sub.eventTypes).toEqual(["select"]);

    // Adapter's own probe log declared the hover degradation at join time.
    expect(j.joined.log.some((e) => e.failureClass === "hover-unbridged")).toBe(true);

    // Pins quartets stay reachable through both walls (catalogs additive).
    expect(j.editorWall.pins.probeCatalog().length).toBeGreaterThanOrEqual(128);
    expect(j.graphWall.pins.probeCatalog().length).toBeGreaterThanOrEqual(93);
  });

  test("(a) editor select → T5 link.select.in carries the SAME nodeId byte-equal; centering honestly reported false headless", async () => {
    const j = await mountJoint(sharedEnvelope());

    j.editorAdapter.moveCursor(CARET_ADD);

    // T4 pins: the emitted BusEvent carried add's schema id, origin editor.
    const edHist = j.editorWall.pins.history() as AnyEvent[];
    const emitted = lastPayload<{ busEvent: { type: string; nodeId: string; origin: string } }>(
      edHist, "editor.select.emit.bus");
    expect(emitted.busEvent.type).toBe("node.select");
    expect(emitted.busEvent.origin).toBe("editor");
    expect(emitted.busEvent.nodeId === ADD).toBe(true);

    // T4's busLog pin (dump) shows the event on the joined bus.
    const busLog = (j.editorWall.pins.dump() as { busLog: { nodeId: string; origin: string }[] }).busLog;
    expect(busLog.length).toBe(1);
    expect(busLog[0].nodeId === ADD).toBe(true);

    // T4's own echo-guard survived the join: its loopback was suppressed.
    const guards = of(edHist, "editor.select.echo.guard")
      .map((e) => e.payload as { suppressedReEmit: boolean; reason: string });
    expect(guards.filter((g) => g.suppressedReEmit && g.reason.includes("own editor-origin")).length).toBe(1);

    // T5 pins: link.select.in carries the SAME id byte-equal, source "editor".
    const gvHist = j.graphWall.pins.history() as AnyEvent[];
    const selIn = lastPayload<{ nodeId: string; source: string }>(gvHist, "link.select.in");
    expect(selIn.nodeId === ADD).toBe(true);
    expect(selIn.nodeId === emitted.busEvent.nodeId).toBe(true);
    expect(selIn.source).toBe("editor");
    expect(lastPayload<{ present: boolean }>(gvHist, "link.select.resolve").present).toBe(true);

    // Honest headless ceiling: the center pin REPORTS centered:false + why.
    const center = lastPayload<{ nodeId: string; centered: boolean; highlighted: boolean; reason?: string }>(
      gvHist, "link.select.center");
    expect(center.nodeId === ADD).toBe(true);
    expect(center.centered).toBe(false);
    expect(center.reason).toContain("no DOM centering hook bound");

    // Selection state landed on both the pin stream and the dump.
    expect(lastPayload<{ selectedId: string }>(gvHist, "link.select.state").selectedId === ADD).toBe(true);
    expect(j.graphWall.pins.dump().selection.selectedId === ADD).toBe(true);
  });

  test("(b) graph click → T4 busLog + recv pins carry the SAME nodeId; editor really revealed the span", async () => {
    const j = await mountJoint(sharedEnvelope());

    j.graphWall.cell.controller.clickNode(UNUSED);

    // T5 pins: the outgoing click was probed and put on the wire as source graph.
    const gvHist = j.graphWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ nodeId: string; source: string }>(gvHist, "link.select.out").nodeId === UNUSED).toBe(true);
    const wire = lastPayload<{ type: string; nodeId: string; source: string }>(gvHist, "link.bus.emit");
    expect(wire).toEqual({ type: "select", nodeId: UNUSED, source: "graph" });
    expect(j.joined.graphSide.emitted.length).toBe(1);
    expect(j.graphWall.pins.dump().selection.selectedId === UNUSED).toBe(true);

    // T5's echo-filter survived the join: its own loopback was ignored, probed.
    expect(of(gvHist, "link.echo.ignored").length).toBe(1);

    // T4 pins: busLog carries the SAME nodeId as a graph-origin BusEvent…
    const busLog = (j.editorWall.pins.dump() as { busLog: { type: string; nodeId: string; origin: string }[] }).busLog;
    expect(busLog.length).toBe(1);
    expect(busLog[0].type).toBe("node.select");
    expect(busLog[0].origin).toBe("graph");
    expect(busLog[0].nodeId === UNUSED).toBe(true);

    // …and the recv path found + revealed exactly that node, probed.
    const edHist = j.editorWall.pins.history() as AnyEvent[];
    expect(lastPayload<{ nodeId: string; origin: string }>(edHist, "editor.select.recv.bus").nodeId === UNUSED).toBe(true);
    expect(lastPayload<{ nodeId: string; found: boolean }>(edHist, "editor.select.recv.lookup").found).toBe(true);
    const reveal = lastPayload<{ nodeId: string; highlightApplied: boolean }>(edHist, "editor.select.recv.reveal");
    expect(reveal.nodeId === UNUSED).toBe(true);
    expect(reveal.highlightApplied).toBe(true);
    expect(of(edHist, "editor.select.recv.miss").length).toBe(0);

    // Adapter-level truth agrees (assembly probe, in addition to both pins).
    expect(j.editorAdapter.revealed.length).toBe(1);
    expect(j.joined.stats().forwardedGraphToEditor).toBe(1);
  });
});
