/**
 * The cell: orchestrates S0→S7, owns the probe bus, exports the four introspection
 * entry points (Probe Density Contract §3–§4): probeCatalog / dump / history / tap.
 * Nothing computes silently — every stage emits through the shared bus.
 */

import { ProbeBus, type ProbeEvent } from "./probeBus";
import { KNOWN_PROBE_IDS, probeCatalog, type ProbeCatalogEntry } from "./probeCatalog";
import { ingest, type IngestResult } from "./ingest";
import { capCheck, DEFAULT_CAP_CONFIG, type CapConfig, type CapDecision } from "./cap";
import { paintVerdicts, type VerdictResult } from "./verdict";
import { buildElkGraph, type EdgeEncoder, type LayoutInResult } from "./layoutIn";
import { layout, type EngineName, type LayoutOutput } from "./layout";
import { applyCoords, type ApplyResult, type RFEdge, type RFNode } from "./apply";
import { renderGate } from "./renderGate";
import { wireBrushing, type LinkController, type LinkHooks } from "./link";
import type { GraphEventBusWithHover } from "./eventBus";

export interface RunOptions {
  capConfig?: Partial<CapConfig>;
  engine?: EngineName;
  workerFactory?: (() => Worker) | null;
  /** Node ids to lay out expanded (Monaco slot box reserved). Normally empty on first run. */
  expandedIds?: ReadonlySet<string>;
  /** Test seam: the cheap edge-encoding connector (Mermaid-`&` failure class F1). */
  edgeEncoder?: EdgeEncoder;
  linkHooks?: LinkHooks;
  sourceLabel?: string;
  /** Inject a bus so probes survive a thrown gate violation (negative tests read them). */
  bus?: ProbeBus;
}

export interface GraphViewCell {
  probeCatalog(): ProbeCatalogEntry[];
  dump(): CellDump;
  history(): ProbeEvent[];
  tap(probeId: string, fn: (e: ProbeEvent) => void): () => void;
  bus: ProbeBus;
  rfNodes: RFNode[];
  rfEdges: RFEdge[];
  cap: CapDecision;
  controller: LinkController;
  engine: LayoutOutput["engine"];
  banner: CapDecision["banner"];
  /** Mutable — the DOM layer late-binds centerAndHighlight etc. here; S7 reads at call time. */
  linkHooks: LinkHooks;
}

export interface CellDump {
  model: IngestResult["model"];
  rejectedNodes: IngestResult["rejectedNodes"];
  rejectedEdges: IngestResult["rejectedEdges"];
  cap: CapDecision;
  banner: CapDecision["banner"];
  paints: Record<string, VerdictResult["paints"] extends Map<string, infer V> ? V : never>;
  verdictCounts: VerdictResult["counts"];
  outlineCounts: VerdictResult["outlineCounts"];
  elkIn: LayoutInResult["elkGraph"];
  elkOut: LayoutOutput["result"];
  rfNodes: RFNode[];
  rfEdges: RFEdge[];
  missingCoordIds: ApplyResult["missingCoordIds"];
  engine: LayoutOutput["engine"];
  selection: { selectedId: string | null; multiSelected: string[]; expandedIds: string[] };
  catalogSize: number;
}

