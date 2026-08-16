/**
 * S5 — Verdict / Gutter mapping.
 *
 * Two hard rules live here (transcript D5/D6):
 * (a) GREEN MAY NEVER BE FAKED — green renders ONLY when the schema FILL is a
 *     real compiler/kernel verdict (status green, non-empty source, provenance
 *     present + resolved:true) AND the server tier is CT. Otherwise unknown/blue, never green,
 *     and the block is logged loudly. Absence of diagnostics is not a verdict.
 * (b) OUTLINE is worst-case-wins over outline.worstOf in the frozen order
 *     red > amber > blue > definition > lemma > none/green; null renders
 *     "not yet computed", never green.
 *
 * decideFill/decideOutline are pure functions over (node, liveDiags, tier) so
 * they are unit-testable headless; painting goes through the RenderTracker.
 *
 * SUB200 restructure: the FILL decision body lives in ./fill-decision.ts, the
 * tooltip/legend in ./tooltip.ts, shared types in ./verdict-types.ts. This
 * module remains the public path and re-exports the historical surface.
 */

import type { ProbeBus, ProbeEvent } from "../probe/probe-bus.js";
import type { SchemaNode } from "../schema/schema.js";
import { WORST_TO_STATUS, worstOfVerdict } from "../schema/schema.js";
import type { DepthTier } from "../seams/capability.js";
import type { Decoration } from "../mount/adapter.js";
import type { DiagnosticRecord } from "../diagnostics/diagnostics.js";
import type { SpanIndex } from "../map/span-index.js";
import type { RenderTracker } from "../render/render.js";
import { ORDER_STRING, type OutlineDecision, type VerdictDecision } from "./verdict-types.js";
import { decideFillCore } from "./fill-decision.js";
import { emitLegendProbe, hoverTooltipCore, type VerdictTooltip } from "./tooltip.js";

export type { VerdictDecision, OutlineDecision } from "./verdict-types.js";

/**
 * Display mapping for worst-of vocabulary entries that aren't statuses (D6).
 * ASSEMBLY swap: now the CANONICAL worstTokenToStatus table (ruling 1:
 * definition→blue), re-exported from the verified-in-sync schema seam so this
 * cell's public surface keeps its historical export path.
 */
export { WORST_TO_STATUS } from "../schema/schema.js";

export class VerdictEngine {
  private probe: ProbeBus;
  private render: RenderTracker;
  private tier: DepthTier;
  private serverName: string;
  private lastDecisions = new Map<string, VerdictDecision>();
  /** causeId refs of each node's latest fill.decision — gutter paints chain to them. */
  private lastDecisionRefs = new Map<string, string>();
  private legendEmitted = false;

  constructor(probe: ProbeBus, render: RenderTracker, tier: DepthTier, serverName: string) {
    this.probe = probe;
    this.render = render;
    this.tier = tier;
    this.serverName = serverName;
  }

  setServerName(name: string): void {
    this.serverName = name;
  }

  /** Pure per-node FILL decision, fully probed with branches not taken. */
  decideFill(
    node: SchemaNode,
    liveDiags: DiagnosticRecord[],
    causeId: string | null,
  ): VerdictDecision {
    const { decision, decisionRef } = decideFillCore(this.probe, this.tier, node, liveDiags, causeId);
    this.lastDecisions.set(node.id, decision);
    this.lastDecisionRefs.set(node.id, decisionRef);
    return decision;
  }

