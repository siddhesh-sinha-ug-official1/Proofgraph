/**
 * Probe-catalog sections for stages S5 (APPLY), S6 (RENDER — the Mermaid-&
 * assertion lives here), S7 (LINK — brushing-and-linking) and W (THE WALL,
 * Phase 1). Entries follow the §6 enumeration plus the logged local/Phase-1
 * additions (same probeIds, same order); payloadType strings on render.node /
 * render.virtualize / link.expand.request were corrected in the claim-audit
 * round to spell every field the code actually emits. probeCatalog.ts
 * concatenates them in stage order.
 */

import { E, type ProbeCatalogEntry } from "./catalogKit";

// ── Stage S5 — APPLY ───────────────────────────────────────────────────────
export const CATALOG_S5: ProbeCatalogEntry[] = [
  E("apply.node.position", "node", "{id:string,position:{x,y}}",
    "The x/y written onto each RFNode."),
  E("apply.node.missingCoord", "branch", "{id:string,reason:string}",
    "A node that had NO coordinate returned (would render at 0,0 — a real bug class). Caught, not silent."),
  E("apply.edge.route", "edge", "{id:string,points:[{x,y}]}",
    "The route applied to each RFEdge."),
  E("apply.output", "output", "{rfNodes:int,rfEdges:int}",
    "The positioned RF node/edge arrays handed to React Flow."),
];

// ── Stage S6 — RENDER (the Mermaid-& assertion lives here) ─────────────────
export const CATALOG_S6: ProbeCatalogEntry[] = [
  E("render.node", "node", "{id,mode,fillColor,outlineColor,hatched:bool,placeholder?:true}",
    "Every React Flow node actually rendered, with its final paint (placeholder ghosts flagged). One per node (firehose)."),
  E("render.node.mode", "decision", "{id:string,mode:'light'|'expanded',reason:string}",
    "Light-vs-expanded decision per node (default light; expanded on focus/select under MAX_EXPANDED)."),
  E("render.node.count", "value", "{count:int}",
    "Rendered node total."),
  E("render.node.equality", "decision", "{schemaNodes,renderedNodes,withheldByCap,placeholderNodes,equal:bool}",
    "ASSERT rendered node-set == (schema node-set − capped) (+ synthesized placeholder ghosts, accounted separately). A node that vanished for any reason other than a logged cap is a defect."),
  E("render.edge", "edge", "{id,source,target,resolved:bool,style:'solid'|'lead-dashed'}",
    "Every React Flow edge actually rendered. One per edge (firehose)."),
  E("render.edge.count", "value", "{count:int}",
    "Rendered edge total. Term #4 of the edge-set-equality chain."),
  E("render.edge.equality", "decision", "{schemaEdgeIds[],withheldEdgeIds[],renderedEdgeIds[],equal:bool,eaten[],phantom[]}",
    "THE Mermaid-& ASSERTION: full schema edge-id SET (with cap-withheld edges listed explicitly, never hidden) vs rendered edge-id SET, duplicate-aware. Must be equal:true with eaten/phantom empty."),
  E("render.edge.eaten", "error", "{edgeId,srcId,dstId,kind}",
    "One event per silently-dropped edge — the exact failure class: the cheap edge-encoding connector silently eats an edge."),
  E("render.edge.phantom", "error", "{edgeId:string}",
    "One event per edge rendered that was never in the schema."),
  E("render.edge.leadGuard", "branch", "{edgeId,resolved:false,style:'lead-dashed',reason:string}",
    "Fired for every resolved=false edge, proving it was styled as a lead and NOT promoted to a solid edge."),
  E("render.viewport", "state", "{x:number,y:number,zoom:number}",
    "The current pan/zoom viewport (the frame every rendered coordinate is read against)."),
  E("render.virtualize", "decision", "{inViewport:int,culled:int,cullingOn:bool,domEdges?:int,modelEdges?:int}",
    "With onlyRenderVisibleElements on: mounted vs culled counts (the post-mount DOM reconciliation adds domEdges/modelEdges). Culled nodes are STILL in the model — never mistaken for capped/dropped."),
  E("render.memo", "value", "{nodeId:string,memoHit:bool}",
    "React.memo hit/miss per node component. A storm of misses is the DOM-ceiling perf smell."),
  E("render.timing", "timing", "{wallNanos:int,nodeCount:int}",
    "Render wall-clock (wallNanos only)."),
];

