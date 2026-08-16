/**
 * §9.9 — Import-boundary gate (failure class: HIDDEN COUPLING).
 *
 * Separation is a testable property: src/ may import only relative paths plus
 * the declared dependency allow-list, and Monaco-only packages may appear
 * ONLY under src/mount/monaco/. Every assertion here reads the gate's probe
 * output (editor.gate.import.scan / .violation / editor.gate.monaco.leak),
 * not just the returned GateResult.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProbeBus } from "../src/probe/probe-bus.js";
import {
  DECLARED_DEPS,
  extractImports,
  runImportGate,
  type GateViolation,
  type MonacoLeak,
  type ScannedFile,
} from "../src/gate/import-gate.js";
import {
  assertFired,
  assertNeverFired,
  eventsOf,
  lastPayload,
  payloadsOf,
} from "./stub/assert-probes.js";

// dist-<name>/test/09-import-gate.test.js → cell root is two levels up.
const CELL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface ScanPayload {
  declaredDeps: string[];
  actualImports: string[];
  fileCount: number;
}

/** Walk the REAL src/ tree (recursive, .ts files) into ScannedFiles. */
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

test("hidden coupling: the REAL src/ tree passes the gate — scan probe lists the declared deps, zero violation/leak probes", () => {
  const probe = new ProbeBus({ wallClock: () => null });
  const files = scanRealSrc();
  assert.ok(files.length >= 15, `expected a real tree walk, saw only ${files.length} .ts files`);
  assert.ok(
    files.some((f) => f.path === "src/mount/monaco/monaco-adapter.ts"),
    "walk must include the monaco mount adapter (the one place Monaco imports are legal)",
  );

  const result = runImportGate(probe, files);

  const scanEvents = assertFired(probe, "editor.gate.import.scan");
  const scan = scanEvents[scanEvents.length - 1].payload as ScanPayload;
  assert.deepEqual(scan.declaredDeps, DECLARED_DEPS, "scan probe must list the declared dep allow-list verbatim");
  assert.equal(scan.fileCount, files.length);
  assert.ok(
    scan.actualImports.includes("monaco-editor"),
    `clean pass must not be vacuous — the monaco mount really imports monaco-editor; actualImports=${JSON.stringify(scan.actualImports)}`,
  );
  for (const pkg of scan.actualImports) {
    assert.ok(DECLARED_DEPS.includes(pkg), `scan reported undeclared external ${pkg}`);
  }

  assertNeverFired(probe, "editor.gate.import.violation", "real src/ must not smuggle imports");
  assertNeverFired(probe, "editor.gate.monaco.leak", "real src/ must not leak Monaco outside mount/monaco");
  assert.equal(result.pass, true);
});

test("hidden coupling: an undeclared import (lodash from src/evil.ts) fires editor.gate.import.violation and fails the gate", () => {
  const probe = new ProbeBus({ wallClock: () => null });
  const result = runImportGate(probe, [{ path: "src/evil.ts", imports: ["lodash"] }]);

  const violationEvents = assertFired(probe, "editor.gate.import.violation", 1);
  assert.equal(violationEvents.length, 1, "exactly one violation probe expected");
  const v = violationEvents[0].payload as GateViolation;
  assert.equal(v.offendingImport, "lodash");
  assert.equal(v.fromFile, "src/evil.ts");
  assert.equal(v.reason, "outside-allowlist");
  // The violation is causally chained to the scan that found it.
  assert.ok(
    violationEvents[0].causeId?.startsWith("editor.gate.import.scan@"),
    `violation must chain to its scan; causeId=${violationEvents[0].causeId}`,
  );
  assertNeverFired(probe, "editor.gate.monaco.leak", "lodash is not a Monaco package");
  assert.equal(result.pass, false);
});

