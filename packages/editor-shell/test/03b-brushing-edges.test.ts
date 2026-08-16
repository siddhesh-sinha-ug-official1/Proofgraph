/**
 * §9.3 — Brushing-and-linking across the Tree 5 seam (part 2 of 2; SUB200
 * restructure split from 03-brushing.test.ts, assertions unchanged): nested
 * spans, span gaps, multi-cursor policy, and bidirectional timing.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, loadFixture, nodeByName } from "./stub/harness.js";
import { assertFired, assertNeverFired, eventsOf, lastPayload, payloadsOf } from "./stub/assert-probes.js";
import type {
  AmbiguousPayload,
  EmitBusPayload,
  EmitMissPayload,
  MultiPayload,
  ResolvePayload,
  TimingPayload,
} from "./helpers/select-payloads.js";

test("id drift across projections (nested spans): caret in Shape.area emits the INNERMOST id, decision logged with rule innermost", async () => {
  const h = await openTestCell("nested.py");
  const bus = h.cell.probe;
  const shape = nodeByName(h.nodes, "Shape");
  const area = nodeByName(h.nodes, "Shape.area");
  const areaIdx = h.cell.index().getById(area.id)!;

  const ambiguousBefore = eventsOf(bus, "editor.map.overlap.ambiguous").length;
  h.adapter.moveCursor({
    line: areaIdx.monacoRange.startLine,
    column: areaIdx.monacoRange.startColumn + 4,
  });

  // Probe: resolution bound the innermost node, not the enclosing class.
  const resolved = lastPayload<ResolvePayload>(bus, "editor.select.emit.resolve");
  assert.ok(resolved.nodeId === area.id, `resolved ${resolved.nodeId} !== Shape.area id ${area.id}`);
  assert.notEqual(resolved.nodeId, shape.id, "outer-span capture: caret bound to Shape instead of Shape.area");

  // Probe: the ambiguity was DECIDED and logged, not silently first-wins.
  const ambiguousAfter = payloadsOf<AmbiguousPayload>(bus, "editor.map.overlap.ambiguous");
  assert.ok(ambiguousAfter.length > ambiguousBefore, "nested-span caret did not log overlap.ambiguous");
  const amb = ambiguousAfter.at(-1)!;
  assert.equal(amb.rule, "innermost");
  assert.equal(amb.chosen, area.id);
  assert.ok(amb.candidates.includes(shape.id), "ambiguity candidates missing the enclosing Shape");
  assert.ok(amb.candidates.includes(area.id), "ambiguity candidates missing Shape.area");

  // And the innermost id is what crossed the bus.
  const emitted = lastPayload<EmitBusPayload>(bus, "editor.select.emit.bus");
  assert.ok(emitted.busEvent.nodeId === area.id);
  assert.equal(h.graph.heardFromEditor().at(-1)?.nodeId, area.id);
});

test("id drift across projections (no node): caret in a span gap logs emit.miss noNodeAtCaret and emits NOTHING", async () => {
  // clean.py's module node spans the whole file, so drop it via schemaNodes
  // override — the gap between add (ends byte 32) and double (starts 34) is
  // then genuinely uncovered.
  const { nodes } = loadFixture("clean.py");
  const withoutModule = nodes.filter((n) => n.kind !== "module");
  const h = await openTestCell("clean.py", { schemaNodes: withoutModule });
  const bus = h.cell.probe;

  // Line 3 column 1 = byte 32, exclusive end of add, before double's start.
  h.adapter.moveCursor({ line: 3, column: 1 });

  const miss = lastPayload<EmitMissPayload>(bus, "editor.select.emit.miss");
  assert.equal(miss.reason, "noNodeAtCaret");
  assert.deepEqual(miss.position, { line: 3, column: 1 });

  // Probe: no phantom binding — nothing resolved, nothing crossed the bus.
  assertNeverFired(bus, "editor.select.emit.resolve", "a caret in a gap must not resolve to any node");
  assertNeverFired(bus, "editor.select.emit.bus", "a caret in a gap must not emit a bus event");
  assert.equal(h.graph.heardFromEditor().length, 0);
});

test("id drift across projections (multi-cursor): policy primary-caret is logged and only the primary's id crosses the bus", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const add = nodeByName(h.nodes, "add");
  const double_ = nodeByName(h.nodes, "double");
  const addIdx = h.cell.index().getById(add.id)!;
  const doubleIdx = h.cell.index().getById(double_.id)!;

  const posInAdd = { line: addIdx.monacoRange.startLine, column: addIdx.monacoRange.startColumn + 4 };
  const posInDouble = {
    line: doubleIdx.monacoRange.startLine,
    column: doubleIdx.monacoRange.startColumn + 4,
  };
  h.adapter.moveCursor(posInAdd, [{ start: posInDouble, end: posInDouble }]);

  // Probe: the multi-cursor DECISION is logged, not silently first-wins.
  const multi = lastPayload<MultiPayload>(bus, "editor.select.emit.multi");
  assert.equal(multi.policy, "primary-caret");
  assert.equal(multi.selectionCount, 2);
  assert.ok(multi.nodeIds[0] === add.id, "multi payload's primary node is not add's schema id");
  assert.ok(multi.nodeIds.includes(double_.id), "multi payload lost the secondary selection's node");

  // Probe: the bus got exactly the PRIMARY caret's id.
  const emitted = lastPayload<EmitBusPayload>(bus, "editor.select.emit.bus");
  assert.ok(emitted.busEvent.nodeId === add.id, "bus event is not the primary caret's node");
  assert.equal(eventsOf(bus, "editor.select.emit.bus").length, 1, "multi-cursor must emit exactly once");
  assert.equal(h.graph.heardFromEditor().length, 1);
  assert.ok(h.graph.heardFromEditor()[0].nodeId === add.id);
});

test("id drift across projections (timing blackout): editor.select.timing fires in BOTH directions with clock deltas", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const add = nodeByName(h.nodes, "add");
  const addIdx = h.cell.index().getById(add.id)!;

  // Emit direction…
  h.adapter.moveCursor({
    line: addIdx.monacoRange.startLine,
    column: addIdx.monacoRange.startColumn + 4,
  });
  // …and recv direction.
  h.graph.select(add.id);

  assertFired(bus, "editor.select.timing", 2);
  const timings = payloadsOf<TimingPayload>(bus, "editor.select.timing");

  const emitDir = timings.filter((t) => t.emitToBusClockDelta !== null);
  assert.ok(emitDir.length >= 1, "no timing probe for the emit direction");
  for (const t of emitDir) {
    assert.equal(typeof t.emitToBusClockDelta, "number");
    assert.ok(t.emitToBusClockDelta! >= 0, `emitToBusClockDelta ${t.emitToBusClockDelta} < 0`);
    assert.equal(t.busToHighlightClockDelta, null, "emit-direction timing must not fake a recv delta");
  }

  const recvDir = timings.filter((t) => t.busToHighlightClockDelta !== null);
  assert.ok(recvDir.length >= 1, "no timing probe for the recv direction");
  for (const t of recvDir) {
    assert.equal(typeof t.busToHighlightClockDelta, "number");
    assert.ok(t.busToHighlightClockDelta! >= 0, `busToHighlightClockDelta ${t.busToHighlightClockDelta} < 0`);
    assert.equal(t.emitToBusClockDelta, null, "recv-direction timing must not fake an emit delta");
  }
});