// ── Stage S7 — LINK (brushing-and-linking; id in / id out) ─────────────────
export const CATALOG_S7: ProbeCatalogEntry[] = [
  E("link.bus.subscribe", "call", "{busId:string,eventTypes:string[]}",
    "The subscription placed on Tree 4's shared-ID event bus. eventTypes lists what was ACTUALLY subscribed (['select'] or ['select','hover'])."),
  E("link.echo.ignored", "branch", "{type:string,nodeId:string,source:string,reason:string}",
    "The bus looped this cell's own emission back; the incoming handler ignored it (a local click is not an editor selection). Filtered by source, probed, never silent."),
  E("link.hover.unsupported", "branch", "{nodeId:string,reason:string}",
    "The Tree 4 bus lacks hover support — the soft-brush was NOT delivered; linking degrades to select-only, out loud."),
  E("link.select.out", "output", "{nodeId:string,source:'graph',trigger:'click'|'programmatic'}",
    "id OUT: a node was selected in the graph; its shared id emitted to the bus (brush → linked editor)."),
  E("link.bus.emit", "call", "{type,nodeId,source}",
    "The exact event object handed to bus.emit(...) — the raw outbound bus call."),
  E("link.select.in", "input", "{nodeId:string,source:string}",
    "id IN: the bus delivered a select for a node id (editor → linked graph)."),
  E("link.select.resolve", "decision", "{nodeId:string,present:bool}",
    "Is the incoming id present in THIS graph?"),
  E("link.select.center", "decision", "{nodeId,centered:bool,highlighted:bool,viewport:{x,y,zoom},reason?:string}",
    "The highlight + center-on action for a present id. centered/highlighted are TRUE only when a DOM centering hook actually ran; headless/unmounted views report false with a reason."),
  E("link.select.unknownId", "branch", "{nodeId:string,reason:string}",
    "The branch for an incoming id this graph does not contain. Names the failure class and refuses to crash."),
  E("link.select.state", "state", "{selectedId:string|null,previousId:string|null}",
    "The selection state transition (for deterministic causal replay of a brushing session)."),
  E("link.expand.request", "decision", "{nodeId,currentExpanded:int,maxExpanded:int,granted:bool,trigger?:'initial'}",
    "An expand-to-Monaco request, cap-checked against MAX_EXPANDED (trigger:'initial' marks the cell's admission of a requested initial expansion set)."),
  E("link.expand.slot", "state", "{nodeId,slotMounted:bool,slotSelector:string}",
    "The empty Monaco slot mounted in the expanded node (Monaco itself mounts here in a later round)."),
  E("link.expand.refused", "branch", "{nodeId:string,reason:string,maxExpanded:int}",
    "Expand refused at the Monaco ceiling — logged, never silent."),
  E("link.hover.out", "output", "{nodeId:string,source:'graph',trigger:'hover'}",
    "Brushing on hover: a soft-brush id emitted to the bus so the linked editor can pre-highlight."),
  E("link.hover.in", "input", "{nodeId:string,source:string}",
    "An incoming hover-brush from the editor; highlights without centering or changing selection."),
  E("link.multiSelect", "state", "{selectedIds:string[],added?:string,removed?:string}",
    "The multi-selection set (shift/ctrl-click) and each add/remove transition, so a brushed SET round-trips."),
];

// ── Stage W — THE WALL (Phase 1, graph-view-wall/1.0.0) ────────────────────
export const CATALOG_W: ProbeCatalogEntry[] = [
  E("wall.construct", "call", "{wallVersion:string,schemaVersion:'v0',schemaHash:string,capConfigOverridden:bool}",
    "createGraphViewWall() entered: the wall's carried identity (WALL_VERSION + the schema pin it stands on) probed before anything runs."),
  E("wall.pin.assert", "decision", "{ok:bool,carriedVersion:string,pinnedVersion:string,carriedHash:string,reason?:string}",
    "The construction-time schema-PIN assert (WALL-CONVENTIONS rule 4): the wall's carried pin vs the canonical gen/pin.ts constants; ok:false refuses construction — failure-class=schema-pin-mismatch."),
  E("wall.face.result", "output", "{wallVersion:string,nodes:int,edges:int,leads:int,engine:string,capMode:'full'|'light-only'|'refuse',bannerShown:bool}",
    "What the wall DECLARED to its neighbor (rendered node/edge/lead counts, engine, cap mode + banner). The conformance gate holds this against the pins — declared may never diverge from probed."),
  E("wall.face.reject", "error", "{failureClass:string,reason:string}",
    "The wall refused, with the NAMED failure class (schema-pin-mismatch / envelope-rejected, or a propagated cell violation class) — a refusal is on the stream, never silent."),
];
