/**
 * Tool-window kit (SUB200 split of ToolWindows.tsx — no behavior change):
 * the gear (⚙) options-menu model (VIEW MODE · MOVE TO · Hide — "Window"
 * honest-disabled with the README's reason verbatim), the mode tag and the
 * gear icon. ToolWindows.tsx stays the facade and owns the WindowLayer DOM.
 */

import React from "react";
import { hideWin, moveWinTo, setWinMode, type LayoutV2, type Side, type WinId } from "./layout2";

/** The gear menu's honest-disable for "Window" mode — README string VERBATIM. */
export const WINDOW_MODE_DISABLED_REASON =
  "a separate OS window needs the desktop shell — the browser keeps every surface in-frame";

export interface WindowMeta {
  title: string;
  sub: string;
}

export function modeTag(l: LayoutV2, id: WinId): string {
  const w = l.wins[id];
  if (w.mode === "float") return "floating";
  if (w.mode === "undock") return "undocked";
  return w.pinned ? "docked · pinned" : "docked · unpinned";
}

export const GearIcon = (): React.ReactElement => (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export interface GearRow {
  kind: "head" | "sep" | "row";
  label?: string;
  checked?: boolean;
  enabled?: boolean;
  tip?: string;
  act?: () => void;
  itemId?: string;
}

/** Gear rows (spec: VIEW MODE · MOVE TO · sep · Hide) — every act routes
 *  through the probed layout2 reducers and commits (persist + probe). */
export function buildGearRows(
  layout: LayoutV2,
  id: WinId,
  closeGear: () => void,
  commitLayout: (l: LayoutV2, cause: string) => void,
): GearRow[] {
  const w = layout.wins[id];
  const mode = (m: "dockPinned" | "dockUnpinned" | "undock" | "float") => (): void => {
    closeGear();
    const next =
      m === "dockPinned" ? setWinMode(layout, id, "dock", true, "gear VIEW MODE") :
      m === "dockUnpinned" ? setWinMode(layout, id, "dock", false, "gear VIEW MODE") :
      m === "undock" ? setWinMode(layout, id, "undock", w.pinned, "gear VIEW MODE") :
      setWinMode(layout, id, "float", w.pinned, "gear VIEW MODE");
    commitLayout(next, `gear ${id} → ${m}`);
  };
  const move = (side: Side) => (): void => {
    closeGear();
    commitLayout(moveWinTo(layout, id, side, "gear MOVE TO"), `gear ${id} move-to ${side}`);
  };
  const docked = w.mode !== "float";
  const onEdge = (s: Side): boolean => docked && w.side === s;
  return [
    { kind: "head", label: "VIEW MODE" },
    { kind: "row", itemId: "mode-dock-pinned", label: "Dock Pinned", checked: w.mode === "dock" && w.pinned, enabled: true, tip: "attached to the edge, always visible", act: mode("dockPinned") },
    { kind: "row", itemId: "mode-dock-unpinned", label: "Dock Unpinned", checked: w.mode === "dock" && !w.pinned, enabled: true, tip: "auto-hides when focus moves to the canvas — the rail icon restores it", act: mode("dockUnpinned") },
    { kind: "row", itemId: "mode-undock", label: "Undock", checked: w.mode === "undock", enabled: true, tip: "detaches from the dock stack and overlays the canvas at its edge; hides on canvas focus", act: mode("undock") },
    { kind: "row", itemId: "mode-float", label: "Float", checked: w.mode === "float", enabled: true, tip: "free window — drag anywhere; drop on an edge zone to re-dock", act: mode("float") },
    { kind: "row", itemId: "mode-window", label: "Window", checked: false, enabled: false, tip: WINDOW_MODE_DISABLED_REASON },
    { kind: "head", label: "MOVE TO" },
    { kind: "row", itemId: "move-left", label: "Left", checked: onEdge("left"), enabled: !onEdge("left"), tip: onEdge("left") ? "already docked on this edge" : "dock into the left edge", act: move("left") },
    { kind: "row", itemId: "move-right", label: "Right", checked: onEdge("right"), enabled: !onEdge("right"), tip: onEdge("right") ? "already docked on this edge" : "dock into the right edge", act: move("right") },
    { kind: "row", itemId: "move-bottom", label: "Bottom", checked: onEdge("bottom"), enabled: !onEdge("bottom"), tip: onEdge("bottom") ? "already docked on this edge" : "dock into the bottom edge", act: move("bottom") },
    { kind: "sep" },
    { kind: "row", itemId: "hide", label: "Hide", checked: false, enabled: true, tip: "the rail icon restores it", act: (): void => { closeGear(); commitLayout(hideWin(layout, id, "gear Hide"), `gear ${id} hide`); } },
  ];
}
