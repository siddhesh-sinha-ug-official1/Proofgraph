/**
 * SPEC §9.1 — Buffer byte-fidelity. Failure class: SILENT REWRITE (part 1 of
 * 2; SUB200 restructure split — the silent/undo-redo mutation cases live in
 * 01b-buffer-mutations.test.ts; assertions unchanged).
 *
 * The editor must NEVER rewrite the buffer without a user/API cause: no
 * whitespace normalization, no EOL flip, no re-encoding, no BOM strip. Every
 * assertion below reads probe output (roundtrip.check, mutation.classify,
 * mutation.silent, undoRedo, size.cap, encoding/eol/bom decisions).
 *
 * Fixture: whitespace.py — UTF-8 BOM (3 bytes), trailing whitespace, tab/space
 * mix, one CRLF line among LF lines. Model text (BOM stripped, utf-16 offsets):
 *   L1 "def spaced():␠␠"           [0..15)   \n@15
 *   L2 "    return 1␠␠"            [16..30)  \r@30 \n@31   ← the CRLF line
 *   L3 "⇥# tab-indented comment"   [32..55)  \n@55
 *   L4 "x = 1"                     [56..61)  \n@61
 *   → 62 utf-16 units; 65 bytes with BOM (all ASCII after the BOM).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { assertNeverFired, eventsOf, lastPayload } from "./stub/assert-probes.js";
import { FIX, type ClassifyPayload, type RoundtripPayload } from "./helpers/buffer-payloads.js";

test("silent rewrite: open is byte-exact (BOM+CRLF+tabs+trailing ws preserved, sha == meta) and NO silent alarm across open + idle + programmatic decoration changes", async () => {
  const h = await openTestCell(FIX);
  const bus = h.cell.probe;

  // The exact bytes we handed in were recorded — the reference for everything.
  const input = lastPayload(bus, "editor.buffer.open.input");
  assert.equal(input.byteLength, 65);
  assert.equal(input.sha256, h.meta.sha256);
  assert.equal(input.bomPresent, true);
  assert.equal(input.eol, "LF");
  assert.equal(input.eolMixed, true); // one CRLF line among LF lines — preserved, not unified

  // C1 byte-exact fixpoint at open: model re-encodes to the source bytes.
  const rt0 = lastPayload<RoundtripPayload>(bus, "editor.buffer.roundtrip.check");
  assert.equal(rt0.equalBytes, true);
  assert.equal(rt0.firstDivergenceOffset, null);
  assert.equal(rt0.whitespaceDelta, 0);
  assert.equal(rt0.sourceSha, h.meta.sha256);
  assert.equal(rt0.modelSha, h.meta.sha256); // whitespace/EOL/encoding/BOM all intact
  assertNeverFired(bus, "editor.buffer.mutation.silent", "open must not rewrite bytes");
  assertNeverFired(bus, "editor.buffer.roundtrip.fail", "open must roundtrip byte-exactly");

  // Idle + PROGRAMMATIC DECORATION changes: decorations must never touch the buffer.
  assert.equal(eventsOf(bus, "editor.buffer.change").length, 0, "no buffer change at open/idle");
  h.cell.render.paint(
    "highlight",
    [{ key: "probe-test-hl", range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 4 }, style: "pg-test" }],
    "decoration",
    null,
  );
  assert.equal(
    eventsOf(bus, "editor.buffer.change").length,
    0,
    "a decoration paint fired a buffer change — decorations must not mutate the model",
  );
  assert.equal(h.cell.buffer.roundtripCheck(), true);
  const rt1 = lastPayload<RoundtripPayload>(bus, "editor.buffer.roundtrip.check");
  assert.equal(rt1.equalBytes, true);
  assert.equal(rt1.modelSha, h.meta.sha256);
  assertNeverFired(bus, "editor.buffer.mutation.silent", "decoration changes are not buffer mutations");
  assert.equal(h.cell.buffer.silentMutationCount(), 0);

  await h.cell.dispose();
});

test("silent rewrite: encoding/EOL/BOM decision probes at open carry byte-preserving payloads (utf-8 chosen, bomPresent:true, eol normalized:false) and the size cap logs action 'open'", async () => {
  const h = await openTestCell(FIX);
  const bus = h.cell.probe;

  // (f) encoding decision: strict utf-8 won; rejected branches are logged.
  const enc = lastPayload(bus, "editor.buffer.encoding.decision");
  assert.equal(enc.chosen, "utf-8");
  assert.equal(enc.reason, "bytes decode as strict utf-8");
  assert.deepEqual(enc.candidates, ["utf-8", "utf-16le", "utf-16be", "latin1"]);
  assert.equal((enc.notChosen as unknown[]).length, 3);

  // (f) BOM: present, utf-8 kind, stripped from MODEL TEXT only (bytes preserved
  // — proven by the roundtrip sha matching meta in the sibling test).
  const bom = lastPayload(bus, "editor.buffer.bom.detect");
  assert.equal(bom.bomPresent, true);
  assert.equal(bom.bomKind, "utf-8");
  assert.equal(bom.stripped, true);

  // (f) EOL decision: source EOL preserved exactly — normalized:false.
  const eol = lastPayload(bus, "editor.buffer.eol.decision");
  assert.equal(eol.sourceEol, "LF");
  assert.equal(eol.modelEol, "LF");
  assert.equal(eol.normalized, false);

  // The model actually built agrees with the input (no flip at construction).
  const model = lastPayload(bus, "editor.buffer.open.model");
  assert.equal(model.versionId, 1);
  assert.equal(model.lineCount, 5);
  assert.equal(model.eol, "LF");
  assert.equal(model.detectedEncoding, "utf-8");

  // (e) No silent caps: the size bound is a LOGGED decision with action "open".
  const cap = lastPayload(bus, "editor.buffer.size.cap");
  assert.equal(cap.action, "open");
  assert.equal(cap.byteLength, 65);
  assert.equal(cap.cap, 20 * 1024 * 1024);

  await h.cell.dispose();
});

test("silent rewrite: (a) a user edit is classified 'user', updates the model, and roundtrip stays byte-equal vs source-plus-edit", async () => {
  const h = await openTestCell(FIX);
  const bus = h.cell.probe;

  // Append a new line at the very end of the model text (utf-16 offset 62).
  h.adapter.simulateUserEdit([{ rangeOffset: 62, rangeLength: 0, text: "y = 2\n" }]);

  const chg = lastPayload(bus, "editor.buffer.change");
  assert.equal(chg.versionId, 2);
  const cls = lastPayload<ClassifyPayload>(bus, "editor.buffer.mutation.classify");
  assert.equal(cls.classification, "user");
  assert.equal(cls.versionId, 2);

  // Roundtrip vs SOURCE-PLUS-EDIT: still byte-equal, but no longer the original sha.
  assert.equal(h.cell.buffer.roundtripCheck(), true);
  const rt = lastPayload<RoundtripPayload>(bus, "editor.buffer.roundtrip.check");
  assert.equal(rt.equalBytes, true);
  assert.equal(rt.firstDivergenceOffset, null);
  assert.equal(rt.modelSha, rt.sourceSha, "model bytes == source-plus-edit bytes");
  assert.notEqual(rt.modelSha, h.meta.sha256, "the edit legitimately changed the bytes");
  assertNeverFired(bus, "editor.buffer.mutation.silent", "a user edit is never a silent rewrite");
  assertNeverFired(bus, "editor.buffer.roundtrip.fail");
  assert.ok(h.adapter.getText().endsWith("y = 2\n"), "model actually carries the edit");

  await h.cell.dispose();
});
