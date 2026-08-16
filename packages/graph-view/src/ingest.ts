/**
 * S0 — INGEST. Parse + validate a served graph against the CANONICAL envelope
 * (assembly ruling 3): {schemaVersion:"v0", nodes, edges, leads}.
 *   - schemaVersion is REQUIRED and pin-checked (gen/pin.ts PINNED_SCHEMA_VERSION):
 *     a missing or mismatched version rejects the whole payload loudly.
 *   - resolved:false lives ONLY in leads[]: a resolved:false record in edges[]
 *     (or resolved:true in leads[]) is a segregation REJECTION, probed.
 *   - accepted leads merge into the internal GraphModel.edges (keeping
 *     resolved:false) so leads still render dashed and still count in the
 *     no-silent-drop edge accounting downstream.
 * Malformed records are rejected with a reason (never crash, never silently include).
 * Every node, every edge, every lead, every rejection, every count gets a probe.
 *
 * SUB200 restructure: the per-record field/enum checkers live in ingestChecks.ts
 * and the edge-record processor (segregation/dangling guards, plus a dead
 * duplicate-id check — known bug, see ingestEdges.ts header) in ingestEdges.ts;
 * this facade keeps the envelope gate, the node loop, and the summary probes.
 * Importers of "./ingest" are unchanged.
 */

import type { ProbeBus } from "./probeBus";
import { EDGE_KINDS, LANGS, NODE_KINDS, type GraphModel, type SchemaEdge, type SchemaNode } from "./schema";
import { PINNED_SCHEMA_VERSION } from "../../schema/gen/pin";
import { checkNode, isObj } from "./ingestChecks";
import { makeEdgeRecordProcessor } from "./ingestEdges";

const STAGE = "S0";

export interface IngestResult {
  model: GraphModel;
  rejectedNodes: { index: number; nodeId?: string; reason: string }[];
  rejectedEdges: { index: number; edgeId?: string; reason: string }[];
  /** Non-null when the canonical envelope itself was rejected (ruling 3 + pin):
   *  the whole payload is refused — nodes/edges/leads are NOT processed. */
  rejectedEnvelope: { reason: string } | null;
  outputCause: string;
}