export async function runGraphView(
  schemaJson: unknown,
  eventBus: GraphEventBusWithHover,
  opts: RunOptions = {},
): Promise<GraphViewCell> {
  const bus = opts.bus ?? new ProbeBus(KNOWN_PROBE_IDS);
  const capConfig: CapConfig = { ...DEFAULT_CAP_CONFIG, ...opts.capConfig };
  const engineName: EngineName = opts.engine ?? "elkjs";
  const expandedIds = opts.expandedIds ?? new Set<string>();

  // S0 — INGEST
  const ing = ingest(schemaJson, bus, opts.sourceLabel ?? "schema.json");
  // S1 — CAP (told how many initial expansions were requested, so overExpanded measures)
  const cap = capCheck(ing.model, bus, capConfig, expandedIds.size);

  // Admission of the requested initial expansion set — the SAME ceiling and the SAME
  // probes as interactive expansion. There is no un-cap-checked side door into
  // expanded mode: every requested id gets a link.expand.request decision, every
  // refusal a link.expand.refused branch, and only the granted set reaches layout.
  const nodeIdSet = new Set(ing.model.nodes.map((n) => n.id));
  const grantedExpanded = new Set<string>();
  for (const id of expandedIds) {
    const present = nodeIdSet.has(id);
    const underCeiling = grantedExpanded.size < capConfig.maxExpanded;
    const granted = present && underCeiling && cap.mode === "full";
    const reqCause = bus.emit({
      probeId: "link.expand.request", stage: "S7", kind: "decision",
      payload: { nodeId: id, currentExpanded: grantedExpanded.size, maxExpanded: capConfig.maxExpanded, granted, trigger: "initial" },
      causeId: cap.cause,
    });
    if (granted) {
      grantedExpanded.add(id);
    } else {
      bus.emit({
        probeId: "link.expand.refused", stage: "S7", kind: "branch",
        payload: {
          nodeId: id,
          reason: !present
            ? "node not in this graph"
            : cap.mode !== "full"
              ? `expansion disabled in degrade mode ${cap.mode}`
              : "MAX_EXPANDED reached",
          maxExpanded: capConfig.maxExpanded,
        },
        causeId: reqCause,
      });
    }
  }

  // S2 — VERDICT
  const verdict = paintVerdicts(ing.model, bus, cap.cause);
  // S3 — LAYOUT-IN (only the GRANTED expansion set reaches layout)
  const layoutIn = buildElkGraph(ing.model, cap, grantedExpanded, bus, verdict.cause, opts.edgeEncoder ?? ((e) => e), engineName);
  // S4 — LAYOUT (the one external call)
  const laid = await layout(layoutIn.elkGraph, bus, layoutIn.cause, {
    engine: engineName,
    workerFactory: opts.workerFactory ?? null,
  });
  // S5 — APPLY
  const applied = applyCoords(ing.model, verdict.paints, layoutIn, laid.result, bus, laid.cause);
  // S6 — RENDER GATE (throws before mount on an eaten/phantom edge or a lost node)
  const gated = renderGate(ing.model, cap, applied, bus);
  // S7 — LINK (hooks object stays mutable so the DOM layer can late-bind centering;
  // the controller is SEEDED with the granted initial expansions so its budget covers
  // both paths and collapseNode works on pre-expanded nodes)
  const linkHooks: LinkHooks = opts.linkHooks ?? {};
  const controller = wireBrushing(ing.model, eventBus, bus, cap, linkHooks, grantedExpanded);

  const dump = (): CellDump => ({
    model: ing.model,
    rejectedNodes: ing.rejectedNodes,
    rejectedEdges: ing.rejectedEdges,
    cap,
    banner: cap.banner,
    paints: Object.fromEntries(verdict.paints) as CellDump["paints"],
    verdictCounts: verdict.counts,
    outlineCounts: verdict.outlineCounts,
    elkIn: layoutIn.elkGraph,
    elkOut: laid.result,
    rfNodes: gated.rfNodes,
    rfEdges: gated.rfEdges,
    missingCoordIds: applied.missingCoordIds,
    engine: laid.engine,
    selection: {
      selectedId: controller.selectedId,
      multiSelected: [...controller.multiSelected],
      expandedIds: [...controller.expandedIds],
    },
    catalogSize: probeCatalog().length,
  });

  return {
    probeCatalog,
    dump,
    history: () => bus.history(),
    tap: (probeId, fn) => bus.tap(probeId, fn),
    bus,
    rfNodes: gated.rfNodes,
    rfEdges: gated.rfEdges,
    cap,
    controller,
    engine: laid.engine,
    banner: cap.banner,
    linkHooks,
  };
}
