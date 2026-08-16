// ============================================================================
// V6 outlet — construction: envelope/provenance gates + wiring.
// Split out of ai/service.ts (SUB200 restructure). Behavior unchanged.
//
//   createAiOutlet({ byokWall, graph, provenance }) → { ask(question, opts),
//                                                       tools, pins }
//
// Gates enforced here, in original order (all loud, all typed):
//   lead-in-edges     — a resolved=false record inside edges[] (or
//                       resolved=true inside leads[]) refuses the envelope.
//   graph-data-stale  — provenance (unused/roots ids) referencing nodes absent
//                       from THIS graph snapshot refuses construction
//                       (id-set membership proves same-snapshot-ness).
// ============================================================================

import type { Lead, Node as GraphNode } from "../../packages/schema/gen/graph-schema.ts";
import { MAX_TOOL_ROUNDS, TOOL_OUTPUT_MAX_BYTES, OutletFailure } from "./types.ts";
import type { AiOutlet, AiOutletConfig } from "./types.ts";
import { createOutletPinStream } from "./pins.ts";
import { buildOutletTools } from "./tools.ts";
import { makeAsk } from "./ask.ts";

export function createAiOutlet(config: AiOutletConfig): AiOutlet {
  const { byokWall, graph, provenance } = config;
  if (!byokWall || typeof byokWall.chat !== "function" || typeof byokWall.submitToolResults !== "function") {
    throw new Error("createAiOutlet: byokWall with chat/submitToolResults is required");
  }
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("createAiOutlet: graph must be the canonical envelope {nodes, edges, leads?}");
  }
  const leads: Lead[] = Array.isArray(graph.leads) ? graph.leads : [];

  // -- outlet pin stream + the key-leak chokepoint (see pins.ts) ---------------
  const pins = createOutletPinStream();
  const emit = pins.emit;

  // -- envelope sanity: leads stay leads ----------------------------------------
  const misEdges = graph.edges.filter((e) => e.resolved !== true).map((e) => e.id);
  const misLeads = leads.filter((l) => (l as { resolved: boolean }).resolved !== false).map((l) => l.id);
  if (misEdges.length > 0 || misLeads.length > 0) {
    throw new OutletFailure("lead-in-edges",
      `resolved=false inside edges[] ${JSON.stringify(misEdges)} / resolved=true inside leads[] ${JSON.stringify(misLeads)} — leads stay leads, never edges`);
  }

  const nodeById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));

  // -- graph-data-stale gate: provenance must be from THIS snapshot --------------
  const provRefs = [...(provenance?.unused ?? []), ...(provenance?.roots ?? [])];
  const missingIds = provRefs.filter((id) => !nodeById.has(id));
  emit("outlet.staleCheck", {
    ok: missingIds.length === 0,
    checkedIds: provRefs.length,
    missingIds,
    semantics: "provenance (unused/roots) must reference only nodes present in the handed-in graph snapshot; a miss means it was minted from a different snapshot",
  });
  if (missingIds.length > 0) {
    throw new OutletFailure("graph-data-stale",
      `provenance references node ids absent from the graph snapshot: ${JSON.stringify(missingIds)}`);
  }

  // -- the four tools: answer FROM the provided graph/provenance data ------------
  const tools = buildOutletTools({ graph, leads, nodeById, provenance, emit });

  emit("outlet.construct", {
    schemaVersion: graph.schemaVersion ?? null,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    leadCount: leads.length,
    rootsDeclared: provenance?.roots ?? [],
    unusedProvided: Array.isArray(provenance?.unused) ? provenance.unused.length : null,
    toolsDefined: tools.defs.map((t) => t.name),
    bounds: { maxToolRounds: MAX_TOOL_ROUNDS, toolOutputMaxBytes: TOOL_OUTPUT_MAX_BYTES },
  });

  // -- ask(): the single-round tool loop (see ask.ts) ----------------------------
  const ask = makeAsk({ byokWall, graph, leads, provenance, tools, pins });

  return {
    ask,
    tools: { defs: tools.defs, execute: tools.execute },
    pins: { history: () => pins.history() },
  };
}