export function ingest(schemaJson: unknown, bus: ProbeBus, sourceLabel = "schema.json"): IngestResult {
  const rawObj = isObj(schemaJson) ? schemaJson : {};
  let rawNodes: unknown[] = Array.isArray(rawObj.nodes) ? rawObj.nodes : [];
  let rawEdges: unknown[] = Array.isArray(rawObj.edges) ? rawObj.edges : [];
  let rawLeads: unknown[] = Array.isArray(rawObj.leads) ? rawObj.leads : [];

  let schemaBytes = 0;
  try { schemaBytes = JSON.stringify(schemaJson)?.length ?? 0; } catch { schemaBytes = -1; }

  const inputCause = bus.emit({
    probeId: "ingest.input", stage: STAGE, kind: "input",
    payload: { schemaBytes, nodeCount: rawNodes.length, edgeCount: rawEdges.length, leadCount: rawLeads.length, sourceLabel },
    causeId: null,
  });

  // ── Canonical envelope gate (ruling 3 + schema pin): schemaVersion REQUIRED,
  // must equal the pinned "v0". A served graph failing the pin is rejected loudly
  // — the whole payload, never a partial include.
  const versionPresent = typeof rawObj.schemaVersion === "string";
  const envelopeOk = versionPresent && rawObj.schemaVersion === PINNED_SCHEMA_VERSION;
  bus.emit({
    probeId: "ingest.envelope.version", stage: STAGE, kind: "decision",
    payload: {
      present: versionPresent,
      ...(versionPresent ? { value: rawObj.schemaVersion } : {}),
      expected: PINNED_SCHEMA_VERSION,
      ok: envelopeOk,
    },
    causeId: inputCause,
  });
  let rejectedEnvelope: IngestResult["rejectedEnvelope"] = null;
  if (!envelopeOk) {
    rejectedEnvelope = {
      reason: versionPresent
        ? `schemaVersion ${JSON.stringify(rawObj.schemaVersion)} != pinned ${JSON.stringify(PINNED_SCHEMA_VERSION)} — failure-class=schema-pin-mismatch`
        : `schemaVersion missing — the canonical envelope {schemaVersion:"${PINNED_SCHEMA_VERSION}",nodes,edges,leads} requires it (assembly ruling 3)`,
    };
    // Whole-payload rejection: nothing downstream may silently render an
    // unpinned graph.
    rawNodes = [];
    rawEdges = [];
    rawLeads = [];
  }

  const nodes: SchemaNode[] = [];
  const rejectedNodes: IngestResult["rejectedNodes"] = [];
  const seenNodeIds = new Set<string>();

  rawNodes.forEach((raw, index) => {
    const nodeCause = bus.emit({ probeId: "ingest.node", stage: STAGE, kind: "node", payload: raw, causeId: inputCause });
    const nodeId = isObj(raw) && typeof raw.id === "string" ? raw.id : undefined;
    const res = checkNode(raw);
    if (!res.ok) {
      let lastBranch = nodeCause;
      for (const issue of res.issues) {
        lastBranch = bus.emit({
          probeId: issue.kind === "missing" ? "ingest.node.field.missing" : "ingest.node.enum.bad",
          stage: STAGE, kind: "branch",
          payload: issue.kind === "missing"
            ? { nodeId, field: issue.field, index }
            : { nodeId: nodeId ?? "(no id)", field: issue.field, value: String(issue.value) },
          causeId: nodeCause,
        });
      }
      const reason = res.issues.map((i) => `${i.kind === "missing" ? "missing field" : "bad enum value for"} ${i.field}`).join("; ");
      bus.emit({ probeId: "ingest.node.reject", stage: STAGE, kind: "node", payload: { nodeId, index, reason }, causeId: lastBranch });
      rejectedNodes.push({ index, nodeId, reason });
      return;
    }
    if (seenNodeIds.has(res.node.id)) {
      const reason = `duplicate node id ${res.node.id}`;
      bus.emit({ probeId: "ingest.node.reject", stage: STAGE, kind: "node", payload: { nodeId: res.node.id, index, reason }, causeId: nodeCause });
      rejectedNodes.push({ index, nodeId: res.node.id, reason });
      return;
    }
    seenNodeIds.add(res.node.id);
    nodes.push(res.node);
  });

  const edges: SchemaEdge[] = [];
  const leads: SchemaEdge[] = [];
  const rejectedEdges: IngestResult["rejectedEdges"] = [];
  const seenEdgeIds = new Set<string>();

  const processEdgeRecord = makeEdgeRecordProcessor({
    bus, inputCause, seenNodeIds, seenEdgeIds, edges, leads, rejectedEdges,
  });

  rawEdges.forEach((raw, index) => processEdgeRecord(raw, index, "edges"));
  rawLeads.forEach((raw, index) => processEdgeRecord(raw, index, "leads"));

  // The internal render model merges edges[] + leads[] (leads keep resolved:false)
  // so the downstream no-silent-drop accounting covers BOTH canonical lists.
  const modelEdges: SchemaEdge[] = [...edges, ...leads];

  bus.emit({
    probeId: "ingest.schema.valid", stage: STAGE, kind: "decision",
    payload: {
      ok: rejectedEnvelope === null && rejectedNodes.length === 0 && rejectedEdges.length === 0,
      envelopeOk: rejectedEnvelope === null,
      nodeErrors: rejectedNodes.length, edgeErrors: rejectedEdges.length,
    },
    causeId: inputCause,
  });
  bus.emit({
    probeId: "ingest.node.count", stage: STAGE, kind: "value",
    payload: { accepted: nodes.length, rejected: rejectedNodes.length }, causeId: inputCause,
  });
  bus.emit({
    probeId: "ingest.edge.count", stage: STAGE, kind: "value",
    payload: {
      accepted: modelEdges.length, rejected: rejectedEdges.length,
      resolvedTrue: modelEdges.filter((e) => e.resolved).length,
      resolvedFalse: modelEdges.filter((e) => !e.resolved).length,
    },
    causeId: inputCause,
  });

  const langDist = Object.fromEntries(LANGS.map((l) => [l, nodes.filter((n) => n.lang === l).length]));
  const kindDist = Object.fromEntries(NODE_KINDS.map((k) => [k, nodes.filter((n) => n.kind === k).length]));
  const edgeKindDist = Object.fromEntries(EDGE_KINDS.map((k) => [k, modelEdges.filter((e) => e.kind === k).length]));
  bus.emit({ probeId: "ingest.node.langDist", stage: STAGE, kind: "value", payload: langDist, causeId: inputCause });
  bus.emit({ probeId: "ingest.node.kindDist", stage: STAGE, kind: "value", payload: kindDist, causeId: inputCause });
  bus.emit({ probeId: "ingest.edge.kindDist", stage: STAGE, kind: "value", payload: edgeKindDist, causeId: inputCause });

  const validCause = bus.last("ingest.schema.valid");
  const outputCause = bus.emit({
    probeId: "ingest.output", stage: STAGE, kind: "output",
    payload: { nodes: nodes.length, edges: modelEdges.length },
    causeId: validCause ? `${validCause.probeId}#${validCause.logicalClock}` : inputCause,
  });

  return { model: { nodes, edges: modelEdges }, rejectedNodes, rejectedEdges, rejectedEnvelope, outputCause };
}
