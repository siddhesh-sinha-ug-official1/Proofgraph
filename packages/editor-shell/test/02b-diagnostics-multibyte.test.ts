/**
 * SPEC §9.2 — failure class: cheap-connector-that-dies (part 2 of 2; SUB200
 * restructure split from 02-diagnostics-span.test.ts, assertions unchanged):
 * multibyte spans at BOTH negotiated encodings + fix-clears-the-squiggle.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { assertFired, assertNeverFired, eventsOf, lastPayload, payloadsOf } from "./stub/assert-probes.js";
import type { MapSpanPayload, MarkerSetPayload } from "./helpers/diag-payloads.js";

test("cheap-connector-that-dies: multibyte.py error span is byte-exact past 🚀→é with zero mismatch probes (utf-8)", async () => {
  const h = await openTestCell("multibyte.py");
  const bus = h.cell.probe;

  assert.equal(
    lastPayload<{ accepted: string }>(bus, "editor.conn.positionEncoding.negotiate").accepted,
    "utf-8",
    "this run must negotiate utf-8",
  );
  assertFired(bus, "editor.lsp.in.diagnostics");

  const spans = payloadsOf<MapSpanPayload>(bus, "editor.diag.map.span");
  assert.equal(spans.length, 1);
  const err = spans[0];
  assert.equal(err.byteStart, h.meta.expected.errorByteStart, `off-by-${err.byteStart - h.meta.expected.errorByteStart} bytes at span start (utf-8/utf-16 desync)`);
  assert.equal(err.byteEnd, h.meta.expected.errorByteEnd, `off-by-${err.byteEnd - h.meta.expected.errorByteEnd} bytes at span end`);
  assert.equal(err.lspRange.start.line, h.meta.expected.errorLine0);
  // In utf-8 the wire character is a BYTE offset: 22 (multibyte prefix inflates bytes past utf-16 units).
  assert.equal(err.lspRange.start.character, 22, "server should count utf-8 bytes on the wire in this mode");

  // The classic off-by-N hunt: both self-check probes must stay silent.
  assertNeverFired(bus, "editor.diag.map.mismatch");
  assertNeverFired(bus, "editor.map.encoding.mismatch");

  // Squiggle placement: marker matches the map, and round-trips to the exact bytes.
  const marker = payloadsOf<MarkerSetPayload>(bus, "editor.diag.marker.set").find((m) => m.diagId === err.diagId);
  assert.ok(marker, "no marker.set for the multibyte error");
  assert.deepEqual(marker.monacoRange, err.monacoRange);
  // 1-based: line 3, utf-16 columns 18..32 (prefix `    s = "🚀→é" + ` is 17 utf-16 units).
  assert.deepEqual(marker.monacoRange, { startLine: 3, startColumn: 18, endLine: 3, endColumn: 32 });
  const idx = h.cell.index();
  assert.equal(idx.posToByte({ line: marker.monacoRange.startLine, column: marker.monacoRange.startColumn }), h.meta.expected.errorByteStart);
  assert.equal(idx.posToByte({ line: marker.monacoRange.endLine, column: marker.monacoRange.endColumn }), h.meta.expected.errorByteEnd);

  await h.cell.dispose();
});

test("cheap-connector-that-dies: multibyte.py span STILL byte-exact when server forces utf-16 negotiation", async () => {
  const h = await openTestCell("multibyte.py", { serverCfg: { positionEncodingMode: "force-utf16" } });
  const bus = h.cell.probe;

  // Negotiation records utf-16 (we asked for utf-8; the server refused).
  const nego = lastPayload<{ requested: string; accepted: string; winner: string }>(
    bus,
    "editor.conn.positionEncoding.negotiate",
  );
  assert.equal(nego.requested, "utf-8");
  assert.equal(nego.accepted, "utf-16");
  assert.equal(nego.winner, "utf-16");

  const spans = payloadsOf<MapSpanPayload>(bus, "editor.diag.map.span");
  assert.equal(spans.length, 1);
  const err = spans[0];
  assert.equal(err.positionEncoding, "utf-16", "mapping must use the NEGOTIATED encoding");
  assert.equal(err.byteStart, h.meta.expected.errorByteStart, `off-by-${err.byteStart - h.meta.expected.errorByteStart} bytes at span start under utf-16`);
  assert.equal(err.byteEnd, h.meta.expected.errorByteEnd, `off-by-${err.byteEnd - h.meta.expected.errorByteEnd} bytes at span end under utf-16`);
  // Wire character is now utf-16 code units (17) — genuinely different from the
  // utf-8 run's 22, so byte agreement proves the conversion did real work.
  assert.equal(err.lspRange.start.character, h.meta.expected.errorCharUtf16);

  assertNeverFired(bus, "editor.diag.map.mismatch");
  assertNeverFired(bus, "editor.map.encoding.mismatch");

  // Same squiggle, same bytes, regardless of wire encoding.
  const marker = payloadsOf<MarkerSetPayload>(bus, "editor.diag.marker.set").find((m) => m.diagId === err.diagId);
  assert.ok(marker);
  assert.deepEqual(marker.monacoRange, { startLine: 3, startColumn: 18, endLine: 3, endColumn: 32 });

  await h.cell.dispose();
});

test("cheap-connector-that-dies: fixing the error clears diagnostics and empties the marker set (multibyte.py)", async () => {
  const h = await openTestCell("multibyte.py");
  const bus = h.cell.probe;
  assert.equal(payloadsOf<MapSpanPayload>(bus, "editor.diag.map.span").length, 1, "precondition: one live squiggle");

  // Replace the undefined identifier with a defined expression (utf-16 offset
  // via indexOf — the line has 🚀→é before it, so this is NOT the byte offset).
  const text = h.adapter.getText();
  const at = text.indexOf("undefined_name");
  assert.ok(at >= 0);
  h.adapter.simulateUserEdit([{ rangeOffset: at, rangeLength: "undefined_name".length, text: '"fixed"' }]);

  // The server re-checked and published an EMPTY batch which was applied.
  const inDiag = lastPayload<{ count: number; version: number | null }>(bus, "editor.lsp.in.diagnostics");
  assert.equal(inDiag.count, 0, "post-fix batch must be empty");
  const lastGuard = lastPayload<{ action: string; diagVersion: number | null; modelVersion: number }>(
    bus,
    "editor.diag.version.guard",
  );
  assert.equal(lastGuard.action, "apply");
  assert.equal(lastGuard.diagVersion, 2);

  // editor.diag.clear fired for the fix and reported the one removed record.
  const clears = payloadsOf<{ clearedCount: number }>(bus, "editor.diag.clear");
  assert.equal(clears.length, 2, "clear at open + clear on the post-fix apply");
  assert.equal(clears[clears.length - 1].clearedCount, 1, "the fix must clear exactly the one stale record");

  // No marker was set for the empty batch (still only the one from open) and
  // the final marker paint removed the squiggle.
  assert.equal(eventsOf(bus, "editor.diag.marker.set").length, 1, "stale squiggle: a marker survived the fix");
  const markerDeltas = payloadsOf<{ added: number; removed: number; kept: number; kind: string }>(
    bus,
    "editor.render.decoration.delta",
  ).filter((d) => d.kind === "marker");
  assert.deepEqual(markerDeltas[markerDeltas.length - 1], { added: 0, removed: 1, kept: 0, kind: "marker" });

  // Additional (probe deltas above are primary): the adapter's marker set is empty.
  assert.deepEqual(h.adapter.decorationsByKind.get("marker"), []);

  await h.cell.dispose();
});
