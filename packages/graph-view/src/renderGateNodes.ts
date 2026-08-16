/**
 * S6 (headless half) — the NODE side of the render commit gate: per-node
 * render.* probes and the node-set equality assert
 *   {rendered node-set} === {schema node-set − logged cap} (+ expected ghosts).
 * Split from renderGate.ts (SUB200 restructure); the logic is verbatim.
 */

import type { ProbeBus } from "./probeBus";
import type { ApplyResult } from "./apply";
import type { CapDecision } from "./cap";
import type { GraphModel } from "./schema";
import { NodeSetViolation } from "./renderGateErrors";

const STAGE = "S6";

/** Emits the per-node probes + render.node.count, then enforces node-set
 *  equality (throws NodeSetViolation). Returns the render.node.count cause. */
export function gateNodes(
  model: GraphModel,
  cap: CapDecision,
  applied: ApplyResult,
  bus: ProbeBus,
): string {
  const { rfNodes } = applied;

  // ── per-node render probes ────────────────────────────────────────────────
  let lastNodeCause = applied.cause;
  for (const n of rfNodes) {
    lastNodeCause = bus.emit({
      probeId: "render.node", stage: STAGE, kind: "node",
      payload: {
        id: n.id, mode: n.data.mode,
        fillColor: n.data.paint.fillColor, outlineColor: n.data.paint.outlineColor,
        hatched: n.data.paint.fillHatched,
        ...(n.data.placeholder ? { placeholder: true } : {}),
      },
      causeId: applied.cause,
    });
    bus.emit({
      probeId: "render.node.mode", stage: STAGE, kind: "decision",
      payload: {
        id: n.id, mode: n.data.mode,
        reason: n.data.mode === "expanded"
          ? "expanded on focus/select under MAX_EXPANDED — Monaco slot reserved"
          : cap.mode === "full"
            ? "default light mode (cheap DOM); expands on focus/select"
            : `light forced: degrade mode is ${cap.mode}`,
      },
      causeId: lastNodeCause,
    });
  }
  const nodeCountCause = bus.emit({
    probeId: "render.node.count", stage: STAGE, kind: "value",
    payload: { count: rfNodes.length }, causeId: applied.cause,
  });

  // ── node-set equality: rendered == schema − capped (+ EXPECTED placeholder ghosts).
  // The placeholder term comes from what S3 declared, not from the rendered array
  // itself — a self-derived count could never miss an eaten ghost.
  const expectedPlaceholders = applied.expectedPlaceholderIds;
  const renderedPlaceholderIds = rfNodes.filter((n) => n.data.placeholder).map((n) => n.id);
  const withheldByCap = cap.droppedIds.length;
  const expectedRendered = model.nodes.length - withheldByCap + expectedPlaceholders.length;
  const missingGhosts = expectedPlaceholders.filter((id) => !renderedPlaceholderIds.includes(id));
  const nodesEqual = rfNodes.length === expectedRendered && missingGhosts.length === 0;
  bus.emit({
    probeId: "render.node.equality", stage: STAGE, kind: "decision",
    payload: {
      schemaNodes: model.nodes.length,
      renderedNodes: rfNodes.length,
      withheldByCap,
      placeholderNodes: expectedPlaceholders.length,
      equal: nodesEqual,
    },
    causeId: nodeCountCause,
  });
  if (!nodesEqual) {
    throw new NodeSetViolation(
      `render.node.equality violated: schema=${model.nodes.length} withheldByCap=${withheldByCap} ` +
      `expectedPlaceholders=${expectedPlaceholders.length} (missing ghosts: [${missingGhosts.join(",")}]) ` +
      `but rendered=${rfNodes.length} — a node vanished for a reason other than a logged cap`,
    );
  }
  return nodeCountCause;
}
