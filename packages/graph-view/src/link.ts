/**
 * S7 — LINK. Brushing-and-linking via Tree 4's shared-ID event bus.
 * id OUT: node click/hover → bus. id IN: bus select/hover → highlight + center.
 * An unknown incoming id is a logged branch, never a crash. Expand-to-Monaco is
 * cap-checked against MAX_EXPANDED and refusals are logged, never silent.
 *
 * SUB200 restructure: the controller/hooks contracts live in linkTypes.ts and
 * the incoming (bus → view) handlers in linkIncoming.ts; this facade keeps
 * wireBrushing (subscription, selection state, the outgoing controller).
 * Importers of "./link" are unchanged.
 */

import type { ProbeBus } from "./probeBus";
import type { GraphEventBusWithHover } from "./eventBus";
import type { CapDecision } from "./cap";
import type { GraphModel } from "./schema";
import type { LinkController, LinkHooks } from "./linkTypes";
import { makeIncomingHoverHandler, makeIncomingSelectHandler } from "./linkIncoming";

export type { Viewport, LinkController, LinkHooks } from "./linkTypes";

const STAGE = "S7";

export function wireBrushing(
  model: GraphModel,
  eventBus: GraphEventBusWithHover,
  bus: ProbeBus,
  cap: CapDecision,
  hooks: LinkHooks = {},
  /** Cap-checked initial expansions granted by the cell — the controller's budget covers both paths. */
  initialExpanded: ReadonlySet<string> = new Set(),
): LinkController {
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  let selectedId: string | null = null;
  let hoveredInId: string | null = null;
  const multiSelected = new Set<string>();
  const expandedIds = new Set<string>(initialExpanded);

  // The subscribe probe reports what is ACTUALLY subscribed.
  const hoverSupported = typeof eventBus.onHover === "function";
  const subscribeCause = bus.emit({
    probeId: "link.bus.subscribe", stage: STAGE, kind: "call",
    payload: { busId: "tree4.event-bus", eventTypes: hoverSupported ? ["select", "hover"] : ["select"] },
    causeId: cap.cause,
  });

  const setSelection = (next: string | null, causeId: string) => {
    const previous = selectedId;
    selectedId = next;
    bus.emit({
      probeId: "link.select.state", stage: STAGE, kind: "state",
      payload: { selectedId: next, previousId: previous },
      causeId,
    });
    hooks.onSelectionChange?.(selectedId, multiSelected);
  };

  const incomingCtx = {
    bus, nodeIds, subscribeCause, hooks, setSelection,
    setHoveredIn: (nodeId: string | null) => {
      hoveredInId = nodeId;
      hooks.onHoverIn?.(hoveredInId);
    },
  };
  const offSelect = eventBus.on("select", makeIncomingSelectHandler(incomingCtx));

  let offHover: (() => void) | null = null;
  if (eventBus.onHover) {
    offHover = eventBus.onHover(makeIncomingHoverHandler(incomingCtx));
  }

  const controller: LinkController = {
    clickNode(nodeId, opts) {
      const outCause = bus.emit({
        probeId: "link.select.out", stage: STAGE, kind: "output",
        payload: { nodeId, source: "graph", trigger: "click" },
        causeId: null, // root of a user-interaction causal chain
      });
      if (opts?.multi) {
        const removed = multiSelected.has(nodeId);
        if (removed) multiSelected.delete(nodeId);
        else multiSelected.add(nodeId);
        bus.emit({
          probeId: "link.multiSelect", stage: STAGE, kind: "state",
          payload: {
            selectedIds: [...multiSelected],
            ...(removed ? { removed: nodeId } : { added: nodeId }),
          },
          causeId: outCause,
        });
      } else {
        multiSelected.clear();
        multiSelected.add(nodeId);
        setSelection(nodeId, outCause);
      }
      const evt = { type: "select" as const, nodeId, source: "graph" as const };
      bus.emit({ probeId: "link.bus.emit", stage: STAGE, kind: "call", payload: evt, causeId: outCause });
      eventBus.emit(evt);
    },

    hoverNode(nodeId) {
      const outCause = bus.emit({
        probeId: "link.hover.out", stage: STAGE, kind: "output",
        payload: { nodeId, source: "graph", trigger: "hover" },
        causeId: null,
      });
      if (eventBus.emitHover) {
        const evt = { type: "hover" as const, nodeId, source: "graph" as const };
        bus.emit({ probeId: "link.bus.emit", stage: STAGE, kind: "call", payload: evt, causeId: outCause });
        eventBus.emitHover(evt);
      } else {
        // Degradation to select-only linking is visible on the stream, not silent.
        bus.emit({
          probeId: "link.hover.unsupported", stage: STAGE, kind: "branch",
          payload: { nodeId, reason: "Tree 4 bus lacks hover support — soft-brush NOT delivered; select-only linking" },
          causeId: outCause,
        });
      }
    },

    requestExpand(nodeId) {
      const capExpanded = cap.config.maxExpanded;
      // Degraded modes disable expansion entirely (the banner said so).
      const underCeiling = expandedIds.size < capExpanded && cap.mode === "full";
      const granted = underCeiling && nodeIds.has(nodeId);
      const reqCause = bus.emit({
        probeId: "link.expand.request", stage: STAGE, kind: "decision",
        payload: { nodeId, currentExpanded: expandedIds.size, maxExpanded: capExpanded, granted },
        causeId: null,
      });
      if (!granted) {
        bus.emit({
          probeId: "link.expand.refused", stage: STAGE, kind: "branch",
          payload: {
            nodeId,
            reason: cap.mode !== "full"
              ? `expansion disabled in degrade mode ${cap.mode}`
              : expandedIds.size >= capExpanded
                ? "MAX_EXPANDED reached"
                : "node not in this graph",
            maxExpanded: capExpanded,
          },
          causeId: reqCause,
        });
        return false;
      }
      expandedIds.add(nodeId);
      hooks.onExpandChange?.(expandedIds);
      return true;
    },

    collapseNode(nodeId) {
      if (expandedIds.delete(nodeId)) hooks.onExpandChange?.(expandedIds);
    },

    get selectedId() { return selectedId; },
    get multiSelected() { return multiSelected; },
    get expandedIds() { return expandedIds; },
    get hoveredInId() { return hoveredInId; },

    dispose() {
      offSelect();
      offHover?.();
    },
  };

  return controller;
}
