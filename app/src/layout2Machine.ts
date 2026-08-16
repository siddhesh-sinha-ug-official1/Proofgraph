/**
 * layout2 WinState machine (SUB200 split of layout2.ts — no behavior change):
 * every transition probed (shell.toolwindow.mode / .open / .autohide). Pure
 * reducers over LayoutV2 — persistence lives in layout2Persist.ts.
 */

import { probeShell } from "./shellLog";
import { clampEdgeSize } from "./layout2Geometry";
import { WIN_IDS, type LayoutV2, type Side, type ViewMode, type WinId, type WinState } from "./layout2Model";

export function patchWin(l: LayoutV2, id: WinId, patch: Partial<WinState>): LayoutV2 {
  return { ...l, wins: { ...l.wins, [id]: { ...l.wins[id], ...patch } } };
}

function probeMode(id: WinId, from: WinState, to: WinState, cause: string): void {
  probeShell("shell.toolwindow.mode", {
    id, cause,
    from: { mode: from.mode, pinned: from.pinned, side: from.side, open: from.open },
    to: { mode: to.mode, pinned: to.pinned, side: to.side, open: to.open },
  });
}

/** Gear VIEW MODE change (Dock Pinned / Dock Unpinned / Undock / Float). */
export function setWinMode(l: LayoutV2, id: WinId, mode: ViewMode, pinned: boolean, cause: string): LayoutV2 {
  const from = l.wins[id];
  const zTop = mode === "float" ? l.zTop + 1 : l.zTop;
  const next = patchWin(
    { ...l, zTop }, id,
    { mode, pinned, open: true, ...(mode === "float" ? { z: zTop } : {}) },
  );
  probeMode(id, from, next.wins[id], cause);
  return next;
}

/** Gear MOVE TO — docks pinned onto that edge. */
export function moveWinTo(l: LayoutV2, id: WinId, side: Side, cause: string): LayoutV2 {
  const from = l.wins[id];
  const next = patchWin(l, id, { mode: "dock", side, pinned: true, open: true });
  probeMode(id, from, next.wins[id], cause);
  return next;
}

/** Rail / View-menu toggle: closed↔open (opening a float raises it). */
export function toggleWin(l: LayoutV2, id: WinId, cause: string): LayoutV2 {
  const from = l.wins[id];
  const opening = !from.open;
  const zTop = opening ? l.zTop + 1 : l.zTop;
  const next = patchWin({ ...l, zTop }, id, { open: opening, ...(opening ? { z: zTop } : {}) });
  probeShell("shell.toolwindow.open", { id, open: opening, cause });
  return next;
}

export function hideWin(l: LayoutV2, id: WinId, cause: string): LayoutV2 {
  if (!l.wins[id].open) return l;
  probeShell("shell.toolwindow.open", { id, open: false, cause });
  return patchWin(l, id, { open: false });
}

/** Clicking a floating window raises it (counter++). */
export function frontWin(l: LayoutV2, id: WinId): LayoutV2 {
  const w = l.wins[id];
  if (w.mode !== "float" || w.z === l.zTop) return l;
  const zTop = l.zTop + 1;
  return patchWin({ ...l, zTop }, id, { z: zTop });
}

export function setFloatGeom(l: LayoutV2, id: WinId, geom: Partial<Pick<WinState, "x" | "y" | "w" | "h">>): LayoutV2 {
  return patchWin(l, id, geom);
}

export function setEdgeSize(l: LayoutV2, side: Side, px: number): LayoutV2 {
  const v = clampEdgeSize(side, px);
  if (side === "left") return { ...l, sizeL: v };
  if (side === "right") return { ...l, sizeR: v };
  return { ...l, sizeB: v };
}

/** Any pointer-down on the canvas closes every open dock-unpinned and undocked
 *  window (auto-hide, probed per window). */
export function autoHideTransients(l: LayoutV2): { layout: LayoutV2; closed: WinId[] } {
  const closed: WinId[] = [];
  let next = l;
  for (const id of WIN_IDS) {
    const w = next.wins[id];
    if (w.open && ((w.mode === "dock" && !w.pinned) || w.mode === "undock")) {
      next = patchWin(next, id, { open: false });
      closed.push(id);
      probeShell("shell.toolwindow.autohide", { id, mode: w.mode, pinned: w.pinned });
    }
  }
  return { layout: next, closed };
}
