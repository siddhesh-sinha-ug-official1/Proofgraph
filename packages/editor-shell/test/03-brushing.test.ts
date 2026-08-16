/**
 * §9.3 — Brushing-and-linking across the Tree 5 seam (part 1 of 2; SUB200
 * restructure split — nested/miss/multi/timing cases in
 * 03b-brushing-edges.test.ts; assertions unchanged).
 *
 * Failure class under test: ID DRIFT ACROSS PROJECTIONS — a node id that gets
 * re-derived, trimmed, re-encoded, or otherwise mutated anywhere between the
 * schema, the SpanIndex, the bus, and the graph pane. Every assertion below
 * reads probe output; adapter/bus state is asserted additionally.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, nodeByName } from "./stub/harness.js";
import { assertNeverFired, eventsOf, lastPayload, payloadsOf } from "./stub/assert-probes.js";
import type {
  EmitBusPayload,
  GuardPayload,
  LookupPayload,
  RecvMissPayload,
  ResolvePayload,
  RevealPayload,
} from "./helpers/select-payloads.js";

test("id drift across projections (emit): caret in add's span puts the schema id on the bus string-identical", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const add = nodeByName(h.nodes, "add");

  const addIdx = h.cell.index().getById(add.id);
  assert.ok(addIdx, "index has no entry for add's schema id");
  h.adapter.moveCursor({
    line: addIdx!.monacoRange.startLine,
    column: addIdx!.monacoRange.startColumn + 4,
  });

  // Probe: the emitted BusEvent carries the schema id STRING-IDENTICAL (===).
  const emitted = lastPayload<EmitBusPayload>(bus, "editor.select.emit.bus");
  assert.equal(typeof emitted.busEvent.nodeId, "string");
  assert.ok(
    emitted.busEvent.nodeId === add.id,
    `bus nodeId drifted: emitted ${JSON.stringify(emitted.busEvent.nodeId)} !== schema ${JSON.stringify(add.id)}`,
  );
  assert.equal(emitted.busEvent.origin, "editor");
  assert.equal(emitted.busEvent.type, "node.select");

  // The resolve step already bound the same id (no drift inside the cell either).
  const resolved = lastPayload<ResolvePayload>(bus, "editor.select.emit.resolve");
  assert.ok(resolved.nodeId === add.id, "emit.resolve nodeId drifted from schema id");

  // The OTHER pane actually heard that exact string (seam-level proof).
  const heard = h.graph.heardFromEditor();
  assert.ok(heard.length >= 1, "graph pane heard no editor-origin event");
  assert.ok(
    heard.at(-1)!.nodeId === add.id,
    `graph heard ${JSON.stringify(heard.at(-1)!.nodeId)} !== schema id`,
  );
});

test("id drift across projections (recv): graph select of add reveals add's exact indexed span", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const add = nodeByName(h.nodes, "add");
  const expectedRange = h.cell.index().getById(add.id)!.monacoRange;

  h.graph.select(add.id);

  const reveal = lastPayload<RevealPayload>(bus, "editor.select.recv.reveal");
  assert.equal(reveal.nodeId, add.id);
  assert.equal(reveal.highlightApplied, true);
  assert.deepEqual(
    reveal.monacoRange,
    expectedRange,
    "revealed range drifted from the SpanIndex range for the same id",
  );

  // Lookup probe found the id (not a re-derived cousin).
  const lookup = lastPayload<LookupPayload>(bus, "editor.select.recv.lookup");
  assert.equal(lookup.nodeId, add.id);
  assert.equal(lookup.found, true);
  assertNeverFired(bus, "editor.select.recv.miss", "recv of a local id must not miss");

  // Additional (adapter side): the editor was really scrolled + highlighted there.
  assert.deepEqual(h.adapter.revealed.at(-1), expectedRange, "adapter.revealRangeInCenter range drifted");
  const highlights = h.adapter.decorationsByKind.get("highlight") ?? [];
  const hl = highlights.find((d) => d.key === add.id);
  assert.ok(hl, `no highlight decoration keyed by the schema id; keys: ${JSON.stringify(highlights.map((d) => d.key))}`);
  assert.deepEqual(hl!.range, expectedRange);
});

test("id drift across projections (round-trip echo): reflecting our own bus event is suppressed with no re-emit", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const add = nodeByName(h.nodes, "add");
  const addIdx = h.cell.index().getById(add.id)!;

  h.adapter.moveCursor({
    line: addIdx.monacoRange.startLine,
    column: addIdx.monacoRange.startColumn + 4,
  });

  const emittedEvent = h.bus.log.find((e) => e.origin === "editor" && e.nodeId === add.id);
  assert.ok(emittedEvent, "no editor-origin BusEvent for add found in the bus log");

  const REFLECT_REASON = "own editor-origin event reflected back";
  const guardCountBefore = payloadsOf<GuardPayload>(bus, "editor.select.echo.guard").filter(
    (p) => p.reason === REFLECT_REASON,
  ).length;
  const emitBusCountBefore = eventsOf(bus, "editor.select.emit.bus").length;

  h.graph.reflect(emittedEvent!);

  // Probe: the echo guard fired for the reflected event with the exact contract payload.
  const guardsAfter = payloadsOf<GuardPayload>(bus, "editor.select.echo.guard").filter(
    (p) => p.reason === REFLECT_REASON,
  );
  assert.equal(
    guardsAfter.length,
    guardCountBefore + 1,
    "reflecting the event did not fire exactly one more echo guard",
  );
  const guard = guardsAfter.at(-1)!;
  assert.equal(guard.suppressedReEmit, true);
  assert.equal(guard.reason, REFLECT_REASON);
  assert.equal(guard.nodeId, add.id);

  // Probe: NO new bus emission — the loop editor→graph→editor→… is dead.
  const emitBusCountAfter = eventsOf(bus, "editor.select.emit.bus").length;
  assert.equal(
    emitBusCountAfter,
    emitBusCountBefore,
    `reflected event caused ${emitBusCountAfter - emitBusCountBefore} re-emit(s) — echo loop`,
  );
});

test("id drift across projections (foreign id): selecting other.py's node logs idNotInThisFile and never reveals", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const foreign = nodeByName(h.nodes, "foreign_fn");
  assert.ok(foreign.span.file.endsWith("other.py"), "fixture drift: foreign_fn should live in other.py");

  h.graph.select(foreign.id);

  const miss = lastPayload<RecvMissPayload>(bus, "editor.select.recv.miss");
  assert.equal(miss.nodeId, foreign.id);
  assert.equal(miss.reason, "idNotInThisFile");

  const lookup = lastPayload<LookupPayload>(bus, "editor.select.recv.lookup");
  assert.equal(lookup.nodeId, foreign.id);
  assert.equal(lookup.found, false);

  assertNeverFired(bus, "editor.select.recv.reveal", "a foreign id must never reveal in this file");

  // The foreign node was partitioned out at index build (logged, not silently dropped).
  const multifile = payloadsOf<{ nodeId: string; reason: string }>(bus, "editor.map.multifile");
  assert.ok(
    multifile.some((p) => p.nodeId === foreign.id && p.reason === "not-this-file"),
    "index build did not log the foreign node's exclusion",
  );

  // Additional (adapter side): nothing scrolled, nothing highlighted.
  assert.equal(h.adapter.revealed.length, 0);
  assert.equal((h.adapter.decorationsByKind.get("highlight") ?? []).length, 0);
});