test("hidden coupling: monaco-editor imported from src/verdict/bad.ts fires editor.gate.monaco.leak and fails the gate", () => {
  const probe = new ProbeBus({ wallClock: () => null });
  const result = runImportGate(probe, [
    { path: "src/verdict/bad.ts", imports: ["monaco-editor"] },
  ]);

  const leakEvents = assertFired(probe, "editor.gate.monaco.leak", 1);
  assert.equal(leakEvents.length, 1);
  const leak = leakEvents[0].payload as MonacoLeak;
  assert.equal(leak.fromModule, "src/verdict/bad.ts");
  assert.equal(leak.importedType, "monaco-editor");
  assert.equal(leak.reason, "monaco-type-outside-mount");
  assert.ok(
    leakEvents[0].causeId?.startsWith("editor.gate.import.scan@"),
    `leak must chain to its scan; causeId=${leakEvents[0].causeId}`,
  );
  // monaco-editor IS a declared dep — the failure is the leak, not the allow-list.
  assertNeverFired(probe, "editor.gate.import.violation", "monaco-editor is declared; only the leak may fire");
  assert.equal(result.pass, false);
});

test("hidden coupling: monaco-editor from src/mount/monaco/adapter.ts is ALLOWED — no leak probe, gate passes", () => {
  const probe = new ProbeBus({ wallClock: () => null });
  const result = runImportGate(probe, [
    { path: "src/mount/monaco/adapter.ts", imports: ["monaco-editor"] },
  ]);

  const scan = lastPayload<ScanPayload>(probe, "editor.gate.import.scan");
  assert.deepEqual(scan.actualImports, ["monaco-editor"], "scan still records the import — allowed, not hidden");
  assertNeverFired(probe, "editor.gate.monaco.leak", "src/mount/monaco/ is the sanctioned Monaco surface");
  assertNeverFired(probe, "editor.gate.import.violation");
  assert.equal(result.pass, true);
});

test("hidden coupling: extractImports catches import/from, export-from, dynamic import() and require() — proved via the gate's scan/violation/leak probes", () => {
  const source = [
    'import def from "monaco-editor";',
    'import { a, b } from "./relative.js";',
    'import * as ns from "@codingame/monaco-vscode-api";',
    'import "side-effect-pkg";',
    'export { x } from "vscode-ws-jsonrpc";',
    'export * from "../up.js";',
    'const dyn = await import("web-tree-sitter");',
    'const req = require("react");',
  ].join("\n");

  const specs = extractImports(source);
  assert.deepEqual(specs, [
    "monaco-editor",
    "./relative.js",
    "@codingame/monaco-vscode-api",
    "side-effect-pkg",
    "vscode-ws-jsonrpc",
    "../up.js",
    "web-tree-sitter",
    "react",
  ]);

  // Probe read: run the very extractions through the gate; the scan payload
  // proves each syntactic form reached the checker (relatives excluded).
  const probe = new ProbeBus({ wallClock: () => null });
  const result = runImportGate(probe, [{ path: "src/synthetic/forms.ts", imports: specs }]);

  const scan = lastPayload<ScanPayload>(probe, "editor.gate.import.scan");
  assert.deepEqual(scan.actualImports, [
    "@codingame/monaco-vscode-api",
    "monaco-editor",
    "react",
    "side-effect-pkg",
    "vscode-ws-jsonrpc",
    "web-tree-sitter",
  ]);

  const violations = payloadsOf<GateViolation>(probe, "editor.gate.import.violation");
  assert.deepEqual(
    violations.map((v) => v.offendingImport),
    ["side-effect-pkg"],
    "only the undeclared bare import violates the allow-list",
  );
  const leaks = payloadsOf<MonacoLeak>(probe, "editor.gate.monaco.leak");
  assert.deepEqual(
    leaks.map((l) => l.importedType).sort(),
    ["@codingame/monaco-vscode-api", "monaco-editor"],
    "static-import and namespace-import Monaco packages both leak outside mount/monaco",
  );
  assert.equal(result.pass, false);
  assert.equal(eventsOf(probe, "editor.gate.import.scan").length, 1);
});
