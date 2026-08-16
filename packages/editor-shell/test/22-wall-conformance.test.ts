/**
 * ASSEMBLY Phase 1 — WALL CONFORMANCE (pins vs face), part 1 of 2.
 *
 * Contract (WALL-CONVENTIONS.md rule 5): drive the wall with representative
 * calls, then read the cell's PINS and assert the pin-level truth equals what
 * the wall declared. Declared behavior may never diverge from probed behavior.
 *
 * Covered here, all HEADLESS through the wall face (StubEditorAdapter + stub
 * capability/server — the Monaco tier shares this exact face, see
 * MEMBRANE-SPEC.md):
 *   1. schema PIN: the wall's recorded pin == the cell's verified-in-sync
 *      copies == the REAL packages/schema (canonical hash recomputed from
 *      schema.json at runtime — the same pattern-(b) loop as test 21);
 *   2. bus: a selection driven through wall.bus equals the pins' busLog entry
 *      byte-for-byte, both directions (graph→editor and editor→graph);
 *   3. update(nodes): the verdict gutter decisions visible in the pins match
 *      exactly what the wall's update() delivered.
 * (Parts 4–6 live in 22b-wall-teardown.test.ts; shared harness in
 * helpers/wall-harness.ts — SUB200 restructure, assertions unchanged.)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { WALL_VERSION, WALL_SCHEMA_PIN, type BusEvent } from "../src/wall.js";
import * as localPin from "../src/schema/pin.js";
import type { SchemaNode } from "../src/schema/schema.js";
import { nodeByName } from "./stub/harness.js";
import {
  SCHEMA_PKG,
  eventsOf,
  importCanonical,
  lastGutterByNode,
  lastPayload,
  mountWall,
  payloadsOf,
} from "./helpers/wall-harness.js";

test("wall pin: WALL_VERSION + recorded schema PIN == verified-in-sync copies == REAL packages/schema", async () => {
  assert.equal(WALL_VERSION, "editor-shell-wall/1.0.0");

  const h = await mountWall("clean.py");

  // Construction probed the pin decision, pass:true, exact recorded pair.
  const pinCheck = lastPayload(h.wall, "editor.wall.pin.check");
  assert.equal(pinCheck.pass, true);
  assert.equal(pinCheck.wallVersion, WALL_VERSION);
  assert.equal(pinCheck.schemaVersion, WALL_SCHEMA_PIN.schemaVersion);
  assert.equal(pinCheck.schemaHash, WALL_SCHEMA_PIN.schemaHash);
  const mount = lastPayload(h.wall, "editor.wall.mount");
  assert.equal(mount.wallVersion, WALL_VERSION);
  assert.equal(mount.uri, h.meta.uri);
  assert.equal(mount.nodeCount, h.nodes.length);

  // The wall's recorded pin equals the CANONICAL package's pin consts…
  const canonPin = await importCanonical("gen/pin.ts");
  assert.equal(canonPin.PINNED_SCHEMA_VERSION, WALL_SCHEMA_PIN.schemaVersion);
  assert.equal(canonPin.PINNED_SCHEMA_HASH, WALL_SCHEMA_PIN.schemaHash);

  // …and the cell's verified-in-sync pin COPY agrees constant-for-constant…
  assert.equal(localPin.PINNED_SCHEMA_VERSION, canonPin.PINNED_SCHEMA_VERSION);
  assert.equal(localPin.PINNED_SCHEMA_REVISION, canonPin.PINNED_SCHEMA_REVISION);
  assert.equal(localPin.PINNED_SCHEMA_HASH, canonPin.PINNED_SCHEMA_HASH);
  const nasty = { b: [1, "α", null, { z: true, a: false }], a: "x", c: {} };
  assert.equal(localPin.canonicalJson(nasty), canonPin.canonicalJson(nasty));

  // …and canonical TRUTH recomputed from schema.json matches the recorded pin
  // (both serializers, independently hashed via node:crypto).
  const schemaObj = JSON.parse(readFileSync(join(SCHEMA_PKG, "schema.json"), "utf8"));
  for (const serialize of [localPin.canonicalJson, canonPin.canonicalJson]) {
    const recomputed = createHash("sha256").update(serialize(schemaObj), "utf8").digest("hex");
    assert.equal(recomputed, WALL_SCHEMA_PIN.schemaHash, "wall pin drifted from canonical schema.json");
  }
  assert.equal(schemaObj.schemaVersion, WALL_SCHEMA_PIN.schemaVersion);

  // Drift refuses loudly with the NAMED failure class — both copies agree.
  assert.throws(() => localPin.checkPin("v1", WALL_SCHEMA_PIN.schemaHash), /schema-pin-mismatch/);
  assert.throws(() => localPin.checkPin(WALL_SCHEMA_PIN.schemaVersion, "0".repeat(64)), /schema-pin-mismatch/);
  assert.throws(() => canonPin.checkPin("v1", WALL_SCHEMA_PIN.schemaHash), /schema-pin-mismatch/);

  await h.wall.dispose();
});

test("wall bus: a selection driven through wall.bus equals the pins' busLog entry, both directions, ids byte-identical", async () => {
  const h = await mountWall("clean.py");
  const add = nodeByName(h.nodes, "add");

  // Face-level listener: what a neighbor (Tree 5) would hear on wall.bus.
  const heard: BusEvent[] = [];
  h.wall.bus.subscribe((e) => heard.push(e));

  // ── graph → editor: drive a selection THROUGH the wall's bus. ─────────────
  const graphEvent: BusEvent = { type: "node.select", nodeId: add.id, origin: "graph", clock: 1 };
  h.wall.bus.emit(graphEvent);

  const recv = lastPayload(h.wall, "editor.select.recv.bus");
  assert.equal(recv.nodeId, add.id, "the id the cell received must be the id driven through the wall");
  const reveal = lastPayload(h.wall, "editor.select.recv.reveal");
  assert.equal(reveal.nodeId, add.id);
  assert.equal(reveal.highlightApplied, true);

  // Pin truth: the busLog entry in dump() IS the event the wall carried.
  const dump1 = h.wall.pins.dump() as { busLog: BusEvent[] };
  assert.deepEqual(dump1.busLog[dump1.busLog.length - 1], graphEvent);

  // ── editor → graph: caret into add's span emits on the SAME bus. ──────────
  h.adapter.moveCursor({ line: 1, column: 5 }); // inside add (innermost beats the module span)
  const emitted = lastPayload<{ busEvent: BusEvent }>(h.wall, "editor.select.emit.bus").busEvent;
  assert.equal(emitted.type, "node.select");
  assert.equal(emitted.origin, "editor");
  assert.equal(emitted.nodeId, add.id, "emitted id must be Tree 1's exact string, never re-derived");

  // The face heard exactly what the pins recorded — declared == probed.
  const editorHeard = heard.filter((e) => e.origin === "editor");
  assert.equal(editorHeard.length, 1);
  assert.deepEqual(editorHeard[0], emitted);
  const dump2 = h.wall.pins.dump() as { busLog: BusEvent[] };
  assert.deepEqual(dump2.busLog[dump2.busLog.length - 1], emitted);

  await h.wall.dispose();
});

test("wall update(nodes): verdict gutter decisions visible in the pins match what update() delivered", async () => {
  const h = await mountWall("clean.py");
  const clockBeforeUpdate = h.wall.pins.history().at(-1)!.logicalClock;

  // Initial paint sanity (CT tier): add green from a real verdict.
  const initial = lastGutterByNode(h.wall);
  assert.equal(initial.get(nodeByName(h.nodes, "add").id), "green");

  // Deliver FRESH nodes through the wall: add's verdict went red upstream;
  // unused_helper arrives with a FABRICATED green (empty source).
  const fresh = JSON.parse(JSON.stringify(h.nodes)) as SchemaNode[];
  const freshAdd = nodeByName(fresh, "add");
  freshAdd.fill = { status: "red", source: "stub-pyright@1.1 typecheck verdict" };
  const freshHelper = nodeByName(fresh, "unused_helper");
  freshHelper.fill = { status: "green", source: "" }; // no real verdict behind it
  h.wall.update(fresh);

  // The face call is probed and chained to the cell's real refresh mechanism.
  const upd = lastPayload(h.wall, "editor.wall.update.nodes");
  assert.equal(upd.accepted, true);
  assert.equal(upd.nodeCount, fresh.length);
  const refresh = eventsOf(h.wall, "editor.map.nodes.refresh").at(-1)!;
  assert.equal((refresh.payload as any).mounted, true);
  assert.match(refresh.causeId ?? "", /^editor\.wall\.update\.nodes@\d+$/);
  const rebuild = eventsOf(h.wall, "editor.map.build.index").filter(
    (e) => e.logicalClock > refresh.logicalClock,
  );
  assert.ok(rebuild.length > 0, "update(nodes) must rebuild the span index, never repaint stale coordinates");

  // PINS vs FACE: the repainted gutter decisions equal the delivered nodes
  // under the cell's published policy — nothing more, nothing less.
  const painted = lastGutterByNode(h.wall, clockBeforeUpdate);
  const expected = new Map<string, string>([
    [nodeByName(fresh, "clean").id, "blue"],            // origin given → blue
    [freshAdd.id, "red"],                                // delivered schema red carried through
    [nodeByName(fresh, "double").id, "amber"],           // origin assumed → amber debt
    [freshHelper.id, "unknown"],                         // fabricated green BLOCKED → unknown
  ]);
  assert.deepEqual(painted, expected, "pin-level gutter truth diverged from what update() delivered");

  // The fabricated green was blocked LOUDLY (honest ceiling through the wall).
  const blocked = eventsOf(h.wall, "editor.verdict.green.blocked").filter(
    (e) => e.logicalClock > clockBeforeUpdate,
  );
  assert.equal((blocked.at(-1)!.payload as any).nodeId, freshHelper.id);
  assert.equal((blocked.at(-1)!.payload as any).reason, "green-may-never-be-faked");

  // dump()'s verdict snapshot agrees with the probe stream (pin == pin).
  const verdicts = (h.wall.pins.dump() as any).verdicts.decisions as {
    nodeId: string;
    displayedStatus: string;
  }[];
  for (const [nodeId, status] of expected) {
    assert.equal(
      verdicts.find((d) => d.nodeId === nodeId)?.displayedStatus,
      status,
      `dump().verdicts for ${nodeId} disagrees with the painted gutter`,
    );
  }

  // Viewport re-emitted for the fresh node set.
  const vp = lastPayload<{ nodeIdsInView: string[] }>(h.wall, "editor.render.viewport");
  assert.deepEqual(vp.nodeIdsInView, [...expected.keys()].sort());

  await h.wall.dispose();
});
