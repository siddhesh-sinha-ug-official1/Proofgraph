// Deterministic test runner: enumerates compiled test files explicitly and hands
// them to node's built-in test runner. Optional arg filters by substring:
//   node scripts/run-tests.mjs 03-selection
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const testDir = resolve("dist/test");
const filter = process.argv[2] ?? "";
let files = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".test.js") && p.includes(filter)) files.push(p);
  }
}
walk(testDir);
files.sort();
if (files.length === 0) {
  console.error(`no test files matched filter "${filter}" under ${testDir}`);
  process.exit(1);
}
console.log(`running ${files.length} test file(s)`);
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
