/**
 * App-shell round — dock layout state: sizes, visibility, bottom tab; splitter
 * min-size math as PURE functions (unit-tested directly); persisted under a
 * VERSIONED localStorage key. Every layout mutation is probed (shell.layout.*).
 *
 * UI-1C note: this is the RETIRED v1 layout (the live shell runs
 * pgshell.layout.v2 in layout2*.ts). Kept because layout2Persist.ts reads
 * LAYOUT_KEY for the loud v1→v2 migration, BottomDock still types on
 * BottomTab, the unit suite exercises clampSplit directly, and a rollback
 * still composes against it.
 */

import { probeShell } from "./shellLog";

export const LAYOUT_KEY = "pgshell.layout.v1";

export type BottomTab = "ai" | "diagnostics" | "pins";

export interface LayoutState {
  explorerW: number;
  graphW: number;
  bottomH: number;
  explorerVisible: boolean;
  graphVisible: boolean;
  bottomVisible: boolean;
  bottomTab: BottomTab;
}

/** Minimum pane sizes (px) — the splitters' hard bounds; probed when hit. */
export const MIN_SIZES = {
  explorer: 150,
  center: 260,
  graph: 220,
  bottom: 90,
  /** the editor+graph row may never collapse below this when the bottom dock grows */
  topArea: 180,
} as const;

export function defaultLayout(): LayoutState {
  return {
    explorerW: 220,
    graphW: 380,
    bottomH: 180,
    explorerVisible: true,
    graphVisible: true,
    bottomVisible: true,
    bottomTab: "ai",
  };
}

/**
 * Clamp a proposed pane size so BOTH sides of the splitter keep their minimum.
 * total = the container extent along the drag axis; sizing the near pane to
 * `proposed` leaves `total - proposed` for the far side. When the container is
 * too small to honor both minimums the NEAR minimum wins (deterministic, no
 * oscillation) — the caller probes the clamp.
 */
export function clampSplit(proposed: number, total: number, minNear: number, minFar: number): number {
  if (total <= minNear + minFar) return minNear; // degenerate container: near min wins
  return Math.min(Math.max(proposed, minNear), total - minFar);
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadLayout(): LayoutState {
  const s = storage();
  const d = defaultLayout();
  if (s === null) return d;
  const raw = s.getItem(LAYOUT_KEY);
  if (raw === null) return d;
  try {
    const p = JSON.parse(raw) as Partial<LayoutState>;
    return {
      explorerW: typeof p.explorerW === "number" ? Math.max(MIN_SIZES.explorer, p.explorerW) : d.explorerW,
      graphW: typeof p.graphW === "number" ? Math.max(MIN_SIZES.graph, p.graphW) : d.graphW,
      bottomH: typeof p.bottomH === "number" ? Math.max(MIN_SIZES.bottom, p.bottomH) : d.bottomH,
      explorerVisible: typeof p.explorerVisible === "boolean" ? p.explorerVisible : d.explorerVisible,
      graphVisible: typeof p.graphVisible === "boolean" ? p.graphVisible : d.graphVisible,
      bottomVisible: typeof p.bottomVisible === "boolean" ? p.bottomVisible : d.bottomVisible,
      bottomTab: p.bottomTab === "ai" || p.bottomTab === "diagnostics" || p.bottomTab === "pins" ? p.bottomTab : d.bottomTab,
    };
  } catch {
    probeShell("shell.layout.load.reset", { key: LAYOUT_KEY, reason: "unparseable stored layout — defaults (loud)" });
    return d;
  }
}

export function saveLayout(next: LayoutState, cause: string): LayoutState {
  const s = storage();
  if (s !== null) s.setItem(LAYOUT_KEY, JSON.stringify(next));
  probeShell("shell.layout.change", { cause, persistedKey: LAYOUT_KEY, ...next });
  return next;
}

export function resetLayout(): LayoutState {
  const d = defaultLayout();
  const s = storage();
  if (s !== null) s.removeItem(LAYOUT_KEY);
  probeShell("shell.layout.reset", { key: LAYOUT_KEY });
  return d;
}
