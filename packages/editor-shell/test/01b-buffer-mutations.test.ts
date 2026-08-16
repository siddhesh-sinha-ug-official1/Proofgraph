/**
 * SPEC §9.1 — Buffer byte-fidelity. Failure class: SILENT REWRITE (part 2 of
 * 2; SUB200 restructure split from 01-buffer.test.ts, assertions unchanged):
 * programmatic edits, the forbidden unattributed mutation, and undo/redo
 * byte-consistency. Fixture layout documented in 01-buffer.test.ts.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { assertNeverFired, lastPayload, payloadsOf } from "./stub/assert-probes.js";
import { FIX, type ClassifyPayload, type RoundtripPayload } from "./helpers/buffer-payloads.js";

test("silent rewrite: (b) applyProgrammaticEdit is classified 'programmatic' — an explicit API cause, no silent alarm, roundtrip stays equal", async () => {
  const h = await openTestCell(FIX);
  const bus = h.cell.probe;

  h.adapter.applyProgrammaticEdit([{ rangeOffset: 0, rangeLength: 0, text: "# header\n" }]);

  const cls = lastPayload<ClassifyPayload>(bus, "editor.buffer.mutation.classify");
  assert.equal(cls.classification, "programmatic");
  assert.match(cls.cause, /applyProgrammaticEdit/);
  assertNeverFired(bus, "editor.buffer.mutation.silent", "a programmatic edit has a traceable API cause");

  assert.equal(h.cell.buffer.roundtripCheck(), true);
  const rt = lastPayload<RoundtripPayload>(bus, "editor.buffer.roundtrip.check");
  assert.equal(rt.equalBytes, true);
  assert.equal(rt.firstDivergenceOffset, null);
  assertNeverFired(bus, "editor.buffer.roundtrip.fail");

  await h.cell.dispose();
});

test("silent rewrite: (c) an unattributed mutation fires classify 'silent' + mutation.silent, and roundtripCheck() reports roundtrip.fail with the first divergence offset", async () => {
  const h = await openTestCell(FIX);
  const bus = h.cell.probe;

  // The forbidden case: the editor strips L1's trailing whitespace on its own
  // (utf-16 offsets 13..14 are the two trailing spaces after "def spaced():").
  h.adapter.simulateSilentRewrite([{ rangeOffset: 13, rangeLength: 2, text: "" }]);

  const cls = lastPayload<ClassifyPayload>(bus, "editor.buffer.mutation.classify");
  assert.equal(cls.classification, "silent");
  assert.match(cls.cause, /silent/);

  const alarms = payloadsOf(bus, "editor.buffer.mutation.silent");
  assert.equal(alarms.length, 1, "exactly one silent-mutation alarm");
  assert.equal(alarms[0].whitespaceChanged, true, "only whitespace was rewritten");
  assert.equal(alarms[0].eolChanged, false);
  assert.equal(alarms[0].encodingChanged, false);
  assert.equal(h.cell.buffer.silentMutationCount(), 1);

  // The roundtrip check exposes the divergence: BOM(3) + offset 13 = byte 16.
  assert.equal(h.cell.buffer.roundtripCheck(), false);
  const rt = lastPayload<RoundtripPayload>(bus, "editor.buffer.roundtrip.check");
  assert.equal(rt.equalBytes, false);
  assert.equal(rt.firstDivergenceOffset, 16);
  const fail = lastPayload(bus, "editor.buffer.roundtrip.fail");
  assert.equal(fail.firstDivergenceOffset, 16);

  await h.cell.dispose();
});

test("silent rewrite: (d) undo/redo emit editor.buffer.undoRedo and leave the model byte-consistent (roundtrip equal; undo returns to the exact source sha)", async () => {
  const h = await openTestCell(FIX);
  const bus = h.cell.probe;

  h.adapter.simulateUserEdit([{ rangeOffset: 62, rangeLength: 0, text: "y = 2\n" }]);
  h.cell.buffer.roundtripCheck();
  const shaAfterEdit = lastPayload<RoundtripPayload>(bus, "editor.buffer.roundtrip.check").modelSha;
  assert.notEqual(shaAfterEdit, h.meta.sha256);

  // Undo: back to the pre-edit state, byte-for-byte.
  const u = h.adapter.simulateUndo();
  assert.ok(u, "undo stack had a state to restore");
  h.cell.buffer.noteUndoRedo("undo", u!.versionIdBefore, u!.versionIdAfter);
  assert.deepEqual(lastPayload(bus, "editor.buffer.undoRedo"), {
    op: "undo",
    versionIdBefore: 2,
    versionIdAfter: 3,
  });
  assert.equal(h.cell.buffer.roundtripCheck(), true);
  const rtUndo = lastPayload<RoundtripPayload>(bus, "editor.buffer.roundtrip.check");
  assert.equal(rtUndo.equalBytes, true);
  assert.equal(rtUndo.modelSha, h.meta.sha256, "undo restored the exact source bytes");

  // Redo: forward to the post-edit state, byte-for-byte.
  const r = h.adapter.simulateRedo();
  assert.ok(r, "redo stack had a state to restore");
  h.cell.buffer.noteUndoRedo("redo", r!.versionIdBefore, r!.versionIdAfter);
  assert.deepEqual(lastPayload(bus, "editor.buffer.undoRedo"), {
    op: "redo",
    versionIdBefore: 3,
    versionIdAfter: 4,
  });
  assert.equal(h.cell.buffer.roundtripCheck(), true);
  const rtRedo = lastPayload<RoundtripPayload>(bus, "editor.buffer.roundtrip.check");
  assert.equal(rtRedo.equalBytes, true);
  assert.equal(rtRedo.modelSha, shaAfterEdit, "redo restored the exact post-edit bytes");

  // The undo/redo whole-buffer replacements are FORCED user changes, never silent.
  const forced = payloadsOf(bus, "editor.buffer.change").filter((c) => c.forced === true);
  assert.equal(forced.length, 2, "undo + redo each surfaced as a forced change");
  const classifications = payloadsOf<ClassifyPayload>(bus, "editor.buffer.mutation.classify")
    .map((c) => c.classification);
  assert.deepEqual(classifications, ["user", "user", "user"], "edit, undo, redo — all user-caused");
  assertNeverFired(bus, "editor.buffer.mutation.silent", "undo/redo are user-caused, never silent");
  assertNeverFired(bus, "editor.buffer.roundtrip.fail");

  await h.cell.dispose();
});
