/**
 * SPEC §9.13 — Span-index stability under edits. Failure class: STALE COORDINATE.
 *
 * After ANY buffer change (find/replace batch, multi-cursor multi-change edit)
 * the SpanIndex must be invalidated (editor.map.stale {action:"rebuild"}) and
 * rebuilt at the new model version BEFORE any subsequent caret emit resolves —
 * otherwise carets map through a pre-edit line table and bind to the wrong node.
 *
 * Fixture: clean.py (no diagnostics; all-ASCII so utf-16 offset == byte offset).
 * Pre-edit model text (111 bytes, LF):
 *   L1 "def add(a, b):"        [0..14)    \n@14
 *   L2 "    return a + b"      [15..31)   \n@31
 *   L3 ""                      \n@32
 *   L4 ""                      \n@33
 *   L5 "def double(x):"        [34..48)   \n@48
 *   L6 "    return add(x, x)"  [49..69)   \n@69   ("add" at 60..63)
 *   L7 "" \n@70   L8 "" \n@71
 *   L9 "def unused_helper(y):" [72..93)   \n@93
 *   L10 "    return y * 2"     [94..110)  \n@110
 *
 * After findReplace("add","total") (+2 bytes twice) and a 2-change multi-cursor
 * edit inserting "# a"@34 / "# b"@35 (+6 bytes), the post-edit layout is:
 *   L1 [0..16) L2 [17..33) L3 "# a" [34..37) L4 "# b" [38..41)
 *   L5 "def double(x):" [42..56) L6 "    return total(x, x)" [57..79)
 *   L7 \n@80 L8 \n@81 L9 "def unused_helper(y):" [82..103) L10 [104..120)
 * Schema byte spans are static: add [0,32) double [34,70) unused_helper [72,111)
 * module clean [0,111).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, nodeByName } from "./stub/harness.js";
import {
  assertOrdered,
  eventsOf,
  lastPayload,
  payloadsOf,
} from "./stub/assert-probes.js";

/** find/replace ("add"→"total") + a 2-change multi-cursor edit, shifting all later offsets. */
function shiftOffsets(h: Awaited<ReturnType<typeof openTestCell>>): void {
  const replaced = h.adapter.simulateFindReplace("add", "total");
  assert.equal(replaced, 2, "fixture has exactly two 'add' occurrences");
  // Multi-cursor edit = ONE user edit carrying 2 changes (post-replace offsets
  // 34/35 are the two blank lines between add and double).
  h.adapter.simulateUserEdit([
    { rangeOffset: 34, rangeLength: 0, text: "# a" },
    { rangeOffset: 35, rangeLength: 0, text: "# b" },
  ]);
}

test("stale coordinate: find/replace and a multi-cursor edit each fire map.stale {action:'rebuild'} and build.index re-fires at the new version BEFORE any caret resolve", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;

  const buildsAtOpen = eventsOf(bus, "editor.map.build.index");
  assert.equal(buildsAtOpen.length, 1);
  assert.equal((buildsAtOpen[0].payload as { builtAtVersion: number }).builtAtVersion, 1);

  shiftOffsets(h);

  // Both edits surfaced as multi-change USER edits (find/replace batch + multi-cursor).
  const changes = payloadsOf(bus, "editor.buffer.change");
  assert.equal(changes.length, 2);
  assert.equal((changes[0].changes as unknown[]).length, 2, "find/replace batch carried 2 changes");
  assert.equal((changes[1].changes as unknown[]).length, 2, "multi-cursor edit carried 2 changes");

  // Each edit invalidated the index — action is ALWAYS "rebuild", never trust-stale.
  assert.deepEqual(payloadsOf(bus, "editor.map.stale"), [
    { builtAtVersion: 1, currentVersion: 2, action: "rebuild" },
    { builtAtVersion: 2, currentVersion: 3, action: "rebuild" },
  ]);

  // The index was rebuilt at each new version (open@1, then 2, then 3).
  const builds = eventsOf(bus, "editor.map.build.index");
  assert.deepEqual(
    builds.map((b) => (b.payload as { builtAtVersion: number }).builtAtVersion),
    [1, 2, 3],
  );
  const lastBuild = builds[builds.length - 1];
  assert.equal(
    (lastBuild.payload as { builtAtVersion: number }).builtAtVersion,
    h.adapter.getVersionId(),
    "final index version == current model version",
  );
  // Rebuild follows its own stale marker within the same causal window.
  const stales = eventsOf(bus, "editor.map.stale");
  assert.ok(stales[1].logicalClock < lastBuild.logicalClock, "stale marker precedes the rebuild");

  // NOW move the caret: every resolve must postdate the final rebuild.
  h.adapter.moveCursor({ line: 5, column: 5 });

  const resolves = eventsOf(bus, "editor.select.emit.resolve");
  assert.ok(resolves.length >= 1, "caret over a node resolved");
  assert.ok(
    lastBuild.logicalClock < resolves[0].logicalClock,
    `rebuild build.index (clock ${lastBuild.logicalClock}) must precede the next select.emit.resolve (clock ${resolves[0].logicalClock})`,
  );
  for (const r of resolves) {
    assert.ok(
      r.logicalClock > lastBuild.logicalClock,
      `a caret resolve (clock ${r.logicalClock}) ran against the stale pre-rebuild index (rebuild clock ${lastBuild.logicalClock})`,
    );
  }
  // First occurrences in strict logical order: edit-invalidate → resolve → bus emit.
  assertOrdered(bus, [
    "editor.buffer.open.input",
    "editor.map.stale",
    "editor.select.emit.resolve",
    "editor.select.emit.bus",
  ]);

  await h.cell.dispose();
});

