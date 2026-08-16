"""Generator for gen/graph-schema.ts — the TypeScript projection of schema.json.

Template + generator moved verbatim from schemagen.py (SUB200 restructure);
schemagen.py remains the facade and the CLI.
"""
import json

try:
    from .schemagen_common import _fill, _schema_facts, _ts_str_array
except ImportError:  # imported flat (packages/schema on sys.path)
    from schemagen_common import _fill, _schema_facts, _ts_str_array


# ── gen/graph-schema.ts ──────────────────────────────────────────────────────

_GRAPH_SCHEMA_TS = '''// GENERATED from schema.json (schemaVersion "@VERSION@", schemaRevision "@REVISION@") by schemagen.py. Do not edit by hand.
// schema.json is the ONE source of truth; this file is a projection of it.
export const SCHEMA_VERSION = "@VERSION@" as const;
export const SCHEMA_REVISION = "@REVISION@" as const;

export const NODE_KINDS = @NODE_KINDS@ as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export const EDGE_KINDS = @EDGE_KINDS@ as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];
export const LANGS = @LANGS@ as const;
export type Lang = (typeof LANGS)[number];
export const FILL_STATUSES = @FILLS@ as const;
export type FillStatus = (typeof FILL_STATUSES)[number];
// Historical aliases for FillStatus so the per-cell swaps stay mechanical.
export type Verdict = FillStatus;
export type VerdictStatus = FillStatus;
export const ORIGINS = @ORIGINS@ as const;
export type Origin = (typeof ORIGINS)[number];
export const TIERS = @TIERS@ as const;
export type Tier = (typeof TIERS)[number];

export const NODE_ID_PATTERN = @NODE_PATTERN@;
export const EDGE_ID_PATTERN = @EDGE_PATTERN@;

export interface Span { file: string; byteStart: number; byteEnd: number }
export interface Fill { status: FillStatus; source: string }        // green ONLY from a real verdict
export interface Outline { status: FillStatus; worstOf: string[] }  // computed LAST (gap analysis)
export interface NodeProvenance {
  tier: Tier;
  extractor: string;
  /** @RESOLVED_DESC@ */
  resolved: boolean;
}
export interface EdgeProvenance { tier: Tier; extractor: string }
export interface Node {
  id: string;                       // @NODE_PATTERN_BARE@
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
  id: string;                       // @EDGE_PATTERN_BARE@
  kind: EdgeKind;
  srcId: string;
  dstId: string;                    // Node.id or "@PLACEHOLDER_PREFIX@" + rawRefName
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
export const OUTLINE_WORST_ORDER = @ORDER@ as const;
export type WorstToken = (typeof OUTLINE_WORST_ORDER)[number];
/** worst token → displayed status (from schema.json worstTokenToStatus; ruling: definition→@DEFINITION_STATUS@). */
export const WORST_TO_STATUS: Record<WorstToken, FillStatus> = {
  @WTS_ENTRIES@,
};

export const UNRESOLVED_PLACEHOLDER_PREFIX = "@PLACEHOLDER_PREFIX@";
/** Placeholder form: @PLACEHOLDER_FORM@ (the RAW name — never hashed). */
export function isUnresolvedPlaceholder(id: string): boolean {
  return id.startsWith(UNRESOLVED_PLACEHOLDER_PREFIX);
}

/**
 * Single shared policy (assembly ruling): an UNRECOGNIZED worstOf token must
 * @POLICY@ — it can never silently yield a green ring.  Rank -1 = worst
 * (lower = worse).  The fused token @BANNED@ is BANNED from data (the split
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
'''


def generate_graph_schema_ts(schema_obj):
    f = _schema_facts(schema_obj)
    wts_entries = ", ".join(f"{k}: {json.dumps(v)}" for k, v in f["wts"].items())
    return _fill(_GRAPH_SCHEMA_TS, {
        "VERSION": f["version"],
        "REVISION": f["revision"],
        "NODE_KINDS": _ts_str_array(f["node_kinds"]),
        "EDGE_KINDS": _ts_str_array(f["edge_kinds"]),
        "LANGS": _ts_str_array(f["langs"]),
        "FILLS": _ts_str_array(f["fills"]),
        "ORIGINS": _ts_str_array(f["origins"]),
        "TIERS": _ts_str_array(f["tiers"]),
        "NODE_PATTERN": json.dumps(f["node_pattern"]),
        "EDGE_PATTERN": json.dumps(f["edge_pattern"]),
        "NODE_PATTERN_BARE": f["node_pattern"],
        "EDGE_PATTERN_BARE": f["edge_pattern"],
        "RESOLVED_DESC": f["resolved_desc"],
        "ORDER": _ts_str_array(f["order"]),
        "DEFINITION_STATUS": f["wts"]["definition"],
        "WTS_ENTRIES": wts_entries,
        "PLACEHOLDER_PREFIX": f["placeholder_prefix"],
        "PLACEHOLDER_FORM": f["placeholder_form"],
        "POLICY": f["policy"],
        "BANNED": " / ".join(json.dumps(b) for b in f["banned"]),
    })
