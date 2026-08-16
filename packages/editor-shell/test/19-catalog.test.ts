/**
 * §9.19 — Probe-catalog completeness (failure class: UNDOCUMENTED LEAD).
 * Drives a deliberately WIDE scenario across several cells, unions every
 * probeId that actually fired, and asserts each one is documented in
 * PROBE_CATALOG — a lead that fires but isn't cataloged fails. (The catalog
 * invariants + uncataloged-emit tests live in 19b-catalog-invariants.test.ts;
 * SUB200 restructure, assertions unchanged.)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { PROBE_CATALOG } from "../src/probe/catalog.js";
import { ProbeBus } from "../src/probe/probe-bus.js";
import { runImportGate } from "../src/gate/import-gate.js";
import { openTestCell, nodeByName } from "./stub/harness.js";
import type { StubServerConfig } from "./stub/stub-server.js";
import { assertFired, lastPayload, payloadsOf } from "./stub/assert-probes.js";

const settle = (): Promise<void> => new Promise((r) => setImmediate(r));

test("undocumented lead: WIDE scenario — every probeId that fires is documented in PROBE_CATALOG", async (t) => {
  const firedUnion = new Set<string>();

  // ── Cell A: type-error.py with misbehavior switches + semanticTokens on ──
  const a = await openTestCell("type-error.py", {
    serverCfg: {
      advertise: { semanticTokens: true } as StubServerConfig["advertise"],
      behaviors: {
        orphanResponseAfterInit: true,
        progressOnOpen: true,
        requestConfiguration: true,
      } as StubServerConfig["behaviors"],
    },
  });
  const busA = a.cell.probe;

  // Misbehavior switches all left probe trails (never swallowed).
  assertFired(busA, "editor.lsp.correlate.orphanResponse");
  assertFired(busA, "editor.lsp.in.progress", 2); // begin + end
  assertFired(busA, "editor.lsp.in.logMessage");
  assertFired(busA, "editor.lsp.in.configuration");

  const add = nodeByName(a.nodes, "add");
  const double = nodeByName(a.nodes, "double");
  const addRange = a.cell.index().getById(add.id)!.monacoRange;
  const doubleRange = a.cell.index().getById(double.id)!.monacoRange;

  // Cursor moves: plain, multi-cursor, and a miss between spans.
  a.adapter.moveCursor({ line: addRange.startLine, column: addRange.startColumn + 4 });
  assert.equal(
    lastPayload<{ busEvent: { nodeId: string } }>(busA, "editor.select.emit.bus").busEvent.nodeId,
    add.id,
  );
  a.adapter.moveCursor(
    { line: addRange.startLine, column: addRange.startColumn + 4 },
    [{ start: { line: doubleRange.startLine, column: doubleRange.startColumn + 4 },
       end: { line: doubleRange.startLine, column: doubleRange.startColumn + 4 } }],
  );
  const multi = lastPayload<{ selectionCount: number; policy: string }>(busA, "editor.select.emit.multi");
  assert.equal(multi.selectionCount, 2);
  assert.equal(multi.policy, "primary-caret");
  a.adapter.moveCursor({ line: 4, column: 1 }); // empty line between add and double
  assert.equal(lastPayload(busA, "editor.select.emit.miss").reason, "noNodeAtCaret");

  // Graph-origin select + reflected editor event + foreign id.
  a.graph.select(add.id);
  assert.equal(lastPayload(busA, "editor.select.recv.reveal").nodeId, add.id);
  const editorEvent = a.graph.heardFromEditor()[0];
  a.graph.reflect(editorEvent); // editor-origin echo → guard suppresses
  assert.equal(lastPayload(busA, "editor.select.echo.guard").suppressedReEmit, true);
  a.graph.select("n_definitely_not_in_this_file");
  assert.equal(lastPayload(busA, "editor.select.recv.miss").reason, "idNotInThisFile");

  // Feature requests: hover, definition, documentSymbol, completion,
  // foldingRange, semanticTokens (advertised in this cell).
  await a.cell.hover({ line: addRange.startLine, column: addRange.startColumn + 4 });
  assertFired(busA, "editor.lsp.hover.response");
  await a.cell.definition({ line: 6, column: 12 }); // "add" callsite in double
  assertFired(busA, "editor.lsp.definition.response");
  await a.cell.documentSymbol();
  assertFired(busA, "editor.lsp.documentSymbol.reconcile");
  await a.cell.completion({ line: addRange.startLine, column: addRange.startColumn + 4 });
  assertFired(busA, "editor.lsp.completion.response");
  await a.cell.foldingRange();
  assertFired(busA, "editor.lsp.foldingRange.response");
  await a.cell.semanticTokens();
  assertFired(busA, "editor.lsp.semanticTokens.response");

  // Two user edits (synchronous diagnostics: the latency chain closes on the
  // second batch) — appended comments keep both diagnostics alive.
  const len1 = a.adapter.getText().length;
  a.adapter.simulateUserEdit([{ rangeOffset: len1, rangeLength: 0, text: "# touched\n" }]);
  const len2 = a.adapter.getText().length;
  a.adapter.simulateUserEdit([{ rangeOffset: len2, rangeLength: 0, text: "# again\n" }]);
  const lat = lastPayload<{ endToEndClockDelta: number }>(busA, "editor.latency.keystroke.diagnostic");
  assert.ok(
    lat.endToEndClockDelta <= 400,
    `keystroke→diagnostic budget: observed endToEndClockDelta=${lat.endToEndClockDelta}, budget 400`,
  );
  assertFired(busA, "editor.diag.clear");
  assertFired(busA, "editor.map.stale");

  // Silent rewrite (the forbidden case) + the roundtrip check exposing it.
  a.adapter.simulateSilentRewrite([{ rangeOffset: 0, rangeLength: 0, text: "# sneaky\n" }]);
  assertFired(busA, "editor.buffer.mutation.silent");
  a.cell.buffer.roundtripCheck();
  assert.equal(lastPayload(busA, "editor.buffer.roundtrip.check").equalBytes, false);
  assertFired(busA, "editor.buffer.roundtrip.fail");

  // Undo/redo + noteUndoRedo.
  const undo = a.adapter.simulateUndo();
  assert.ok(undo, "undo stack must not be empty");
  a.cell.buffer.noteUndoRedo("undo", undo!.versionIdBefore, undo!.versionIdAfter);
  const redo = a.adapter.simulateRedo();
  assert.ok(redo, "redo stack must not be empty");
  a.cell.buffer.noteUndoRedo("redo", redo!.versionIdBefore, redo!.versionIdAfter);
  assert.deepEqual(
    payloadsOf<{ op: string }>(busA, "editor.buffer.undoRedo").map((p) => p.op),
    ["undo", "redo"],
  );

  // Drop the transport mid-session → bounded reconnect → re-didOpen.
  const didOpensBefore = payloadsOf(busA, "editor.lsp.out.didOpen").length;
  a.server.dropTransport();
  await settle();
  await settle();
  const rec = lastPayload<{ attempt: number; maxAttempts: number }>(busA, "editor.conn.reconnect");
  assert.equal(rec.attempt, 1);
  assert.equal(rec.maxAttempts, 2);
  assert.ok(
    payloadsOf(busA, "editor.lsp.out.didOpen").length > didOpensBefore,
    "after reconnect the cell must re-send didOpen",
  );

  // Introspection entry points (their own cataloged leads).
  a.cell.probeCatalog();
  a.cell.dump();
  a.cell.history();

  await a.cell.dispose();
  assertFired(busA, "editor.lsp.out.didClose");
  for (const id of busA.firedProbeIds()) firedUnion.add(id);

  // ── Cell B: tier-G cell — the green-honesty guard blocks schema green ──
  const b = await openTestCell("tier-g.tex", { tier: "G" });
  const blocked = lastPayload<{ tier: string; reason: string }>(b.cell.probe, "editor.verdict.green.blocked");
  assert.equal(blocked.tier, "G");
  assert.equal(blocked.reason, "green-may-never-be-faked");
  await b.cell.dispose();
  for (const id of b.cell.probe.firedProbeIds()) firedUnion.add(id);

  // ── Cell C: force-utf16 negotiation + an unadvertised capability ──
  const c = await openTestCell("multibyte.py", {
    serverCfg: { positionEncodingMode: "force-utf16" },
  });
  assert.equal(lastPayload(c.cell.probe, "editor.conn.positionEncoding.negotiate").accepted, "utf-16");
  const st = await c.cell.semanticTokens(); // not advertised by default
  assert.equal(st, null);
  assert.equal(
    lastPayload(c.cell.probe, "editor.lsp.capability.unsupported").reason,
    "server-does-not-advertise",
  );
  await c.cell.dispose();
  for (const id of c.cell.probe.firedProbeIds()) firedUnion.add(id);

  // ── Cell D: nested spans — the innermost-wins ambiguity decision ──
  const d = await openTestCell("nested.py");
  const area = nodeByName(d.nodes, "Shape.area");
  const areaRange = d.cell.index().getById(area.id)!.monacoRange;
  d.adapter.moveCursor({ line: areaRange.startLine, column: areaRange.startColumn + 5 });
  const amb = lastPayload<{ chosen: string; rule: string }>(d.cell.probe, "editor.map.overlap.ambiguous");
  assert.equal(amb.chosen, area.id);
  assert.equal(amb.rule, "innermost");
  await d.cell.dispose();
  for (const id of d.cell.probe.firedProbeIds()) firedUnion.add(id);

  // ── Gate leads (pure module, own bus) ──
  const gateBus = new ProbeBus({ wallClock: () => null });
  runImportGate(gateBus, [
    { path: "src/evil.ts", imports: ["lodash"] },
    { path: "src/verdict/bad.ts", imports: ["monaco-editor"] },
  ]);
  for (const id of gateBus.firedProbeIds()) firedUnion.add(id);

  // ── THE assertion: every fired lead is cataloged. ──
  const catalogIds = new Set(PROBE_CATALOG.map((s) => s.probeId));
  for (const id of firedUnion) {
    assert.ok(catalogIds.has(id), `lead "${id}" FIRED but is not documented in PROBE_CATALOG`);
  }
  assert.ok(
    firedUnion.size >= 70,
    `scenario too narrow to gate on: only ${firedUnion.size} distinct leads fired`,
  );
  t.diagnostic(
    `coverage: ${firedUnion.size} distinct probe leads fired of ${catalogIds.size} cataloged`,
  );
});
