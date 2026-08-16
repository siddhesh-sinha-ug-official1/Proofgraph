/**
 * Regression pins for the adversarial-review findings — SPAN-MATH / BUFFER
 * LENS (part 2 of 3; SUB200 restructure split from
 * 20-review-regressions.test.ts, assertions unchanged).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createEditorShellCell } from "../src/cell.js";
import { SpanIndex } from "../src/map/span-index.js";
import { ProbeBus } from "../src/probe/probe-bus.js";
import { LocalSelectionBus } from "../src/seams/bus.js";
import { openTestCell } from "./stub/harness.js";
import { syntheticNode } from "./helpers/synthetic-node.js";
import { StubEditorAdapter } from "./stub/stub-adapter.js";
import { StubGraphPane } from "./stub/stub-graph-pane.js";
import { StubLanguageServer } from "./stub/stub-server.js";
import { createStubCapability } from "./stub/stub-capability.js";
import { assertNeverFired, eventsOf, lastPayload } from "./stub/assert-probes.js";

test("silent rewrite (latin1/C1): bytes 0x80-0x9F survive open byte-exactly — no windows-1252 remap", () => {
  // 'v', 0x92 (cp1252 right-quote trap), 0x80, 'v', LF — invalid utf-8 ⇒ latin1.
  const bytes = new Uint8Array([0x76, 0x92, 0x80, 0x76, 0x0a]);
  const adapter = new StubEditorAdapter();
  const bus = new LocalSelectionBus();
  new StubGraphPane(bus);
  const server = new StubLanguageServer();
  const { capability } = createStubCapability({ tier: "CT", server, languageId: "python" });
  const cell = createEditorShellCell({
    adapter,
    capability,
    bus,
    schemaNodes: [],
    file: { uri: "file:///fixtures/latin1.py", bytes, languageId: "python", lang: "python" },
    wallClock: () => null,
  });
  // Buffer path only (no need to open the full cell for this pin):
  cell.buffer.open({ uri: "file:///fixtures/latin1.py", bytes, languageId: "python", readOnly: false });
  const check = lastPayload<{ equalBytes: boolean; comparedAgainst: string }>(
    cell.probe,
    "editor.buffer.roundtrip.check",
  );
  assert.equal(check.equalBytes, true, "true ISO-8859-1 must round-trip C1 bytes exactly");
  assert.equal(check.comparedAgainst, "source-bytes", "at open the reference is the RAW source bytes");
  assert.equal(cell.buffer.state().byteLength, bytes.length);
  assertNeverFired(cell.probe, "editor.buffer.mutation.silent");
});

test("stale coordinate (encoding-aware index): latin1 file spans map with 1-byte-per-char math", () => {
  const probe = new ProbeBus({ wallClock: () => null });
  // latin1 text decoded from bytes: line 1 '# café' where é was ONE byte.
  const modelText = "# café\nx = 1\n";
  const idx = new SpanIndex({
    probe,
    fileUri: "file:///fixtures/latin1.py",
    modelText,
    bomBytes: 0,
    encoding: "latin1",
    nodes: [
      syntheticNode({
        id: "n_latin1_x",
        span: { file: "file:///fixtures/latin1.py", byteStart: 7, byteEnd: 12 },
      }),
    ],
    builtAtVersion: 1,
  });
  // In latin1, 'x' is file byte 7 = line 2 column 1 (utf-8 math would say
  // line 1 — the review's exact repro).
  assert.deepEqual(idx.byteToPos(7), { line: 2, column: 1 });
  assert.equal(idx.posToByte({ line: 2, column: 6 }), 12);
  assert.deepEqual(idx.getById("n_latin1_x")!.monacoRange, {
    startLine: 2, startColumn: 1, endLine: 2, endColumn: 6,
  });
  assertNeverFired(probe, "editor.map.encoding.mismatch", "latin1 math must be self-consistent");
});

test("wrong-span squiggle: utf-8 LSP characters clamp to line length per the LSP spec", () => {
  const probe = new ProbeBus({ wallClock: () => null });
  const idx = new SpanIndex({
    probe,
    fileUri: "f",
    modelText: "abc\ndefg\n",
    bomBytes: 0,
    encoding: "utf-8",
    nodes: [],
    builtAtVersion: 1,
  });
  // character 6 on a 3-byte line: must clamp to end-of-line (byte 3), and
  // agree with the utf-16 branch for identical input.
  assert.equal(idx.lspPositionToByte(0, 6, "utf-8"), 3);
  assert.equal(idx.lspPositionToByte(0, 6, "utf-16"), 3);
  // line index beyond EOF clamps to the last line.
  assert.equal(idx.lspPositionToByte(99, 0, "utf-8"), idx.lspPositionToByte(2, 0, "utf-8"));
});

test("silent coalesce: a schema span past EOF is clamped LOUDLY via editor.map.span.clamped", () => {
  const probe = new ProbeBus({ wallClock: () => null });
  const idx = new SpanIndex({
    probe,
    fileUri: "f",
    modelText: "abc\ndefg\n",
    bomBytes: 0,
    encoding: "utf-8",
    nodes: [syntheticNode({ id: "n_eof", span: { file: "f", byteStart: 2, byteEnd: 10_000 } })],
    builtAtVersion: 1,
  });
  const clamped = lastPayload<{ nodeId: string; fileByteLength: number }>(
    probe,
    "editor.map.span.clamped",
  );
  assert.equal(clamped.nodeId, "n_eof");
  assert.equal(clamped.fileByteLength, 9);
  assert.equal(idx.getById("n_eof")!.span.byteEnd, 9, "index binds the CLAMPED span");
});

test("silent rewrite (false alarm): an honest undo AFTER a silent rewrite raises no second alarm", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  h.adapter.simulateSilentRewrite([{ rangeOffset: 0, rangeLength: 3, text: "" }]);
  assert.equal(eventsOf(bus, "editor.buffer.mutation.silent").length, 1);
  h.adapter.simulateUndo(); // honest full-restore reported as a user change
  assert.equal(
    eventsOf(bus, "editor.buffer.mutation.silent").length,
    1,
    "the honest undo must NOT be flagged as a hidden extra mutation",
  );
  await h.cell.dispose();
});
