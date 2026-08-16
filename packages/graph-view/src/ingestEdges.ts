/**
 * S0 — INGEST edge-record processing: shape check, leads-segregation guard
 * (assembly ruling 3), duplicate-id check, dangling-endpoint check — every
 * rejection probed with why, never a crash, never a silent include. Split from
 * ingest.ts (SUB200 restructure); the logic is verbatim, closed over an
 * explicit context instead of ingest()'s locals.
 *
 * KNOWN BUG (documented, deliberately unfixed — see ASSEMBLY-CHANGES.md): the
 * duplicate-id check below is DEAD CODE. ctx.seenEdgeIds is never populated
 * (no .add() anywhere), so the `seenEdgeIds.has(...)` branch can never fire;
 * duplicate edge ids are only caught downstream by renderGate's duplicate-aware
 * phantom accounting (thrown EdgeSetViolation, not a probed ingest rejection).
 */

import type { ProbeBus } from "./probeBus";
import { isUnresolvedPlaceholder, type SchemaEdge } from "./schema";
import { checkEdge, isObj } from "./ingestChecks";

const STAGE = "S0";

export interface EdgeIngestContext {
  bus: ProbeBus;
  inputCause: string;
  seenNodeIds: ReadonlySet<string>;
  seenEdgeIds: Set<string>;
  edges: SchemaEdge[];
  leads: SchemaEdge[];
  rejectedEdges: { index: number; edgeId?: string; reason: string }[];
}

export function makeEdgeRecordProcessor(ctx: EdgeIngestContext) {
  const { bus, inputCause, seenNodeIds, seenEdgeIds, edges, leads, rejectedEdges } = ctx;
  return (raw: unknown, index: number, list: "edges" | "leads"): void => {
    const edgeCause = bus.emit({ probeId: "ingest.edge", stage: STAGE, kind: "edge", payload: raw, causeId: inputCause });
    const edgeId = isObj(raw) && typeof raw.id === "string" ? raw.id : undefined;
    const res = checkEdge(raw);
    if (!res.ok) {
      const reason = res.issues.map((i) => `${i.kind === "missing" ? "missing field" : "bad enum value for"} ${i.field}`).join("; ");
      bus.emit({ probeId: "ingest.edge.reject", stage: STAGE, kind: "edge", payload: { edgeId, index, reason }, causeId: edgeCause });
      rejectedEdges.push({ index, edgeId, reason });
      return;
    }
    // ── Leads-segregation guard (assembly ruling 3): resolved:false lives ONLY
    // in leads[]. A lead smuggled into edges[] (previously accepted here) — or a
    // resolved edge smuggled into leads[] — is a REJECTION, probed with why.
    const misfiled = list === "edges" ? res.edge.resolved === false : res.edge.resolved !== false;
    if (misfiled) {
      const reason =
        list === "edges"
          ? "resolved:false inside edges[] — a lead is not an edge; the canonical envelope carries it in leads[] (assembly ruling 3)"
          : "resolved:true inside leads[] — a resolved edge is not a lead; the canonical envelope carries it in edges[] (assembly ruling 3)";
      const segCause = bus.emit({
        probeId: "ingest.edge.segregation", stage: STAGE, kind: "branch",
        payload: { edgeId: res.edge.id, list, resolved: res.edge.resolved, reason },
        causeId: edgeCause,
      });
      bus.emit({ probeId: "ingest.edge.reject", stage: STAGE, kind: "edge", payload: { edgeId: res.edge.id, index, reason }, causeId: segCause });
      rejectedEdges.push({ index, edgeId: res.edge.id, reason });
      return;
    }
    if (seenEdgeIds.has(res.edge.id)) {
      const reason = `duplicate edge id ${res.edge.id}`;
      bus.emit({ probeId: "ingest.edge.reject", stage: STAGE, kind: "edge", payload: { edgeId: res.edge.id, index, reason }, causeId: edgeCause });
      rejectedEdges.push({ index, edgeId: res.edge.id, reason });
      return;
    }
    // Dangling-endpoint check. An accepted edge whose endpoint the renderer can't find
    // would be SILENTLY unrendered by React Flow — exactly failure class F1. So a
    // dangling non-placeholder endpoint is a rejection, never an accepted-then-lost edge.
    let dangling = false;
    let lastCause = edgeCause;
    if (!seenNodeIds.has(res.edge.srcId)) {
      lastCause = bus.emit({
        probeId: "ingest.edge.danglingRef", stage: STAGE, kind: "branch",
        payload: { edgeId: res.edge.id, missingEndpoint: "src", refId: res.edge.srcId, legalPlaceholder: false },
        causeId: edgeCause,
      });
      dangling = true;
    }
    if (!seenNodeIds.has(res.edge.dstId)) {
      const legal = isUnresolvedPlaceholder(res.edge.dstId);
      lastCause = bus.emit({
        probeId: "ingest.edge.danglingRef", stage: STAGE, kind: "branch",
        payload: { edgeId: res.edge.id, missingEndpoint: "dst", refId: res.edge.dstId, legalPlaceholder: legal },
        causeId: edgeCause,
      });
      if (!legal) dangling = true;
    }
    if (dangling) {
      const reason = "dangling endpoint (not a legal unresolved-target placeholder) — would be silently unrendered, so rejected loudly instead";
      bus.emit({ probeId: "ingest.edge.reject", stage: STAGE, kind: "edge", payload: { edgeId: res.edge.id, index, reason }, causeId: lastCause });
      rejectedEdges.push({ index, edgeId: res.edge.id, reason });
      return;
    }
    (list === "edges" ? edges : leads).push(res.edge);
  };
}
