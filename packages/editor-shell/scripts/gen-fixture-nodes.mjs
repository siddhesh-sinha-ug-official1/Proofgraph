/**
 * Fixture generator — plays the role of TREE 1 for this clean-room build
 * (transcript D1): it AUTHORS the fixture files byte-exactly (BOM, CRLF,
 * trailing whitespace included — no editor/git can mangle them), computes
 * byte spans, mints node ids with the CANONICAL mint, and writes:
 *   test/fixtures/<files>            — the byte-exact sources
 *   test/fixtures/schema-nodes.json  — Tree 1 stub nodes per fixture
 *   test/fixtures/fixture-meta.json  — stub-server scripts + expected offsets
 *   test/fixtures/outline-fixture.json — §9.5 worst-case-wins table
 *
 * ASSEMBLY Phase 0 swap (ruling 5): the old ad-hoc mint (pipe-joined preimage
 * with byte offsets) is GONE — ids now come from the canonical schema package
 * (packages/schema/gen/ids.ts, imported directly; Node 24 type stripping),
 * so fixtures carry REAL canonical ids:
 *   n_ + sha256("node:v0" \x1f lang \x1f kind \x1f canonicalName \x1f file \x1f path)[:16]
 * with canonicalName/path derived per gen/schema.md (module → moduleName;
 * member → moduleName.rawName / moduleName::rawName). Note the canonical
 * preimage is SPAN-FREE — ids are stable across reformatting by design.
 *
 * The CELL never mints ids — it carries these strings through untouched.
 * Deterministic: same script → byte-identical outputs.
 *
 * SUB200 restructure: the per-fixture sections live in ./fixture-gen/ (run
 * here IN THE ORIGINAL ORDER); this entry writes the three JSON files.
 * Outputs verified byte-identical against the pre-split generator.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { genCleanPy, genTypeErrorPy } from "./fixture-gen/fixtures-basic.mjs";
import {
  genMultibytePy,
  genNestedPy,
  genTierGTex,
  genWhitespacePy,
} from "./fixture-gen/fixtures-edge.mjs";
import { outlineFixture } from "./fixture-gen/outline-cases.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixDir = join(root, "test", "fixtures");
mkdirSync(fixDir, { recursive: true });

const ctx = { fixDir, schemaNodes: {}, fixtureMeta: {} };

// Original single-file order: clean, type-error, multibyte, whitespace,
// nested, tier-g — key order in the JSON outputs depends on it.
genCleanPy(ctx);
genTypeErrorPy(ctx);
genMultibytePy(ctx);
genWhitespacePy(ctx);
genNestedPy(ctx);
genTierGTex(ctx);

const { schemaNodes, fixtureMeta } = ctx;

writeFileSync(join(fixDir, "schema-nodes.json"), JSON.stringify(schemaNodes, null, 2) + "\n");
writeFileSync(join(fixDir, "fixture-meta.json"), JSON.stringify(fixtureMeta, null, 2) + "\n");
writeFileSync(join(fixDir, "outline-fixture.json"), JSON.stringify(outlineFixture, null, 2) + "\n");

console.log("fixtures generated:");
for (const k of Object.keys(fixtureMeta)) {
  console.log(`  ${k}: ${fixtureMeta[k].byteLength} bytes, sha256 ${fixtureMeta[k].sha256.slice(0, 12)}…, nodes ${schemaNodes[k].length}`);
  if (fixtureMeta[k].expected.errorByteStart !== undefined) {
    console.log(`    expected error span: [${fixtureMeta[k].expected.errorByteStart}, ${fixtureMeta[k].expected.errorByteEnd})`);
  }
}
