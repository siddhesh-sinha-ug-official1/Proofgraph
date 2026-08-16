/**
 * Probe-catalog sections for stages S0 (INGEST) and S1 (CAP — no silent caps).
 * Entries are verbatim from the §6 enumeration plus the logged local/Phase-0
 * additions; probeCatalog.ts concatenates the sections in stage order.
 */

import { E, type ProbeCatalogEntry } from "./catalogKit";

// ── Stage S0 — INGEST ──────────────────────────────────────────────────────
export const CATALOG_S0: ProbeCatalogEntry[] = [
  E("ingest.input", "input", "{schemaBytes:int,nodeCount:int,edgeCount:int,leadCount:int,sourceLabel:string}",
    "The raw graph payload arrived; how big, how many records claimed per canonical list (edges[] vs leads[], ruling 3)."),
  E("ingest.envelope.version", "decision", "{present:bool,value?:string,expected:'v0',ok:bool}",
    "The canonical-envelope pin gate (ruling 3 + schema PIN): schemaVersion is REQUIRED and must equal the pinned 'v0'; missing or mismatched rejects the WHOLE payload loudly."),
  E("ingest.schema.valid", "decision", "{ok:bool,envelopeOk:bool,nodeErrors:int,edgeErrors:int}",
    "Did the whole payload conform to the canonical envelope + Frozen Schema shape?"),
  E("ingest.node", "node", "Node",
    "Every node ingested; the atomic unit read. One event per node (firehose)."),
  E("ingest.node.field.missing", "branch", "{nodeId?:string,field:string,index:int}",
    "A required Node field was absent — the branch that led to rejection."),
  E("ingest.node.enum.bad", "branch", "{nodeId:string,field:string,value:string}",
    "A field held a value outside its enum."),
  E("ingest.node.reject", "node", "{nodeId?:string,index:int,reason:string}",
    "A node was rejected (with why); it is NOT silently included."),
  E("ingest.edge", "edge", "Edge",
    "Every edge ingested; one event per edge (firehose). First place the edge-set is materialized — far end of the Mermaid-& chain."),
  E("ingest.edge.reject", "edge", "{edgeId?:string,index:int,reason:string}",
    "An edge was rejected (with why)."),
  E("ingest.edge.segregation", "branch", "{edgeId:string,list:'edges'|'leads',resolved:bool,reason:string}",
    "Leads-segregation guard (ruling 3): resolved:false inside edges[] — or resolved:true inside leads[] — is a rejection; resolved:false lives ONLY in leads[]."),
  E("ingest.edge.danglingRef", "branch", "{edgeId:string,missingEndpoint:'src'|'dst',refId:string,legalPlaceholder:bool}",
    "An edge referenced a node id not in the node-set (and whether dstId is the explicit unresolved-target placeholder, which is legal)."),
  E("ingest.node.count", "value", "{accepted:int,rejected:int}",
    "Accepted vs rejected node totals."),
  E("ingest.edge.count", "value", "{accepted:int,rejected:int,resolvedTrue:int,resolvedFalse:int}",
    "Accepted vs rejected edges, split by resolved. `accepted` is term #1 of the edge-set-equality chain."),
  E("ingest.node.langDist", "value", "{python,go,c,cpp,lean,latex,typst:int}",
    "The language mix of the graph."),
  E("ingest.node.kindDist", "value", "{module,function,class,theorem,section,label,figure,decl:int}",
    "The kind mix; what shape of graph is about to be laid out."),
  E("ingest.edge.kindDist", "value", "{calls,imports,includes,inherits,references,cites,proof_uses:int}",
    "The edge-kind mix; which relationship types dominate."),
  E("ingest.output", "output", "{nodes:int,edges:int}",
    "The parsed, validated GraphModel handed to S1 (full model via dump())."),
];

// ── Stage S1 — CAP (no silent caps) ────────────────────────────────────────
export const CATALOG_S1: ProbeCatalogEntry[] = [
  E("cap.limit", "value", "{maxNodes:int,maxExpanded:int,rationale:string}",
    "The configured ceilings and why (DOM-per-node reality; Monaco-per-node reality)."),
  E("cap.live", "value", "{liveNodes:int,liveEdges:int}",
    "The live counts about to be checked."),
  E("cap.compare", "decision", "{overNodes:bool,overExpanded:bool,requestedExpanded:int,liveNodes:int,maxNodes:int}",
    "Is the graph over ceiling? overExpanded measures the REQUESTED initial expansion set against maxExpanded — never a constant."),
  E("cap.degrade", "decision", "{mode:'full'|'light-only'|'refuse',reason:string}",
    "The chosen degrade mode."),
  E("cap.degrade.notTaken", "branch", "{rejectedMode:string,reason:string}",
    "The degrade branch NOT taken and why."),
  E("cap.expanded.limit", "value", "{maxExpanded:int}",
    "The simultaneous-Monaco ceiling (dozens–low-hundreds)."),
  E("cap.log", "state", "{bannerShown:bool,message:string,withheldCount:int}",
    "The user-visible banner when a cap bites. bannerShown MUST be true whenever mode≠full. Proves the cap was never silent."),
  E("cap.dropped", "node", "{nodeId:string,reason:string}",
    "ONLY in refuse mode, one per withheld node, only with cap.log.bannerShown=true. Firing without the banner is the silent-drop bug."),
  E("cap.edge.dropped", "edge", "{edgeId:string,srcId:string,dstId:string,reason:string}",
    "ONLY in refuse mode, one per edge withheld because an endpoint node was withheld — edges are never withheld silently either. Chained to cap.log."),
  E("cap.virtualize", "decision", "{onlyRenderVisibleElements:bool,reason:string}",
    "Whether React Flow viewport-culling is on. Culling ≠ dropping: a culled node is still in the model; a capped node is withheld and logged."),
];
