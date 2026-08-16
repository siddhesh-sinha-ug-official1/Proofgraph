/**
 * Shared context for the TypeScript package gates (suite split by concern).
 * Run the whole suite from packages/schema:
 *
 *     node --test "tests/*.test.ts"
 *
 * Zero third-party deps (node:test / node:assert / node:fs only; sha256 comes
 * from node:crypto inside gen/ids.ts).  The golden vectors in vectors.json
 * were generated ONCE from ids.py — gen/ids.ts reproducing them byte-for-byte
 * is the cross-language id-mint agreement gate.  VERDICT_CASES below is
 * duplicated VERBATIM from tests/context.py — the same table passing on both
 * implementations is the outline-policy agreement gate.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const schemaObj = JSON.parse(readFileSync(join(PKG_ROOT, "schema.json"), "utf8"));
export const capabilityObj = JSON.parse(readFileSync(join(PKG_ROOT, "capability.json"), "utf8"));
const vectorsDoc = JSON.parse(readFileSync(join(PKG_ROOT, "vectors.json"), "utf8"));

export interface NodeVector {
  type: "node";
  input: { lang: string; kind: string; moduleName: string; rawName: string; file: string };
  expected: { canonicalName: string; path: string; preimage: string; id: string };
}
export interface EdgeVector {
  type: "edge";
  input: { kind: string; srcId: string; dstId: string };
  expected: { preimage: string; id: string };
}
export const vectors = vectorsDoc.vectors as (NodeVector | EdgeVector)[];

// Shared verdict cases — keep byte-identical with tests/context.py.
// [worstOf, expected worstToken, expected status, expected unrecognized]
export const VERDICT_CASES: [string[], string, string, string[]][] = [
  [["green"], "green", "green", []],
  [["lemma", "blue"], "blue", "blue", []],
  [["definition", "lemma"], "definition", "blue", []],
  [["red", "amber", "green"], "red", "red", []],
  [["none", "green"], "none", "green", []],
  [["amber", "blue"], "amber", "amber", []],
  [[], "none", "green", []],
  [["none/green"], "none/green", "unknown", ["none/green"]],
  [["green", "mystery-token"], "mystery-token", "unknown", ["mystery-token"]],
  [["red", "none/green"], "none/green", "unknown", ["none/green"]],
];
