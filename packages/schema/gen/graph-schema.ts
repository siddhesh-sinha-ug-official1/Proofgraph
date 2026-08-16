// GENERATED from schema.json (schemaVersion "v0", schemaRevision "v0.1") by schemagen.py. Do not edit by hand.
// schema.json is the ONE source of truth; this file is a projection of it.
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
// Historical aliases for FillStatus so the per-cell swaps stay mechanical.
export type Verdict = FillStatus;
export type VerdictStatus = FillStatus;
export const ORIGINS = ["given", "assumed", "checked"] as const;
export type Origin = (typeof ORIGINS)[number];
export const TIERS = ["T1", "T2", "T3"] as const;
export type Tier = (typeof TIERS)[number];

export const NODE_ID_PATTERN = "^n_[0-9a-f]{16}$";
export const EDGE_ID_PATTERN = "^e_[0-9a-f]{16}$";

export interface Span { file: string; byteStart: number; byteEnd: number }
export interface Fill { status: FillStatus; source: string }        // green ONLY from a real verdict
export interface Outline { status: FillStatus; worstOf: string[] }  // computed LAST (gap analysis)
export interface NodeProvenance {
  tier: Tier;
  extractor: string;
  /** the extractor successfully bound this element's identity; true for every well-formed structural node */
  resolved: boolean;
}
export interface EdgeProvenance { tier: Tier; extractor: string }
export interface Node {
  id: string;                       // ^n_[0-9a-f]{16}$
  kind: NodeKind;
  lang: Lang;
  name: string;
  signature: string | null;
  span: Span;
  fill: Fill;
  outline: Outline | null;          // null until gap-analysis round
  origin: Origin;
  provenance: NodeProvenance;
}
export interface Edge {
  id: string;                       // ^e_[0-9a-f]{16}$
  kind: EdgeKind;
  srcId: string;
  dstId: string;                    // Node.id or "unresolved:" + rawRefName
  resolved: boolean;                // TRUE only if a resolver actually bound dst
  resolver: string;                 // "" if unresolved
  provenance: EdgeProvenance;
}
/** resolved=false is a lead, not an edge — carried in Graph.leads, never Graph.edges. */
export interface Lead extends Edge { resolved: false }
export interface Graph {
  schemaVersion: typeof SCHEMA_VERSION;
  nodes: Node[];
  edges: Edge[];                    // resolved edges only
  leads?: Lead[];                   // resolved=false leads, carried separately
}

// ── OUTLINE worst-case-wins (frozen order; earlier = worse) ──────────────────
export const OUTLINE_WORST_ORDER = ["red", "amber", "blue", "definition", "lemma", "none", "green"] as const;
export type WorstToken = (typeof OUTLINE_WORST_ORDER)[number];
/** worst token → displayed status (from schema.json worstTokenToStatus; ruling: definition→blue). */
export const WORST_TO_STATUS: Record<WorstToken, FillStatus> = {
  red: "red", amber: "amber", blue: "blue", definition: "blue", lemma: "green", none: "green", green: "green",
};

export const UNRESOLVED_PLACEHOLDER_PREFIX = "unresolved:";
/** Placeholder form: prefix + rawRefName (the RAW name — never hashed). */
export function isUnresolvedPlaceholder(id: string): boolean {
  return id.startsWith(UNRESOLVED_PLACEHOLDER_PREFIX);
}

/**
 * Single shared policy (assembly ruling): an UNRECOGNIZED worstOf token must
 * rank WORST and report the offending token — it can never silently yield a green ring.  Rank -1 = worst
 * (lower = worse).  The fused token "none/green" is BANNED from data (the split
 * spellings are canonical).
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
