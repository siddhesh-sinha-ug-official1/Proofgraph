/**
 * Probe-catalog sections for stages S2 (VERDICT — unknown ≠ green), S3
 * (LAYOUT-IN) and S4 (LAYOUT). Entries follow the §6 enumeration (same probeIds,
 * same order); payloadType strings on verdict.output / verdict.outline.worstOfCheck /
 * layout.in.node were corrected in the claim-audit round to spell every field the
 * code actually emits. probeCatalog.ts concatenates the sections in stage order.
 */

import { E, type ProbeCatalogEntry } from "./catalogKit";

// ── Stage S2 — VERDICT (unknown ≠ green) ───────────────────────────────────
export const CATALOG_S2: ProbeCatalogEntry[] = [
  E("verdict.fill.in", "input", "{nodeId:string,status:VerdictStatus,source:string}",
    "The node's OWN compiler verdict as received, plus which compiler/kernel claims it."),
  E("verdict.fill.decision", "decision", "{nodeId:string,status:string,color:string,hatched:bool}",
    "Status → color mapping per node."),
  E("verdict.fill.unknownGuard", "branch", "{nodeId:string,wouldBeGreen:false,mappedTo:string,reason:string}",
    "Fired for every unknown node: maps to hatched grey and explicitly NOT green. The Green-may-never-be-faked lead."),
  E("verdict.outline.in", "input", "{nodeId:string,outline:{status,worstOf[]}|null}",
    "The transitive-trust-base verdict as received; may be null (gap analysis not run yet)."),
  E("verdict.outline.nullBranch", "branch", "{nodeId:string,mappedTo:'grey ring',outlineWasNull:true,reason:string}",
    "Fired when outline===null — render as unknown, never green."),
  E("verdict.outline.decision", "decision", "{nodeId:string,status:string,ringColor:string}",
    "Outline status → ring color per node."),
  E("verdict.outline.unknownGuard", "branch", "{nodeId:string,wouldBeGreen:false,mappedTo:'grey ring',reason:string}",
    "The outline-side never-green guard."),
  E("verdict.outline.worstOfCheck", "decision", "{nodeId,worstOf[],derivedWorst,declaredStatus,consistent:bool,order:string,unrecognizedToken?:true,unrecognizedTokens?:string[]}",
    "Verification lead: re-reduce worstOf[] by the CANONICAL worst-case-wins order (rulings 1+4: definition→blue, unrecognized ranks WORST and is reported) and check it matches outline.status. A mismatch is a red flag, not a recompute."),
  E("verdict.histogram", "value", "{fill:{green,amber,red,blue,unknown},outline:{green,amber,red,blue,unknown,none}}",
    "The running verdict census. A graph 80% unknown is honestly 80% unverified — never laundered greener."),
  E("verdict.output", "output", "{paints:int,counts:{green,amber,red,blue,unknown,nullOutline},outline:{green,amber,red,blue,unknown,none}}",
    "The full paint map handed to S3 plus the final verdict histogram."),
];

// ── Stage S3 — LAYOUT-IN ───────────────────────────────────────────────────
export const CATALOG_S3: ProbeCatalogEntry[] = [
  E("layout.in.build", "value", "{algorithm:'layered',direction:'DOWN',options:object}",
    "The ELK layout options chosen (layered/Sugiyama, direction DOWN)."),
  E("layout.in.ports", "decision", "{portConstraints:'FIXED_ORDER'|'FREE',reason:string}",
    "Real ELK port constraints (fixed Handles) vs free port placement; reads FREE under the dagre fallback."),
  E("layout.in.node", "node", "{id:string,width:int,height:int,mode:'light'|'expanded',placeholder?:true}",
    "Every ELK child built, with box size (light 220×64 vs expanded Monaco box; synthesized placeholder ghosts flagged). One per node."),
  E("layout.in.edge", "edge", "{id:string,sources:[srcId],targets:[dstId]}",
    "Every ELK edge built. One per edge."),
  E("layout.in.edgeCount", "value", "{count:int}",
    "Edges placed into the ELK input. Term #2 of the edge-set-equality chain."),
  E("layout.in.output", "output", "ElkGraph",
    "THE graph handed to ELK — the exact object passed to elk.layout(). What did the engine actually see?"),
];

// ── Stage S4 — LAYOUT ──────────────────────────────────────────────────────
export const CATALOG_S4: ProbeCatalogEntry[] = [
  E("layout.engine", "value", "{name:string,version:string,spdx:string,worker:bool}",
    "Which layout engine ran, its version, SPDX license, and whether it ran off the main thread. Honest provenance for the coordinates."),
  E("layout.call.request", "call", "ElkGraph",
    "The external-call request: the ElkGraph sent to elk.layout()."),
  E("layout.worker.decision", "decision", "{useWorker:bool,reason:string,nodeCount:int}",
    "Main-thread vs Web Worker choice (elkjs blocks the main thread on large graphs — Worker it)."),
  E("layout.worker.spawn", "call", "{workerUrl:string}",
    "The ELK Web Worker spawned so layout never freezes the UI thread."),
  E("layout.worker.message", "call", "{direction:'post'|'receive',bytes:int}",
    "The message round-trip to/from the Worker; serialization cost of the graph crossing the boundary."),
  E("layout.worker.terminate", "state", "{reason:'idle'|'superseded'|'unmount'|'error'}",
    "The Worker ACTUALLY torn down (elk.terminateWorker() called before this fires — the probe reports a real event). A superseded layout must cancel, not race."),
  E("layout.call.response", "call", "ElkResult",
    "The external-call response: the coordinates the engine returned (raw)."),
  E("layout.out.node", "node", "{id:string,x:number,y:number,width:int,height:int}",
    "THE coordinates ELK returns — every node's laid-out position. One per node (firehose)."),
  E("layout.out.edge", "edge", "{id:string,sections:[{startPoint,endPoint,bendPoints[]}]}",
    "Every edge's route/bendpoints returned. One per edge."),
  E("layout.out.edgeCount", "value", "{count:int}",
    "Edges the engine returned. Term #3 of the edge-set-equality chain — an engine that drops an edge is caught here."),
  E("layout.timing", "timing", "{wallNanos:int,nodeCount:int,edgeCount:int}",
    "Layout wall-clock (wallNanos ONLY, never used for ordering/assertions)."),
  E("layout.error", "error", "{message:string,elkInputEcho:object}",
    "Any thrown/rejected layout failure, with the offending input echoed."),
];