test("stale coordinate: after offsets shift, the caret resolves through POST-edit byte math — right nodeId and span on emit.resolve, byte-identical id on emit.bus", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const dbl = nodeByName(h.nodes, "double");
  const helper = nodeByName(h.nodes, "unused_helper");

  // Baseline BEFORE the edits: caret at L5:C5 maps to byte 38 (L5 starts at 34).
  h.adapter.moveCursor({ line: 5, column: 5 });
  assert.deepEqual(lastPayload(bus, "editor.map.pos.to.byte"), {
    line: 5,
    column: 5,
    byteOffset: 38,
    positionEncoding: "utf-16",
  });
  assert.equal(lastPayload(bus, "editor.select.emit.resolve").nodeId, dbl.id);

  shiftOffsets(h);

  // Same visual caret now sits at byte 46 (L5 starts at 42). A stale index
  // would still report 38 — the exact stale-coordinate failure.
  h.adapter.moveCursor({ line: 5, column: 5 });
  assert.deepEqual(lastPayload(bus, "editor.map.pos.to.byte"), {
    line: 5,
    column: 5,
    byteOffset: 46,
    positionEncoding: "utf-16",
  });
  const res1 = lastPayload(bus, "editor.select.emit.resolve");
  assert.equal(res1.nodeId, dbl.id, "caret in 'def double' binds to double");
  assert.deepEqual(res1.span, dbl.span, "span carried on resolve is the schema span, byte-identical");
  assert.deepEqual(res1.span, { file: h.meta.uri, byteStart: 34, byteEnd: 70 });
  const emit1 = lastPayload<{ busEvent: { nodeId: string; origin: string } }>(
    bus,
    "editor.select.emit.bus",
  );
  assert.equal(emit1.busEvent.nodeId, dbl.id, "bus carries Tree 1's exact id string");
  assert.equal(emit1.busEvent.origin, "editor");

  // Discriminating caret: L6:C17 → byte 57+16 = 73 on the FRESH index, inside
  // unused_helper's static span [72,111). A stale pre-edit index computes
  // 49+16 = 65 and wrongly binds the caret to double [34,70).
  h.adapter.moveCursor({ line: 6, column: 17 });
  assert.deepEqual(lastPayload(bus, "editor.map.pos.to.byte"), {
    line: 6,
    column: 17,
    byteOffset: 73,
    positionEncoding: "utf-16",
  });
  const res2 = lastPayload(bus, "editor.select.emit.resolve");
  assert.equal(
    res2.nodeId,
    helper.id,
    "fresh-index byte 73 binds to unused_helper; double here would prove a stale line table",
  );
  assert.deepEqual(res2.span, helper.span);
  assert.deepEqual(res2.span, { file: h.meta.uri, byteStart: 72, byteEnd: 111 });
  // Nested-candidate decision (module ⊃ unused_helper) chose the innermost.
  const amb = lastPayload(bus, "editor.map.overlap.ambiguous");
  assert.equal(amb.chosen, helper.id);
  assert.equal(amb.rule, "innermost");
  const emit2 = lastPayload<{ busEvent: { nodeId: string; origin: string } }>(
    bus,
    "editor.select.emit.bus",
  );
  assert.equal(emit2.busEvent.nodeId, helper.id);
  // Cross-pane truth: the graph stub heard exactly that id (string-identical).
  assert.equal(h.graph.heardFromEditor().at(-1)?.nodeId, helper.id);

  await h.cell.dispose();
});
