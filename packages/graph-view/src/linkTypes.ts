/**
 * S7 — LINK shared shapes: the controller/hooks contracts for brushing-and-
 * linking. Split from link.ts (SUB200 restructure); link.ts re-exports
 * everything here, so importers of "./link" are unchanged.
 */

export interface Viewport { x: number; y: number; zoom: number }

export interface LinkController {
  /** id OUT: a click in the graph. */
  clickNode(nodeId: string, opts?: { multi?: boolean }): void;
  /** id OUT: a hover in the graph (soft brush). */
  hoverNode(nodeId: string): void;
  /** Expand-to-Monaco request, cap-checked. Returns whether it was granted. */
  requestExpand(nodeId: string): boolean;
  collapseNode(nodeId: string): void;
  readonly selectedId: string | null;
  readonly multiSelected: ReadonlySet<string>;
  readonly expandedIds: ReadonlySet<string>;
  readonly hoveredInId: string | null;
  dispose(): void;
}

export interface LinkHooks {
  /** Injected by the DOM layer; headless tests get the recording default. */
  centerAndHighlight?: (nodeId: string) => Viewport;
  onSelectionChange?: (selectedId: string | null, multi: ReadonlySet<string>) => void;
  onExpandChange?: (expandedIds: ReadonlySet<string>) => void;
  onHoverIn?: (nodeId: string | null) => void;
}
