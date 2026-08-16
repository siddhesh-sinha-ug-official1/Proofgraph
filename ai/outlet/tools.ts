// ============================================================================
// V6 outlet — the four tools: declared defs + LOCAL executor + output bound.
// Split out of ai/service.ts (SUB200 restructure). Behavior unchanged.
//
// The tools answer FROM the provided graph/provenance data only — no transport
// involved, no key material anywhere near a tool payload. An unknown tool is
// answered with a named isError result (failure class unknown-tool), never
// silently dropped. Tool output is bounded (TOOL_OUTPUT_MAX_BYTES) and the
// bound is LOGGED when applied — never silent.
// ============================================================================

import type { Lead, Node as GraphNode } from "../../packages/schema/gen/graph-schema.ts";
import type { ToolDef } from "../../packages/byok-arena/src/interface.ts";
import { TOOL_OUTPUT_MAX_BYTES } from "./types.ts";
import type { OutletGraph, OutletProvenance } from "./types.ts";

export interface OutletTools {
  defs: ToolDef[];
  execute(name: string, args: Record<string, unknown>): { output: string; isError: boolean };
  bound(name: string, raw: { output: string; isError: boolean }):
    { output: string; isError: boolean; bytes: number; truncated: boolean };
}

export function buildOutletTools(deps: {
  graph: OutletGraph;
  leads: Lead[];
  nodeById: Map<string, GraphNode>;
  provenance: OutletProvenance;
  emit(probeId: string, payload: unknown): void;
}): OutletTools {
  const { graph, leads, nodeById, provenance, emit } = deps;

  const toolDefs: ToolDef[] = [
    {
      name: "listUnused",
      description: "List declarations the composed graph analysis found unreachable from the declared roots (graph-model query 'unused'). Makes no claim when no roots/unused set was provided.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "trustBase",
      description: "Transitive dependencies of a node over RESOLVED edges only (its trust base). Leads (resolved=false) are counted but never followed — honest ceiling.",
      parameters: {
        type: "object",
        properties: { nodeId: { type: "string", description: "canonical Node.id (n_ + 16 hex)" } },
        required: ["nodeId"],
        additionalProperties: false,
      },
    },
    {
      name: "nodeInfo",
      description: "Full canonical record of one node: kind, lang, name, signature, span, fill, outline, origin, provenance.",
      parameters: {
        type: "object",
        properties: { nodeId: { type: "string", description: "canonical Node.id (n_ + 16 hex)" } },
        required: ["nodeId"],
        additionalProperties: false,
      },
    },
    {
      name: "listLeads",
      description: "List unresolved references (leads, resolved=false). Leads are never edges and never followed.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];

  function runTool(name: string, args: Record<string, unknown>): { output: string; isError: boolean } {
    switch (name) {
      case "listUnused": {
        if (!Array.isArray(provenance?.unused)) {
          // honest no-claim: never fabricate an unused set without provenance
          return {
            output: JSON.stringify({
              claim: "none",
              reason: "no unused set was provided (roots are declared, never inferred) — the outlet makes no reachability claim",
            }),
            isError: false,
          };
        }
        const unused = provenance.unused.map((id) => {
          const n = nodeById.get(id)!; // staleness gate guaranteed membership
          return { id: n.id, name: n.name, kind: n.kind, lang: n.lang };
        });
        return {
          output: JSON.stringify({
            unused,
            roots: provenance.roots ?? [],
            source: provenance.source ?? null,
            note: "unused = not reachable from the DECLARED roots over resolved edges; leads are not followed",
          }),
          isError: false,
        };
      }
      case "trustBase": {
        const nodeId = String(args.nodeId ?? "");
        const start = nodeById.get(nodeId);
        if (!start) return { output: JSON.stringify({ error: "unknown-node", nodeId }), isError: true };
        const seen = new Set<string>([nodeId]);
        const queue = [nodeId];
        let edgesWalked = 0;
        while (queue.length > 0) {
          const cur = queue.shift()!;
          for (const e of graph.edges) {
            if (e.srcId !== cur) continue;
            edgesWalked++;
            if (!seen.has(e.dstId)) { seen.add(e.dstId); queue.push(e.dstId); }
          }
        }
        seen.delete(nodeId);
        const base = [...seen].sort().map((id) => {
          const n = nodeById.get(id);
          return n
            ? { id, name: n.name, fill: n.fill.status, tier: n.provenance.tier }
            : { id, missing: true };
        });
        const reachSet = new Set([nodeId, ...seen]);
        const leadsNotFollowed = leads.filter((l) => reachSet.has(l.srcId)).length;
        return {
          output: JSON.stringify({
            nodeId, name: start.name, base, size: base.length, edgesWalked,
            leadsNotFollowed,
            note: "leads (resolved=false) out of this trust base were counted but NOT followed — resolved=false stays a lead (honest ceiling)",
          }),
          isError: false,
        };
      }
      case "nodeInfo": {
        const nodeId = String(args.nodeId ?? "");
        const n = nodeById.get(nodeId);
        if (!n) return { output: JSON.stringify({ error: "unknown-node", nodeId }), isError: true };
        return { output: JSON.stringify({ node: n }), isError: false };
      }
      case "listLeads": {
        return {
          output: JSON.stringify({
            count: leads.length,
            leads: leads.map((l) => ({ id: l.id, kind: l.kind, srcId: l.srcId, dstId: l.dstId, resolved: l.resolved })),
            note: "resolved=false stays a lead — carried separately, never in edges[]",
          }),
          isError: false,
        };
      }
      default:
        // named, loud, recoverable by the model in the continuation
        return { output: JSON.stringify({ error: "unknown-tool", failureClass: "unknown-tool", name }), isError: true };
    }
  }

  function boundToolOutput(name: string, raw: { output: string; isError: boolean }) {
    const bytes = Buffer.byteLength(raw.output, "utf8");
    if (bytes <= TOOL_OUTPUT_MAX_BYTES) return { ...raw, bytes, truncated: false };
    const sliced = raw.output.slice(0, TOOL_OUTPUT_MAX_BYTES) +
      ` …[TRUNCATED by outlet bound toolOutputMaxBytes=${TOOL_OUTPUT_MAX_BYTES}; character-sliced]`;
    emit("outlet.bound.toolOutputTruncated", {
      tool: name, originalBytes: bytes, maxBytes: TOOL_OUTPUT_MAX_BYTES,
      note: "bound applied and LOGGED — never silent",
    });
    return { output: sliced, isError: raw.isError, bytes, truncated: true };
  }

  return { defs: toolDefs, execute: runTool, bound: boundToolOutput };
}
