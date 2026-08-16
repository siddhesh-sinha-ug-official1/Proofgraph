/**
 * §9.18 — Editor-agnostic core (failure class: HIDDEN MONACO COUPLING).
 * S1–S9 must run against the stub mount adapter with no Monaco anywhere:
 * (a) the whole pipeline runs headless, (b) statically no file outside
 * src/mount/monaco/ imports a Monaco-surface package (the CodeMirror-swap
 * surface is only src/mount/), (c) the four introspection entry points return
 * real data with the stub. Every assertion reads probe output.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProbeBus, type ProbeEvent } from "../src/probe/probe-bus.js";
import { extractImports, runImportGate, type ScannedFile } from "../src/gate/import-gate.js";
import { openTestCell, nodeByName } from "./stub/harness.js";
import {
  assertFired,
  assertNeverFired,
  lastPayload,
  payloadsOf,
} from "./stub/assert-probes.js";

const CELL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function scanRealSrc(): ScannedFile[] {
  const srcDir = join(CELL_ROOT, "src");
  const files: ScannedFile[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, relPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push({
          path: `src/${relPath}`,
          imports: extractImports(readFileSync(abs, "utf8")),
        });
      }
    }
  };
  walk(srcDir, "");
  return files;
}

test("hidden Monaco coupling: the whole pipeline runs headless on the stub adapter — mount, buffer, LSP, diagnostics, verdicts, brushing all fire with adapter.kind 'stub'", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;

  // The adapter under every probe below is the stub — no Monaco in process.
  assert.equal(h.adapter.kind, "stub");
  const init = lastPayload<{ wrapperVersion: string; adapterKind: string }>(
    bus,
    "editor.mount.wrapper.init",
  );
  assert.equal(init.adapterKind, "stub", "mount probe must record the stub adapter kind");
  assert.equal(init.wrapperVersion, "stub-1.0.0");
  assertFired(bus, "editor.mount.wrapper.ready");

  // S1: byte-exact open, no silent mutation — headless.
  assert.equal(lastPayload(bus, "editor.buffer.roundtrip.check").equalBytes, true);
  assertNeverFired(bus, "editor.buffer.mutation.silent");

  // S2/S3: real handshake + didOpen + diagnostics over the in-memory wire.
  assert.equal(lastPayload(bus, "editor.conn.positionEncoding.negotiate").accepted, "utf-8");
  assert.equal(lastPayload(bus, "editor.lsp.out.didOpen").version, 1);
  assertFired(bus, "editor.lsp.in.diagnostics");
  assertFired(bus, "editor.diag.marker.set");

  // S5: verdicts painted (live red beats stale schema green on broken).
  const broken = nodeByName(h.nodes, "broken");
  const add = nodeByName(h.nodes, "add");
  const paints = payloadsOf<{ nodeId: string; status: string }>(bus, "editor.verdict.gutter.paint");
  assert.equal(paints.filter((p) => p.nodeId === broken.id).at(-1)?.status, "red");
  assert.equal(paints.filter((p) => p.nodeId === add.id).at(-1)?.status, "green");

  // S6 emit: caret in `add` → bus event with the byte-identical node id.
  const addRange = h.cell.index().getById(add.id)!.monacoRange;
  h.adapter.moveCursor({ line: addRange.startLine, column: addRange.startColumn + 4 });
  const emitted = lastPayload<{ busEvent: { nodeId: string; origin: string } }>(
    bus,
    "editor.select.emit.bus",
  );
  assert.equal(emitted.busEvent.nodeId, add.id);
  assert.equal(h.graph.heardFromEditor().at(-1)?.nodeId, add.id);

  // S6 recv: graph-origin select → reveal + highlight on the stub adapter.
  h.graph.select(broken.id);
  const reveal = lastPayload<{ nodeId: string; highlightApplied: boolean }>(
    bus,
    "editor.select.recv.reveal",
  );
  assert.equal(reveal.nodeId, broken.id);
  assert.equal(reveal.highlightApplied, true);

  await h.cell.dispose();
  assertFired(bus, "editor.lsp.out.didClose");
});

test("hidden Monaco coupling: statically, NO file outside src/mount/monaco/ imports monaco-editor/@codingame/@typefox/monaco-tree-sitter — the swap surface is only src/mount/", () => {
  const files = scanRealSrc().filter((f) => !f.path.startsWith("src/mount/monaco/"));
  assert.ok(files.length >= 15, `expected a real core walk, saw ${files.length} files`);
  assert.ok(files.some((f) => f.path === "src/cell.ts"), "walk must cover the composition root");
  assert.ok(
    files.some((f) => f.path === "src/mount/adapter.ts"),
    "walk must cover the adapter seam (the CodeMirror-swap surface)",
  );

  // Direct static check: no Monaco-surface package anywhere in the core.
  const offenders: { file: string; spec: string }[] = [];
  for (const f of files) {
    for (const spec of f.imports) {
      const pkg = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];
      if (
        pkg === "monaco-editor" ||
        pkg === "monaco-tree-sitter" ||
        spec.startsWith("@codingame/") ||
        spec.startsWith("@typefox/")
      ) {
        offenders.push({ file: f.path, spec });
      }
    }
  }
  assert.deepEqual(offenders, [], `Monaco-surface imports leaked into the core: ${JSON.stringify(offenders)}`);

  // Probe read: the gate itself agrees — zero monaco.leak probes on the core.
  const probe = new ProbeBus({ wallClock: () => null });
  const result = runImportGate(probe, files);
  const scan = lastPayload<{ fileCount: number }>(probe, "editor.gate.import.scan");
  assert.equal(scan.fileCount, files.length);
  assertNeverFired(probe, "editor.gate.monaco.leak", "core outside src/mount/monaco/ must be editor-agnostic");
  assertNeverFired(probe, "editor.gate.import.violation");
  assert.equal(result.pass, true);
});

test("hidden Monaco coupling: probeCatalog/dump/history/tap all return REAL data against the stub adapter", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;
  assert.equal(h.adapter.kind, "stub");

  // tap(): a live event is delivered to the subscriber when it fires.
  const tapped: ProbeEvent[] = [];
  const untap = h.cell.tap("editor.select.emit.bus", (e) => tapped.push(e));
  const add = nodeByName(h.nodes, "add");
  const addRange = h.cell.index().getById(add.id)!.monacoRange;
  h.adapter.moveCursor({ line: addRange.startLine, column: addRange.startColumn + 4 });
  assert.equal(tapped.length, 1, "tap must deliver the live emit exactly once");
  assert.equal(
    (tapped[0].payload as { busEvent: { nodeId: string } }).busEvent.nodeId,
    add.id,
    "tapped event payload carries the real node id",
  );
  untap();
  const double = nodeByName(h.nodes, "double");
  const doubleRange = h.cell.index().getById(double.id)!.monacoRange;
  h.adapter.moveCursor({ line: doubleRange.startLine, column: doubleRange.startColumn + 4 });
  assert.equal(tapped.length, 1, "after untap the handler must not receive further events");
  assertFired(bus, "editor.select.emit.bus", 2); // both emits really happened on the bus

  // probeCatalog(): >= 120 leads, and the catalog probe records the same list.
  const catalog = h.cell.probeCatalog();
  assert.ok(catalog.length >= 120, `catalog has only ${catalog.length} leads`);
  const catProbe = lastPayload<{ probes: { probeId: string }[] }>(bus, "editor.probe.catalog");
  assert.equal(catProbe.probes.length, catalog.length);
  assert.ok(catProbe.probes.some((p) => p.probeId === "editor.select.emit.bus"));

  // dump(): the real model state — sha256 of the model bytes equals the
  // fixture's source sha (nothing rewrote the buffer under the stub).
  const dump = h.cell.dump() as { modelState: { sha256: string } };
  assert.equal(dump.modelState.sha256, h.meta.sha256);
  const dumpProbe = lastPayload<{ modelState: { sha256: string }; silentMutations: number }>(
    bus,
    "editor.probe.dump",
  );
  assert.equal(dumpProbe.modelState.sha256, h.meta.sha256);
  assert.equal(dumpProbe.silentMutations, 0);

  // history(): non-empty and strictly ordered by logicalClock.
  const events = h.cell.history();
  assert.ok(events.length > 0, "history must be non-empty after open");
  for (let i = 1; i < events.length; i++) {
    assert.ok(
      events[i].logicalClock > events[i - 1].logicalClock,
      `history out of order at index ${i}: ${events[i - 1].logicalClock} → ${events[i].logicalClock}`,
    );
  }
  const histProbe = lastPayload<{ eventCount: number }>(bus, "editor.probe.history");
  assert.equal(histProbe.eventCount, events.length);

  await h.cell.dispose();
});
