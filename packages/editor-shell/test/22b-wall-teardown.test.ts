/**
 * ASSEMBLY Phase 1 — WALL CONFORMANCE (pins vs face), part 2 of 2 (SUB200
 * restructure: split from 22-wall-conformance.test.ts, assertions unchanged).
 *
 * Covered here:
 *   4. honest ceiling: unknown renders unknown, null outline renders
 *      not-yet-computed, tier G / fabricated green never surface green —
 *      THROUGH the wall;
 *   5. named failure classes: schema-pin-mismatch, wall-disposed; dispose is
 *      idempotent and tears the cell down cleanly;
 *   6. pins delegation: probeCatalog/dump/history/tap are the cell's real
 *      quartet, and the catalog grew additively (wall.* leads cataloged).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { PROBE_CATALOG } from "../src/probe/catalog.js";
import type { ProbeEvent } from "../src/probe/probe-bus.js";
import { nodeByName } from "./stub/harness.js";
import {
  eventsOf,
  lastGutterByNode,
  lastPayload,
  mountWall,
  payloadsOf,
} from "./helpers/wall-harness.js";

test("wall honest ceiling: unknown renders unknown, null outline renders not-yet-computed, tier G never surfaces green", async () => {
  // clean.py at CT: unknown fill + null outline pass through UNSOFTENED.
  const h = await mountWall("clean.py");
  const helper = nodeByName(h.nodes, "unused_helper");
  const cleanModule = nodeByName(h.nodes, "clean");

  assert.equal(lastGutterByNode(h.wall).get(helper.id), "unknown");
  const unknownRenders = payloadsOf(h.wall, "editor.verdict.unknown.render");
  assert.ok(unknownRenders.some((p) => p.nodeId === helper.id && p.renderedAs === "unknown"));

  const nullOutlines = payloadsOf(h.wall, "editor.verdict.outline.null");
  for (const n of [helper, cleanModule]) {
    assert.ok(
      nullOutlines.some((p) => p.nodeId === n.id && p.reason === "outline-not-computed-yet"),
      `null outline for ${n.name} must be probed as not-computed-yet`,
    );
  }
  const outlinePaints = payloadsOf(h.wall, "editor.verdict.outline.paint");
  const helperOutline = outlinePaints.filter((p) => p.nodeId === helper.id).at(-1)!;
  assert.equal(helperOutline.status, "not-yet-computed");
  assert.equal(helperOutline.ringColor, "grey");
  await h.wall.dispose();

  // tier-g.tex at tier G: schema claims green; the wall surfaces NO green.
  const g = await mountWall("tier-g.tex", { tier: "G" });
  const blocked = lastPayload(g.wall, "editor.verdict.green.blocked");
  assert.equal(blocked.tier, "G");
  assert.equal(blocked.reason, "green-may-never-be-faked");
  const guard = lastPayload(g.wall, "editor.conn.tier.guard");
  assert.equal(guard.liveGreenAllowed, false);
  for (const p of payloadsOf(g.wall, "editor.verdict.gutter.paint")) {
    assert.notEqual(p.status, "green", `tier G surfaced green for ${p.nodeId} through the wall`);
  }
  await g.wall.dispose();
});

test("wall failure classes + teardown: wall-disposed is named and probed; dispose is idempotent and clean", async () => {
  const h = await mountWall("clean.py");

  await h.wall.dispose("conformance teardown");
  // The cell went down cleanly: didClose sent, connection + mount disposed.
  assert.ok(eventsOf(h.wall, "editor.lsp.out.didClose").length > 0);
  assert.ok(eventsOf(h.wall, "editor.conn.dispose").length > 0);
  assert.ok(eventsOf(h.wall, "editor.mount.dispose").length > 0);
  assert.equal(eventsOf(h.wall, "editor.wall.dispose").length, 1);
  assert.equal(
    (eventsOf(h.wall, "editor.wall.dispose")[0].payload as any).reason,
    "conformance teardown",
  );

  // update() after dispose: NAMED failure class, and the rejection is probed.
  assert.throws(() => h.wall.update(h.nodes), /failure-class=wall-disposed/);
  const rejected = lastPayload(h.wall, "editor.wall.update.nodes");
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "failure-class=wall-disposed");

  // Idempotent: a second dispose is a no-op, not a second teardown.
  await h.wall.dispose();
  assert.equal(eventsOf(h.wall, "editor.wall.dispose").length, 1);
});

test("wall pins: the accessor is the cell's real quartet, and the catalog grew ADDITIVELY with the wall leads", async () => {
  const h = await mountWall("clean.py");

  // probeCatalog() through the wall is the cell's catalog, verbatim.
  assert.deepEqual(h.wall.pins.probeCatalog(), PROBE_CATALOG);

  // Catalog grew, never shrank: 123 Phase-0 entries + the 5 wall-decision leads.
  assert.ok(PROBE_CATALOG.length >= 128, `catalog has only ${PROBE_CATALOG.length} entries`);
  for (const id of [
    "editor.wall.pin.check",
    "editor.wall.mount",
    "editor.wall.update.nodes",
    "editor.wall.dispose",
    "editor.map.nodes.refresh",
  ]) {
    assert.ok(
      PROBE_CATALOG.some((s) => s.probeId === id),
      `wall lead ${id} must be cataloged (buses hard-reject uncataloged emits)`,
    );
  }

  // tap() is live: a graph-origin select surfaces on the tapped lead.
  const tapped: ProbeEvent[] = [];
  const untap = h.wall.pins.tap("editor.select.recv.bus", (e) => tapped.push(e));
  const add = nodeByName(h.nodes, "add");
  h.wall.bus.emit({ type: "node.select", nodeId: add.id, origin: "graph", clock: 9 });
  assert.equal(tapped.length, 1);
  assert.equal((tapped[0].payload as any).nodeId, add.id);
  untap();
  h.wall.bus.emit({ type: "node.select", nodeId: add.id, origin: "graph", clock: 10 });
  assert.equal(tapped.length, 1, "unsubscribe must actually unsubscribe");

  // history() through the wall contains the tapped event — same stream.
  assert.ok(
    h.wall.pins.history().some((e) => e.logicalClock === tapped[0].logicalClock &&
      e.probeId === "editor.select.recv.bus"),
  );

  await h.wall.dispose();
});
