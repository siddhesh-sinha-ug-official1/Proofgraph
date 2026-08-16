/**
 * §7(g) staging — the TEMP VARIANT (fixture never mutated) + the REAL
 * schema nodes with span.file remapped to the temp doc's pyright-canonical
 * uri.  Carved VERBATIM from squiggle_check.mjs (SUB200 restructure,
 * wave 2); the staging runs at import time, exactly as the old top level.
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..", "..", "..");
export const ES_DIST = path.join(ROOT, "packages", "editor-shell", "dist");
export const FIXTURE = path.join(ROOT, "acceptance", "fixtures", "moatpkg");

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ── stage the TEMP VARIANT (fixture never mutated) ──────────────────────────
export const ERR_EXPR = '"str" + 1';
const INJECTED_LINE = '\n\nresult = "str" + 1\n';

export const fixtureShaBefore = {
  "core.py": sha256(readFileSync(path.join(FIXTURE, "core.py"))),
  "helpers.py": sha256(readFileSync(path.join(FIXTURE, "helpers.py"))),
  "__init__.py": sha256(readFileSync(path.join(FIXTURE, "__init__.py"))),
};

const scratch = mkdtempSync(path.join(os.tmpdir(), "pg-squiggle-"));
export const pkgDir = path.join(scratch, "moatpkg");
mkdirSync(pkgDir);
const coreOriginal = readFileSync(path.join(FIXTURE, "core.py"), "utf8");
export const variantText = coreOriginal + INJECTED_LINE;
writeFileSync(path.join(pkgDir, "core.py"), variantText, "utf8");
writeFileSync(path.join(pkgDir, "helpers.py"),
  readFileSync(path.join(FIXTURE, "helpers.py")));
writeFileSync(path.join(pkgDir, "__init__.py"),
  readFileSync(path.join(FIXTURE, "__init__.py")));

export const expectedByteStart = variantText.indexOf(ERR_EXPR);
export const expectedByteEnd = expectedByteStart + ERR_EXPR.length;
if (expectedByteStart <= coreOriginal.length - 1) throw new Error("injection must append after every node span");
if (Buffer.byteLength(variantText, "utf8") !== variantText.length) {
  throw new Error("variant must stay ASCII so byte offsets == char offsets");
}

// pyright-canonical uri (V2's spike-verified byte-exact form).
let p = path.join(pkgDir, "core.py").replace(/\\/g, "/");
p = p[0].toLowerCase() + p.slice(1);
export const URI = "file:///" + p.replace(":", "%3A");

// ── schema nodes: REAL analysis ids/spans, span.file → the temp doc uri ─────
// (remediation round: the outer wall extracts the bare moatpkg dir DIRECTLY,
// so span.file is "core.py" with no "moatpkg/" prefix — both vocabularies
// accepted; ids + byte spans still cross untouched)
const analysis = JSON.parse(
  readFileSync(path.join(ROOT, "acceptance", "analysis-moat.json"), "utf8"));
export const NODES = analysis.graph.nodes
  .filter((n) => {
    const f = String(n.span?.file ?? "").replace(/\\/g, "/");
    return f === "core.py" || f.endsWith("/core.py");
  })
  .map((n) => ({ ...n, span: { ...n.span, file: URI } }));
if (NODES.length === 0) throw new Error("no core.py nodes in analysis-moat.json");
for (const n of NODES) {
  if (n.span.byteEnd > coreOriginal.length) throw new Error(`span of ${n.name} exceeds the original file`);
}

/** The fixture shas RE-READ now (teardown verification). */
export function fixtureShaNow() {
  return {
    "core.py": sha256(readFileSync(path.join(FIXTURE, "core.py"))),
    "helpers.py": sha256(readFileSync(path.join(FIXTURE, "helpers.py"))),
    "__init__.py": sha256(readFileSync(path.join(FIXTURE, "__init__.py"))),
  };
}
