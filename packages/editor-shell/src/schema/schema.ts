/**
 * Tree 1 seam — Frozen Schema v0 (document revision v0.1).
 *
 * ASSEMBLY Phase 0 swap: this file is a VERIFIED-IN-SYNC copy of the canonical
 * schema package at ../../../schema/gen/graph-schema.ts (pattern (b) of the
 * swap rules — a direct relative import is blocked by this cell's tsconfig
 * rootDir "." and its dist layout, so the constants/tables/helpers below are
 * kept byte-equivalent by test/21-schema-sync.test.ts, which imports the REAL
 * canonical file at runtime (Node type stripping) and asserts:
 *   - every enum array below deep-equals the canonical one,
 *   - OUTLINE_WORST_ORDER and WORST_TO_STATUS deep-equal the canonical tables,
 *   - rankWorstToken / worstOfVerdict agree behaviorally case-for-case,
 *   - checkPin passes against the canonical PIN (schemaVersion v0, schemaHash
 *     3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c).
 * Any drift from packages/schema explodes that test loudly — "one schema".
 *
 * Tree 4 is a READ-ONLY consumer/projector: it renders these and emits Node.id
 * on the bus, but never mints or re-derives an id. Ids are opaque strings
 * carried through byte-identical.
 */

export const SCHEMA_VERSION = "v0" as const;
export const SCHEMA_REVISION = "v0.1" as const;

export const NODE_KINDS = ["module", "function", "class", "theorem", "section", "label", "figure", "decl"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export const EDGE_KINDS = ["calls", "imports", "includes", "inherits", "references", "cites", "proof_uses"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];
export const LANGS = ["python", "go", "c", "cpp", "lean", "latex", "typst"] as const;
export type Lang = (typeof LANGS)[number];
export const FILL_STATUSES = ["green", "amber", "red", "blue", "unknown"] as const;
export type FillStatus = (typeof FILL_STATUSES)[number];
export const ORIGINS = ["given", "assumed", "checked"] as const;
export type Origin = (typeof ORIGINS)[number];
export const TIERS = ["T1", "T2", "T3"] as const;
export type Tier = (typeof TIERS)[number];

export const NODE_ID_PATTERN = "^n_[0-9a-f]{16}$";
export const EDGE_ID_PATTERN = "^e_[0-9a-f]{16}$";

export interface Span {
  file: string;
  byteStart: number;
  byteEnd: number;
}

export interface SchemaNode {
  id: string; // content-addressed by Tree 1 (canonical mint); stable across reformatting. NEVER re-derived here.
  kind: NodeKind;
  lang: Lang;
  name: string;
  signature: string | null;
  span: Span;
  /** FILL = this node's OWN compiler/kernel verdict. green ONLY from a real verdict. */
  fill: { status: FillStatus; source: string };
  /** OUTLINE = transitive trust base, worst-case-wins. Computed LAST; null until then. */
  outline: { status: FillStatus; worstOf: string[] } | null;
  origin: Origin;
  /** provenance.resolved (assembly ruling 7): the extractor successfully bound
   * this element's identity; true for every well-formed structural node. */
  provenance: { tier: Tier; extractor: string; resolved: boolean };
}

/** Edges are Tree 5's projection — Tree 4 does not consume them (§4 table). */
export interface SchemaEdge {
  id: string;
  kind: EdgeKind;
  srcId: string; // Node.id
  dstId: string; // Node.id or "unresolved:" + rawRefName
  resolved: boolean; // FALSE = a lead, not an edge; never presented as a real relationship.
  resolver: string; // "" if unresolved
  provenance: { tier: Tier; extractor: string };
}

// ── OUTLINE worst-case-wins (frozen order; earlier = worse) ──────────────────
// Canonical SPLIT spelling (assembly ruling 4): "none" and "green" are separate
// entries; the fused token "none/green" is BANNED from data.
export const OUTLINE_WORST_ORDER = ["red", "amber", "blue", "definition", "lemma", "none", "green"] as const;
export type WorstToken = (typeof OUTLINE_WORST_ORDER)[number];

/** worst token → displayed status (canonical worstTokenToStatus; ruling 1: definition→blue). */
export const WORST_TO_STATUS: Record<WorstToken, FillStatus> = {
  red: "red", amber: "amber", blue: "blue", definition: "blue", lemma: "green", none: "green", green: "green",
};

export const UNRESOLVED_PLACEHOLDER_PREFIX = "unresolved:";
/** Placeholder form (ruling 6): prefix + rawRefName (the RAW name — never hashed). */
export function isUnresolvedPlaceholder(id: string): boolean {
  return id.startsWith(UNRESOLVED_PLACEHOLDER_PREFIX);
}

/**
 * Single shared policy (assembly ruling 4): an UNRECOGNIZED worstOf token must
 * rank WORST and report the offending token — it can never silently yield a
 * green ring.  Rank -1 = worst (lower = worse).
 */
export function rankWorstToken(token: string): { rank: number; recognized: boolean } {
  const rank = (OUTLINE_WORST_ORDER as readonly string[]).indexOf(token);
  return rank < 0 ? { rank: -1, recognized: false } : { rank, recognized: true };
}

/** Worst-case-wins verdict over a worstOf array; empty worstOf = "none" (nothing to distrust). */
export function worstOfVerdict(worstOf: string[]): { worstToken: string; status: FillStatus; unrecognized: string[] } {
  const unrecognized = worstOf.filter((t) => !rankWorstToken(t).recognized);
  if (worstOf.length === 0) {
    return { worstToken: "none", status: WORST_TO_STATUS.none, unrecognized };
  }
  let worst = worstOf[0];
  for (const t of worstOf.slice(1)) {
    if (rankWorstToken(t).rank < rankWorstToken(worst).rank) worst = t;
  }
  const status = rankWorstToken(worst).recognized ? WORST_TO_STATUS[worst as WorstToken] : "unknown";
  return { worstToken: worst, status, unrecognized };
}
