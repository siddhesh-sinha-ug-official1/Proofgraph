/**
 * S7 — LINK, incoming half (id IN: bus select/hover → highlight + center).
 * The bus loops emissions back to ALL subscribers, including this view — a
 * local click is not an editor selection: filtered by source, probed, never
 * silent. An unknown incoming id is a logged branch, never a crash. Split from
 * link.ts (SUB200 restructure); the logic is verbatim, closed over an explicit
 * context instead of wireBrushing()'s locals.
 */

import type { ProbeBus } from "./probeBus";
import type { LinkHooks } from "./linkTypes";

const STAGE = "S7";

export interface IncomingLinkContext {
  bus: ProbeBus;
  nodeIds: ReadonlySet<string>;
  subscribeCause: string;
  hooks: LinkHooks;
  setSelection: (next: string | null, causeId: string) => void;
  setHoveredIn: (nodeId: string | null) => void;
}

export function makeIncomingSelectHandler(ctx: IncomingLinkContext) {
  const { bus, nodeIds, subscribeCause, hooks, setSelection } = ctx;
  return (evt: { nodeId: string; source: string }): void => {
    // The bus loops emissions back to ALL subscribers, including this view. A local
    // click is not an editor selection: filtered by source, probed, never silent.
    // (A membrane round can replace the "graph" string with a per-view origin token
    // so two graph views on one bus still link to each other.)
    if (evt.source === "graph") {
      bus.emit({
        probeId: "link.echo.ignored", stage: STAGE, kind: "branch",
        payload: { type: "select", nodeId: evt.nodeId, source: evt.source, reason: "own emission looped back by the bus — not an editor selection" },
        causeId: subscribeCause,
      });
      return;
    }
    const inCause = bus.emit({
      probeId: "link.select.in", stage: STAGE, kind: "input",
      payload: { nodeId: evt.nodeId, source: evt.source },
      causeId: subscribeCause,
    });
    const present = nodeIds.has(evt.nodeId);
    const resolveCause = bus.emit({
      probeId: "link.select.resolve", stage: STAGE, kind: "decision",
      payload: { nodeId: evt.nodeId, present },
      causeId: inCause,
    });
    if (!present) {
      bus.emit({
        probeId: "link.select.unknownId", stage: STAGE, kind: "branch",
        payload: { nodeId: evt.nodeId, reason: "selected id not in this graph — no-op, not a crash" },
        causeId: resolveCause,
      });
      return;
    }
    // The centered/highlighted booleans report what actually happened: true only
    // when a DOM centering hook is bound and ran. Headless/unmounted views say so.
    const hook = hooks.centerAndHighlight;
    const viewport = hook?.(evt.nodeId) ?? { x: 0, y: 0, zoom: 1 };
    const centerCause = bus.emit({
      probeId: "link.select.center", stage: STAGE, kind: "decision",
      payload: {
        nodeId: evt.nodeId, centered: !!hook, highlighted: !!hook, viewport,
        ...(hook ? {} : { reason: "no DOM centering hook bound — selection updated without centering" }),
      },
      causeId: resolveCause,
    });
    setSelection(evt.nodeId, centerCause);
  };
}

export function makeIncomingHoverHandler(ctx: IncomingLinkContext) {
  const { bus, nodeIds, subscribeCause, setHoveredIn } = ctx;
  return (evt: { nodeId: string; source: string }): void => {
    if (evt.source === "graph") {
      bus.emit({
        probeId: "link.echo.ignored", stage: STAGE, kind: "branch",
        payload: { type: "hover", nodeId: evt.nodeId, source: evt.source, reason: "own emission looped back by the bus — not an editor hover" },
        causeId: subscribeCause,
      });
      return;
    }
    bus.emit({
      probeId: "link.hover.in", stage: STAGE, kind: "input",
      payload: { nodeId: evt.nodeId, source: evt.source },
      causeId: subscribeCause,
    });
    // Highlight without centering or changing selection.
    setHoveredIn(nodeIds.has(evt.nodeId) ? evt.nodeId : null);
  };
}
