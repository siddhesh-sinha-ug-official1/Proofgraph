/**
 * Schema v0 — re-exported from the CANONICAL schema package (assembly Phase 0).
 * packages/schema/gen/graph-schema.ts is generated from schema.json, the ONE
 * source of truth; this file is the cell's membrane over it (swap pattern (a):
 * direct relative import — the §7.6 boundary gate allows relative imports and
 * the canonical gen file has zero imports of its own).
 * This cell READS these records and WRITES none of them (projection, not producer).
 */

export {
  NODE_KINDS, LANGS, ORIGINS, TIERS, EDGE_KINDS,
  // The cell's historical name for the fill/outline status enum.
  FILL_STATUSES as VERDICT_STATUSES,
  SCHEMA_VERSION,
  UNRESOLVED_PLACEHOLDER_PREFIX, isUnresolvedPlaceholder,
  // Canonical worst-case-wins machinery (assembly rulings 1 + 4).
  OUTLINE_WORST_ORDER, WORST_TO_STATUS, rankWorstToken, worstOfVerdict,
  // Historical alias: the local fused-token order ["...","none/green"] is gone —
  // ruling 4 bans the fused spelling; the canonical split order is the pin.
  OUTLINE_WORST_ORDER as WORST_CASE_ORDER,
} from "../../schema/gen/graph-schema";

export type {
  NodeKind, Lang, Origin, Tier, EdgeKind,
  FillStatus, VerdictStatus,
  Span, Fill, Outline,
  WorstToken,
  // Canonical record shapes under the cell's historical names.
  Node as SchemaNode,
  Edge as SchemaEdge,
  Lead as SchemaLead,
  // The canonical wire envelope (ruling 3): {schemaVersion:"v0", nodes, edges, leads}.
  Graph as CanonicalGraph,
} from "../../schema/gen/graph-schema";

import type { Node as CanonNode, Edge as CanonEdge } from "../../schema/gen/graph-schema";

/**
 * The cell's INTERNAL render model (not the wire envelope). Ingest validates the
 * canonical envelope (ruling 3: resolved:false lives ONLY in leads[]) and then
 * merges edges[] + leads[] here, leads keeping resolved:false, so every
 * downstream stage (cap accounting, layout, the Mermaid-& edge-set equality
 * gate, lead-dashed rendering) sees one no-silent-drop edge universe.
 */
export interface GraphModel {
  nodes: CanonNode[];
  edges: CanonEdge[];
}