  /** Pure OUTLINE decision: worst-case-wins over worstOf (frozen order). */
  decideOutline(node: SchemaNode, causeId: string | null): OutlineDecision {
    if (node.outline === null) {
      this.probe.emit(
        "editor.verdict.outline.null",
        { nodeId: node.id, reason: "outline-not-computed-yet" },
        causeId,
      );
      return {
        nodeId: node.id,
        worstOf: [],
        chosen: "(null)",
        displayedStatus: "not-yet-computed",
        order: ORDER_STRING,
      };
    }
    // An UNRECOGNIZED trust-base token ranks WORST (-1), not best: a
    // vocabulary entry this cell doesn't know cannot silently yield a green
    // ring (review finding: unknown vocab out-ranked green — now assembly
    // ruling 4, computed by the CANONICAL shared policy worstOfVerdict from
    // the verified-in-sync schema seam). It renders "unknown" and the
    // decision names the unrecognized tokens.
    const worstOf = [...node.outline.worstOf];
    const verdict = worstOfVerdict(worstOf);
    const unrecognizedVocab = verdict.unrecognized;
    const chosen = verdict.worstToken;
    const displayedStatus = verdict.status;
    this.probe.emit(
      "editor.verdict.outline.decision",
      {
        nodeId: node.id,
        worstOf,
        chosen,
        order: ORDER_STRING,
        displayedStatus,
        statusMapping: { ...WORST_TO_STATUS },
        unrecognizedVocab,
        schemaStatus: node.outline.status,
        recomputedMatchesSchema: node.outline.status === displayedStatus,
      },
      causeId,
    );
    return { nodeId: node.id, worstOf, chosen, displayedStatus, order: ORDER_STRING };
  }

  /**
   * Repaint FILL gutter + OUTLINE rings for every node in the index.
   * Returns the gutter frame probe (the "rendered" clock for latency chains).
   */
  paintAll(
    index: SpanIndex,
    diagsForNode: (nodeId: string) => DiagnosticRecord[],
    causeId: string | null,
  ): ProbeEvent {
    if (!this.legendEmitted) {
      emitLegendProbe(this.probe, causeId);
      this.legendEmitted = true;
    }
    const gutter: Decoration[] = [];
    const outline: Decoration[] = [];
    // Deterministic paint order: by byteStart then id.
    const nodes = index
      .allNodes()
      .sort((a, b) => a.span.byteStart - b.span.byteStart || (a.node.id < b.node.id ? -1 : 1));
    for (const { node, monacoRange } of nodes) {
      const fill = this.decideFill(node, diagsForNode(node.id), causeId);
      const paintProbe = this.probe.emit(
        "editor.verdict.gutter.paint",
        {
          nodeId: node.id,
          lineNumber: monacoRange.startLine,
          glyphClass: `pg-fill-${fill.displayedStatus}`,
          color: fill.displayedStatus,
          status: fill.displayedStatus,
        },
        this.lastDecisionRefs.get(node.id) ?? causeId,
      );
      gutter.push({
        key: node.id,
        range: { ...monacoRange, endLine: monacoRange.startLine, endColumn: monacoRange.startColumn },
        style: `pg-fill-${fill.displayedStatus}`,
        hoverText: `${node.kind} ${node.name}: ${fill.displayedStatus} (${fill.reason})`,
      });

      const out = this.decideOutline(node, this.probe.ref(paintProbe));
      this.probe.emit(
        "editor.verdict.outline.paint",
        {
          nodeId: node.id,
          ringColor: out.displayedStatus === "not-yet-computed" ? "grey" : out.displayedStatus,
          status: out.displayedStatus,
        },
        this.probe.ref(paintProbe),
      );
      outline.push({
        key: node.id,
        range: { ...monacoRange, endLine: monacoRange.startLine, endColumn: monacoRange.startColumn },
        style: `pg-outline-${out.displayedStatus}`,
      });
    }
    this.render.paint("outline", outline, "decoration", causeId);
    return this.render.paint("gutter", gutter, "decoration", causeId);
  }

  /** Provenance tooltip — every rendered verdict names where it came from. */
  hoverTooltip(node: SchemaNode, causeId: string | null = null): VerdictTooltip {
    return hoverTooltipCore(
      this.probe,
      this.tier,
      this.serverName,
      this.lastDecisions,
      node,
      causeId,
    );
  }

  decisions(): VerdictDecision[] {
    return [...this.lastDecisions.values()];
  }

  snapshot(): unknown {
    return { tier: this.tier, serverName: this.serverName, decisions: this.decisions() };
  }
}
