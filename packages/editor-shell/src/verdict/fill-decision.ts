/**
 * S5 per-node FILL decision (SUB200 restructure: split from
 * VerdictEngine.decideFill, logic and every probe verbatim). Pure over
 * (node, liveDiags, tier); the engine stores the returned decision + ref.
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { FillStatus, SchemaNode } from "../schema/schema.js";
import type { DepthTier } from "../seams/capability.js";
import type { DiagnosticRecord } from "../diagnostics/diagnostics.js";
import { FILL_RANK, type VerdictDecision } from "./verdict-types.js";

/** Pure per-node FILL decision, fully probed with branches not taken. */
export function decideFillCore(
  probe: ProbeBus,
  tier: DepthTier,
  node: SchemaNode,
  liveDiags: DiagnosticRecord[],
  causeId: string | null,
): { decision: VerdictDecision; decisionRef: string } {
  const inputProbe = probe.emit(
    "editor.verdict.node.input",
    {
      nodeId: node.id,
      schemaFill: { ...node.fill },
      schemaOutline: node.outline ? { ...node.outline } : null,
      tier,
      liveDiagnostics: liveDiags.map((d) => d.diagId),
    },
    causeId,
  );
  const inputRef = probe.ref(inputProbe);

  // Live LSP contribution: errors → red, warnings → amber, none → none.
  // Live diagnostics can only push DOWN; absence of errors is not a verdict.
  const liveErrors = liveDiags.filter((d) => d.severity === "error");
  const liveWarnings = liveDiags.filter((d) => d.severity === "warning");
  const liveStatus: FillStatus | null =
    liveErrors.length > 0 ? "red" : liveWarnings.length > 0 ? "amber" : null;

  // Green-honesty guard — THE load-bearing branch.
  const wouldBeGreen = node.fill.status === "green";
  const sourceIsRealVerdict = node.fill.source.trim().length > 0;
  const provenancePresent = !!node.provenance?.tier && !!node.provenance?.extractor;
  // provenance.resolved === false means the extractor could NOT bind this
  // verdict's provenance — an explicitly unresolved claim never backs green.
  const provenanceResolved = node.provenance?.resolved === true;
  const greenAllowed =
    wouldBeGreen && sourceIsRealVerdict && provenancePresent && provenanceResolved && tier === "CT";
  const guardProbe = probe.emit(
    "editor.verdict.green.guard",
    {
      nodeId: node.id,
      wouldBeGreen,
      greenAllowed,
      tier,
      source: node.fill.source,
      reason: !wouldBeGreen
        ? "schema fill is not green; guard not in play"
        : greenAllowed
          ? "schema fill green from a real compiler verdict at tier CT — truth is permitted"
          : tier !== "CT"
            ? `tier ${tier} is not compiler truth`
            : !sourceIsRealVerdict
              ? "fill.source is empty — not a real verdict"
              : !provenancePresent
                ? "provenance missing — anonymous verdicts are forbidden"
                : "provenance.resolved is false — an unresolved claim cannot back green",
    },
    inputRef,
  );
  const guardRef = probe.ref(guardProbe);

  let displayed: FillStatus;
  let source: VerdictDecision["source"];
  let reason: string;
  let notChosen: string;

  // Live wins a disagreement ONLY strictly downward (toward red). A live
  // warning on a schema-red node loses: softening red to amber would be a
  // move toward green, masking a recorded compiler failure.
  const liveWinsDown =
    liveStatus !== null &&
    liveStatus !== node.fill.status &&
    FILL_RANK[liveStatus] < FILL_RANK[node.fill.status];

  if (liveStatus !== null && liveStatus !== node.fill.status) {
    probe.emit(
      "editor.verdict.conflict",
      {
        nodeId: node.id,
        schemaStatus: node.fill.status,
        liveStatus,
        winner: liveWinsDown ? "lsp-live" : "schema-fill",
        reason: liveWinsDown
          ? "live compiler diagnostics override a stale schema verdict toward red/amber; never toward green past the honesty guard"
          : "live diagnostics may only push DOWN — a live warning cannot soften a recorded worse verdict",
      },
      guardRef,
    );
  }

  if (liveWinsDown) {
    displayed = liveStatus!;
    source = "lsp-live";
    reason = `live ${liveStatus} diagnostics (${liveErrors.length} error(s), ${liveWarnings.length} warning(s))`;
    notChosen = `schema-fill ${node.fill.status} (stale against live diagnostics)`;
  } else if (liveStatus !== null && liveStatus === node.fill.status) {
    displayed = liveStatus;
    source = "lsp-live";
    reason = "live diagnostics agree with schema fill";
    notChosen = "none";
  } else if (node.fill.status === "green") {
    if (greenAllowed) {
      displayed = "green";
      source = "schema-fill";
      reason = `real verdict from ${node.fill.source} at tier CT`;
      notChosen = "lsp-live (no live diagnostics for this node)";
    } else {
      displayed = node.origin === "given" ? "blue" : "unknown";
      source = "none";
      reason = "would-be green blocked by honesty guard";
      notChosen = "schema-fill green (blocked: green may never be faked)";
      probe.emit(
        "editor.verdict.green.blocked",
        {
          nodeId: node.id,
          downgradedTo: displayed,
          tier,
          reason: "green-may-never-be-faked",
        },
        guardRef,
      );
    }
  } else {
    displayed = node.fill.status;
    source = "schema-fill";
    reason = `schema fill ${node.fill.status} carried through`;
    notChosen = "lsp-live (no live diagnostics for this node)";
  }

  // Origin treatment: given=external→blue, assumed=debt→amber, checked→verdict
  // color. Debt must stay visually distinct from a real verdict; live red
  // stays visible regardless (errors are never hidden by origin styling).
  const treatment =
    node.origin === "given" ? "blue" : node.origin === "assumed" ? "amber" : "verdict-color";
  probe.emit(
    "editor.verdict.origin.map",
    {
      nodeId: node.id,
      origin: node.origin,
      treatment,
      reason:
        node.origin === "given"
          ? "external/given renders blue"
          : node.origin === "assumed"
            ? "assumed is DEBT — amber, never a verdict color, never green"
            : "checked renders its verdict color",
    },
    guardRef,
  );
  if (node.origin === "given" && displayed !== "red" && displayed !== "amber") {
    displayed = "blue";
    source = "schema-fill";
    reason += "; origin given → blue treatment";
  } else if (node.origin === "assumed" && displayed !== "red") {
    displayed = "amber";
    reason += "; origin assumed → amber debt treatment";
  }

  if (node.fill.status === "unknown" && displayed === "unknown") {
    probe.emit(
      "editor.verdict.unknown.render",
      { nodeId: node.id, status: "unknown", renderedAs: "unknown" },
      guardRef,
    );
  }

  const decision: VerdictDecision = {
    nodeId: node.id,
    displayedStatus: displayed,
    source,
    tier,
    greenAllowed,
    reason,
  };
  const decisionProbe = probe.emit(
    "editor.verdict.fill.decision",
    { ...decision, notChosen },
    guardRef,
  );
  // Chain: gutter.paint → fill.decision → green.guard → node.input, so a
  // green glyph's causeChain always reaches the guard that permitted it
  // (review finding: paints were causally disconnected from the guard).
  return { decision, decisionRef: probe.ref(decisionProbe) };
}
