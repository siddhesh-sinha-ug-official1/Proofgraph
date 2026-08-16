// Operating Contract rule 3: separation is a TESTABLE property, wired before
// features. The cell (src/) may import ONLY: relative modules that stay inside
// the cell, and the platform crypto primitive (node:crypto). Platform fetch is
// a global (no import). Reaching into the graph/editor/extractor cells — or
// any third-party package — fails the build here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const ALLOWED_BARE = new Set(["node:crypto"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g;

test("import-boundary gate: src imports only node:crypto + in-cell relative modules", () => {
  const files = walk(SRC_ROOT);
  assert.ok(files.length >= 10, `expected the cell's source files, found ${files.length}`);
  const violations: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1];
      if (spec.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), spec);
        if (!resolved.startsWith(SRC_ROOT)) {
          violations.push(`${file}: relative import escapes the cell: ${spec}`);
        }
        continue;
      }
      if (!ALLOWED_BARE.has(spec)) {
        violations.push(`${file}: forbidden import "${spec}" (allowed: ${[...ALLOWED_BARE].join(", ")}; fetch is a global)`);
      }
    }
    if (/\brequire\s*\(/.test(text)) violations.push(`${file}: CommonJS require() found`);
    if (/\bimport\s*\(/.test(text)) violations.push(`${file}: dynamic import() found — boundary must be statically checkable`);
  }
  assert.deepEqual(violations, [], `import-boundary violations:\n${violations.join("\n")}`);
});

test("import-boundary gate: cell never mentions other trees' folders", () => {
  const files = walk(SRC_ROOT);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const forbidden of ["graph-core", "editor-cell", "extractor", "../../.."]) {
      assert.ok(!text.includes(`from "${forbidden}`) && !text.includes(`from '../${forbidden}`),
        `${file} references another tree: ${forbidden}`);
    }
  }
});
