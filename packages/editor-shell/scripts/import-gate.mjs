/**
 * S9 gate runner — scans src/**\/*.ts (including mount/monaco) and runs the
 * import-boundary gate from the compiled cell. Fails the build on any
 * violation (Operating Contract rule 3: wire this gate before features).
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { runImportGate, extractImports } = await import(
  new URL("../dist/src/gate/import-gate.js", import.meta.url).href
);
const { ProbeBus } = await import(new URL("../dist/src/probe/probe-bus.js", import.meta.url).href);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = walk(join(root, "src")).map((p) => ({
  path: relative(root, p).replace(/\\/g, "/"),
  imports: extractImports(readFileSync(p, "utf8")),
}));

const probe = new ProbeBus({ wallClock: () => null });
const result = runImportGate(probe, files);

console.log(`[gate] scanned ${files.length} files; externals: ${result.actualImports.join(", ") || "(none)"}`);
for (const e of probe.history()) {
  if (e.probeId !== "editor.gate.import.scan") {
    console.log(`[gate] ${e.probeId}: ${JSON.stringify(e.payload)}`);
  }
}
if (!result.pass) {
  console.error(`[gate] FAIL — ${result.violations.length} violation(s), ${result.leaks.length} monaco leak(s)`);
  process.exit(1);
}
console.log("[gate] PASS — import boundary clean, no monaco types outside src/mount/monaco/");
