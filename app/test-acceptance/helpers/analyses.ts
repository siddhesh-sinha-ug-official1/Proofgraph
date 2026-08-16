/**
 * SUB200 restructure (wave 2) — shared inputs + derived vocabularies for the
 * §7 acceptance headless suites, hoisted VERBATIM from
 * acceptance.headless.test.tsx.
 *
 * Inputs (REAL outer-wall outputs, written by run_demo.py step 1 — the suites
 * REFUSE if they are missing, they never mint their own analysis):
 *   acceptance/analysis-moat.json     analyze(acceptance/fixtures/moatpkg, roots=[moatpkg.core])
 *   acceptance/analysis-lean.json     analyze(acceptance/fixtures/unused_hyp.lean)
 *                                     — the CT verdict-arrival world (REAL kernel greens)
 *   acceptance/analysis-ceiling.json  analyze(acceptance/fixtures/honest_ceiling.typ)
 *                                     — the SURVIVING all-unknown honest ceiling
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { SchemaNode } from "@editor-shell/src/schema/schema.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
export const ACCEPTANCE = path.join(ROOT, "acceptance");
export const EVIDENCE_DIR = path.join(ACCEPTANCE, "evidence");
export const EVIDENCE_PATH = path.join(EVIDENCE_DIR, "headless.json");
export const PARTS_DIR = path.join(EVIDENCE_DIR, "headless-parts");

export function loadAnalysis(name: string): any {
  const p = path.join(ACCEPTANCE, name);
  let raw: string;
  try {
    raw = readFileSync(p, "utf8");
  } catch (e) {
    throw new Error(
      `acceptance-evidence-missing: ${name} not found at ${p} — run ` +
      `acceptance/run_demo.py (it writes the analyses BEFORE this suite); ` +
      `this suite never mints its own analysis (${e instanceof Error ? e.message : e})`);
  }
  return JSON.parse(raw);
}

// Two INDEPENDENT parses of each analysis: envelope objects come from one,
// EXPECTED ids from the other — `===` in the suites therefore proves
// byte-level string content identity, never shared references (V5 discipline).
export const moatServe = loadAnalysis("analysis-moat.json");
export const moatExpect = loadAnalysis("analysis-moat.json");
export const leanServe = loadAnalysis("analysis-lean.json");
export const leanExpect = loadAnalysis("analysis-lean.json");
export const ceilingServe = loadAnalysis("analysis-ceiling.json");
export const ceilingExpect = loadAnalysis("analysis-ceiling.json");

export const idOf = (analysis: any, name: string): string => {
  const n = (analysis.graph.nodes as any[]).find((x) => x.name === name);
  if (!n) throw new Error(`no node named ${name} in the analysis graph`);
  return n.id as string;
};
export const MAIN = idOf(moatExpect, "moatpkg.core.main");
export const SIDE = idOf(moatExpect, "moatpkg.core.side_calc");
export const UNUSED = idOf(moatExpect, "moatpkg.helpers.unused_fn");

export const coreBytes = new Uint8Array(
  readFileSync(path.join(ACCEPTANCE, "fixtures", "moatpkg", "core.py")));
const coreText = Buffer.from(coreBytes).toString("utf8");
if (Buffer.byteLength(coreText, "utf8") !== coreText.length) {
  throw new Error("core.py must stay ASCII so byte offsets == char offsets");
}

/** pyright-canonical uri of the open document (V2's byte-exact form). */
export const CORE_URI = (() => {
  let p2 = path.join(ACCEPTANCE, "fixtures", "moatpkg", "core.py").replace(/\\/g, "/");
  p2 = p2.charAt(0).toLowerCase() + p2.slice(1);
  return "file:///" + p2.replace(":", "%3A");
})();

/** EditorPane's DECLARED span-file remap bound (ids + byte spans untouched):
 *  the extractor mints span.file INGEST-root-relative; since the remediation
 *  round the outer wall extracts the bare moatpkg dir DIRECTLY (the
 *  package-root-uri-mismatch staging workaround is retired), so the moat
 *  analysis mints "core.py" — no "moatpkg/" prefix (declared
 *  root-sensitivity).  Both vocabularies are accepted here; the editor keys
 *  spans by the open document's uri. */
export function editorNodesFor(analysis: any): SchemaNode[] {
  return (analysis.graph.nodes as any[])
    .filter((n) => {
      const f = String(n.span?.file ?? "").replace(/\\/g, "/");
      return f === "core.py" || f.endsWith("/core.py");
    })
    .map((n) => ({ ...n, span: { ...n.span, file: CORE_URI } })) as SchemaNode[];
}

/** Caret (1-based line/column) landing INSIDE a node's span (ASCII file). */
export function caretInside(byteStart: number): { line: number; column: number } {
  const before = coreText.slice(0, byteStart);
  const line = before.split("\n").length;
  const column = byteStart - (before.lastIndexOf("\n") + 1) + 5; // inside "def <name>"
  return { line, column };
}

export const moatEnvelope = () => structuredClone({
  schemaVersion: moatServe.graph.schemaVersion,
  nodes: moatServe.graph.nodes,
  edges: moatServe.graph.edges,
  leads: moatServe.graph.leads,
});
export const leanEnvelope = () => structuredClone({
  schemaVersion: leanServe.graph.schemaVersion,
  nodes: leanServe.graph.nodes,
  edges: leanServe.graph.edges,
  leads: leanServe.graph.leads,
});
export const ceilingEnvelope = () => structuredClone({
  schemaVersion: ceilingServe.graph.schemaVersion,
  nodes: ceilingServe.graph.nodes,
  edges: ceilingServe.graph.edges,
  leads: ceilingServe.graph.leads,
});

// ── the lean CT world (green-flow round): file + editor-vocabulary nodes ─────
export const leanBytes = new Uint8Array(
  readFileSync(path.join(ACCEPTANCE, "fixtures", "unused_hyp.lean")));

/** pyright-canonical uri form, reused for the lean doc (V2's byte-exact rule). */
export const LEAN_URI = (() => {
  let p2 = path.join(ACCEPTANCE, "fixtures", "unused_hyp.lean").replace(/\\/g, "/");
  p2 = p2.charAt(0).toLowerCase() + p2.slice(1);
  return "file:///" + p2.replace(":", "%3A");
})();

/** EditorPane's declared span-file remap bound, applied to the lean doc:
 *  spans are ingest-root-relative ("unused_hyp.lean"); ids + byte spans
 *  cross untouched. */
export function leanEditorNodes(analysis: any): SchemaNode[] {
  return (analysis.graph.nodes as any[])
    .filter((n) => String(n.span?.file ?? "").replace(/\\/g, "/").endsWith("unused_hyp.lean"))
    .map((n) => ({ ...n, span: { ...n.span, file: LEAN_URI } })) as SchemaNode[];
}

/** The tier the editor mounts at is the tier the analysis MEASURED (cell 2's
 *  measuredTier pin, carried through the outer wall's capability provenance)
 *  — read, asserted CT in §7(i), never asserted locally. */
export const LEAN_MEASURED_TIER =
  leanExpect.provenance.capability.lean.measuredTierPin.measuredTier as string;
