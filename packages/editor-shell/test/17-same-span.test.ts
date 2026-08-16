/**
 * §9.17 — Two schema nodes claiming the IDENTICAL byte span.
 *
 * Failure class under test: SILENT COALESCE — the index quietly merging (or
 * dropping) one of the duplicate nodes, or picking a winner nondeterministically
 * without a logged decision. The build must surface editor.map.build.conflict
 * with both ids, a deterministic (lexicographically smallest) chosen id, and a
 * reason; position lookups bind to the chosen id; and BOTH ids stay addressable.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, loadFixture, nodeByName } from "./stub/harness.js";
import {
  assertFired,
  assertNeverFired,
  lastPayload,
  payloadsOf,
} from "./stub/assert-probes.js";
import type { SchemaNode } from "../src/schema/schema.js";
import type { TextRange } from "../src/mount/adapter.js";

type ConflictPayload = {
  span: { byteStart: number; byteEnd: number; key: string };
  nodeIds: string[];
  chosen: string;
  reason: string;
};
type ResolvePayload = { nodeId: string; matchKind: string };
type AmbiguousPayload = { candidates: string[]; chosen: string; rule: string; reason: string };
type RevealPayload = { nodeId: string; monacoRange: TextRange; highlightApplied: boolean };
type EmitBusPayload = { busEvent: { nodeId: string } };
type BuildIndexPayload = { nodeCount: number; intervalCount: number };

/**
 * Two copies of clean.py's `add` node with distinct ids/names but the SAME
 * byte span. The lexicographically LARGER id is listed FIRST so that any
 * "first in array wins" shortcut is caught as nondeterminism.
 */
function duplicateSpanNodes(): { nodes: SchemaNode[]; dupA: SchemaNode; dupB: SchemaNode; chosen: string } {
  const { nodes } = loadFixture("clean.py");
  const add = nodeByName(nodes, "add");
  const dupA: SchemaNode = { ...structuredClone(add), id: "n_dup_aaaa0001", name: "add_copy_a" };
  const dupB: SchemaNode = { ...structuredClone(add), id: "n_dup_bbbb0002", name: "add_copy_b" };
  const chosen = [dupA.id, dupB.id].sort()[0]; // lexicographically smallest
  return { nodes: [dupB, dupA], dupA, dupB, chosen };
}

test("silent coalesce: identical-span nodes fire editor.map.build.conflict with both ids, deterministic chosen, and a reason", async () => {
  const { nodes, dupA, dupB, chosen } = duplicateSpanNodes();
  const h = await openTestCell("clean.py", { schemaNodes: nodes });
  const bus = h.cell.probe;

  assertFired(bus, "editor.map.build.conflict");
  const conflict = lastPayload<ConflictPayload>(bus, "editor.map.build.conflict");

  // BOTH ids are named — nothing was silently merged away.
  assert.deepEqual(
    [...conflict.nodeIds].sort(),
    [dupA.id, dupB.id].sort(),
    "conflict probe does not name both duplicate ids",
  );

  // Deterministic winner: the lexicographically smallest id, regardless of
  // array order (the larger id was fed FIRST).
  assert.equal(conflict.chosen, chosen, "chosen is not the lexicographically smallest id");
  assert.equal(conflict.chosen, dupA.id);

  // The decision carries a reason (a logged decision, not a bare fact).
  assert.equal(typeof conflict.reason, "string");
  assert.ok(conflict.reason.length > 0, "conflict fired without a reason");

  // The conflicting span is the duplicated one.
  assert.equal(conflict.span.byteStart, dupA.span.byteStart);
  assert.equal(conflict.span.byteEnd, dupA.span.byteEnd);
});

test("silent coalesce: position lookups inside the duplicated span bind to the chosen (lexicographically smallest) id", async () => {
  const { nodes, dupA, dupB, chosen } = duplicateSpanNodes();
  const h = await openTestCell("clean.py", { schemaNodes: nodes });
  const bus = h.cell.probe;

  const chosenIdx = h.cell.index().getById(chosen);
  assert.ok(chosenIdx, "chosen id missing from the index");
  h.adapter.moveCursor({
    line: chosenIdx!.monacoRange.startLine,
    column: chosenIdx!.monacoRange.startColumn + 4,
  });

  // Probe: resolution bound the deterministic winner.
  const resolved = lastPayload<ResolvePayload>(bus, "editor.select.emit.resolve");
  assert.ok(resolved.nodeId === chosen, `emit.resolve bound ${resolved.nodeId}, expected chosen ${chosen}`);

  // The tie itself was logged as a decision, with both duplicates as candidates.
  const amb = lastPayload<AmbiguousPayload>(bus, "editor.map.overlap.ambiguous");
  assert.equal(amb.chosen, chosen);
  assert.ok(amb.candidates.includes(dupA.id) && amb.candidates.includes(dupB.id));

  // And the chosen id is what crossed the bus.
  const emitted = lastPayload<EmitBusPayload>(bus, "editor.select.emit.bus");
  assert.ok(emitted.busEvent.nodeId === chosen);
  assert.equal(h.graph.heardFromEditor().at(-1)?.nodeId, chosen);
});

test("silent coalesce: BOTH duplicate ids remain individually addressable (getById + recv reveal for each)", async () => {
  const { nodes, dupA, dupB } = duplicateSpanNodes();
  const h = await openTestCell("clean.py", { schemaNodes: nodes });
  const bus = h.cell.probe;

  // Probe: the index kept both entries (nodeCount counts ids, not spans).
  const built = lastPayload<BuildIndexPayload>(bus, "editor.map.build.index");
  assert.equal(built.nodeCount, 2, "index build coalesced the duplicate-span nodes");
  assert.equal(built.intervalCount, 2);

  // getById works for EACH id, with the identical span.
  const idxA = h.cell.index().getById(dupA.id);
  const idxB = h.cell.index().getById(dupB.id);
  assert.ok(idxA, "dupA vanished from the index");
  assert.ok(idxB, "dupB vanished from the index");
  assert.deepEqual(idxA!.monacoRange, idxB!.monacoRange);
  assert.equal(idxA!.node.id, dupA.id);
  assert.equal(idxB!.node.id, dupB.id);

  // Recv of EITHER id reveals — neither duplicate is a dead address.
  h.graph.select(dupA.id);
  const revealA = lastPayload<RevealPayload>(bus, "editor.select.recv.reveal");
  assert.equal(revealA.nodeId, dupA.id);
  assert.equal(revealA.highlightApplied, true);
  assert.deepEqual(revealA.monacoRange, idxA!.monacoRange);

  h.graph.select(dupB.id);
  const revealB = lastPayload<RevealPayload>(bus, "editor.select.recv.reveal");
  assert.equal(revealB.nodeId, dupB.id);
  assert.equal(revealB.highlightApplied, true);
  assert.deepEqual(revealB.monacoRange, idxB!.monacoRange);

  assertNeverFired(bus, "editor.select.recv.miss", "both duplicate ids must stay resolvable");
});
