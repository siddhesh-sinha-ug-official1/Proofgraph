/**
 * SPEC §9.2 — failure class: cheap-connector-that-dies (part 1 of 2; SUB200
 * restructure split — the multibyte/utf-16/fix-clears cases live in
 * 02b-diagnostics-multibyte.test.ts; assertions unchanged).
 *
 * The diagnostics span map is where a cheap LSP connector silently dies: the
 * squiggle lands one column off (utf-8 byte offsets vs utf-16 columns), or the
 * marker survives after the error is fixed. Every assertion here reads probe
 * output: editor.lsp.in.diagnostics → editor.diag.map.span → marker.set, with
 * the mismatch probes required to stay silent.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { assertFired, assertNeverFired, lastPayload, payloadsOf } from "./stub/assert-probes.js";
import type { MapSpanPayload, MarkerSetPayload } from "./helpers/diag-payloads.js";

test("cheap-connector-that-dies: error+warning squiggles map byte-exactly with severity/tag/related/quickfix (type-error.py, utf-8)", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;

  // Diagnostics actually arrived over the wire for THIS document.
  assertFired(bus, "editor.lsp.in.diagnostics");
  const inDiag = lastPayload<{ uri: string; count: number; diagnostics: { severity: number | null }[] }>(
    bus,
    "editor.lsp.in.diagnostics",
  );
  assert.equal(inDiag.uri, h.meta.uri);
  assert.equal(inDiag.count, 2, "expected exactly error + warning in the didOpen batch");
  assert.deepEqual(
    inDiag.diagnostics.map((d) => d.severity).sort(),
    [1, 2],
    "batch must carry one error (1) and one warning (2)",
  );

  // ── The ERROR maps to EXACTLY the fixture's expected byte span. ──
  const spans = payloadsOf<MapSpanPayload>(bus, "editor.diag.map.span");
  assert.equal(spans.length, 2, "one map.span probe per diagnostic");
  const err = spans.find((s) => s.byteStart === h.meta.expected.errorByteStart);
  assert.ok(
    err,
    `no diag span starts at expected byte ${h.meta.expected.errorByteStart}; saw ${JSON.stringify(spans.map((s) => [s.byteStart, s.byteEnd]))}`,
  );
  assert.equal(err.byteEnd, h.meta.expected.errorByteEnd, "error byteEnd is off — squiggle length wrong");
  // Independent literal check (not derived from the code under test):
  // "undefined_name" sits on 1-based line 11, columns 16..30.
  assert.deepEqual(err.monacoRange, { startLine: 11, startColumn: 16, endLine: 11, endColumn: 30 });

  // ── The WARNING (unused_var) maps byte-exactly too. ──
  const warn = spans.find((s) => s.byteStart === h.meta.expected.warnByteStart);
  assert.ok(
    warn,
    `no diag span starts at expected warn byte ${h.meta.expected.warnByteStart}; saw ${JSON.stringify(spans.map((s) => [s.byteStart, s.byteEnd]))}`,
  );
  assert.equal(warn.byteEnd, h.meta.expected.warnByteEnd);
  // "unused_var" sits on 1-based line 10, columns 5..15.
  assert.deepEqual(warn.monacoRange, { startLine: 10, startColumn: 5, endLine: 10, endColumn: 15 });

  // The self-checking probes must stay silent — no off-by-N anywhere.
  assertNeverFired(bus, "editor.diag.map.mismatch");
  assertNeverFired(bus, "editor.map.encoding.mismatch");

  // ── marker.set placed the squiggles exactly on the mapped ranges. ──
  const markers = payloadsOf<MarkerSetPayload>(bus, "editor.diag.marker.set");
  const errMarker = markers.find((m) => m.diagId === err.diagId);
  const warnMarker = markers.find((m) => m.diagId === warn.diagId);
  assert.ok(errMarker, "no marker.set for the error diagnostic");
  assert.ok(warnMarker, "no marker.set for the warning diagnostic");
  assert.deepEqual(errMarker.monacoRange, err.monacoRange, "error squiggle not where the span map put it");
  assert.deepEqual(warnMarker.monacoRange, warn.monacoRange, "warning squiggle not where the span map put it");
  assert.equal(errMarker.severity, "error");
  assert.equal(warnMarker.severity, "warning");
  assert.equal(errMarker.message, '"undefined_name" is not defined');
  assert.equal(warnMarker.message, '"unused_var" is assigned but never used');
  // Round-trip the painted marker range back to bytes through the live index:
  // this is the byte-exactness of what the USER sees, not just the intermediate map.
  const idx = h.cell.index();
  assert.equal(
    idx.posToByte({ line: errMarker.monacoRange.startLine, column: errMarker.monacoRange.startColumn }),
    h.meta.expected.errorByteStart,
    "painted error squiggle start is byte-shifted",
  );
  assert.equal(
    idx.posToByte({ line: errMarker.monacoRange.endLine, column: errMarker.monacoRange.endColumn }),
    h.meta.expected.errorByteEnd,
    "painted error squiggle end is byte-shifted",
  );
  // Additional (probe assertions above are primary): the adapter really holds both markers.
  const applied = h.adapter.decorationsByKind.get("marker") ?? [];
  assert.equal(applied.length, 2);
  assert.ok(applied.some((d) => d.key === err.diagId));

  // ── severity.map: warning contributes amber, error contributes red. ──
  const sevs = payloadsOf<{ diagId: string; lspSeverity: number; markerSeverity: string; fillContribution: string }>(
    bus,
    "editor.diag.severity.map",
  );
  const errSev = sevs.find((s) => s.diagId === err.diagId);
  const warnSev = sevs.find((s) => s.diagId === warn.diagId);
  assert.ok(errSev && warnSev, "severity.map must fire per diagnostic");
  assert.deepEqual(
    { lspSeverity: warnSev.lspSeverity, markerSeverity: warnSev.markerSeverity, fillContribution: warnSev.fillContribution },
    { lspSeverity: 2, markerSeverity: "warning", fillContribution: "amber" },
  );
  assert.equal(errSev.fillContribution, "red");

  // ── diag.tag: the warning is tagged "unnecessary" (LSP tag 1). ──
  const tags = payloadsOf<{ diagId: string; tags: string[] }>(bus, "editor.diag.tag");
  const warnTag = tags.find((t) => t.diagId === warn.diagId);
  assert.ok(warnTag, "no diag.tag probe for the unused_var warning");
  assert.deepEqual(warnTag.tags, ["unnecessary"]);
  assert.ok(!tags.some((t) => t.diagId === err.diagId), "error must not carry tags");

  // ── diag.related fired for the error (points at `def broken`). ──
  assertFired(bus, "editor.diag.related");
  const related = payloadsOf<{ diagId: string; relatedInformation: { uri: string; message: string }[] }>(
    bus,
    "editor.diag.related",
  );
  const errRelated = related.find((r) => r.diagId === err.diagId);
  assert.ok(errRelated, "relatedInformation probe missing for the error");
  assert.equal(errRelated.relatedInformation.length, 1);
  assert.equal(errRelated.relatedInformation[0].uri, h.meta.uri);
  assert.equal(errRelated.relatedInformation[0].message, "in function broken");

  // ── codeAction.available: quickfix on the error, none on the warning. ──
  const actions = payloadsOf<{ diagId: string; hasQuickFix: boolean }>(bus, "editor.diag.codeAction.available");
  assert.equal(actions.find((a) => a.diagId === err.diagId)?.hasQuickFix, true, "error must advertise a quickfix");
  assert.equal(actions.find((a) => a.diagId === warn.diagId)?.hasQuickFix, false);

  await h.cell.dispose();
});
