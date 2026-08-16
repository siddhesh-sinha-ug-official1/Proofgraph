/**
 * layout2 pure geometry (SUB200 split of layout2.ts — no behavior change):
 * exported pure functions only, unit-tested directly (the clampSplit
 * discipline of layout.ts carried forward). No DOM, no storage, no probes.
 */

import {
  EDGE_SIZE_BOUNDS, WIN_CONST, WIN_IDS,
  type LayoutV2, type Side, type WinId, type WinState,
} from "./layout2Model";

export interface WinRect {
  x: number; y: number; w: number; h: number; z: number;
  kind: "dockL" | "dockR" | "dockB" | "float" | "undock";
}

export function clampEdgeSize(side: Side, px: number): number {
  const b = EDGE_SIZE_BOUNDS[side];
  return Math.min(b.max, Math.max(b.min, Math.round(px)));
}

/** Floats clamp into the canvas: a sliver of the title bar must stay reachable. */
export function clampFloatRect(
  r: { x: number; y: number; w: number; h: number }, mw: number, mh: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.max(4, Math.min(r.x, mw - 140)),
    y: Math.max(4, Math.min(r.y, mh - 70)),
    w: Math.min(r.w, mw - 20),
    h: Math.min(r.h, mh - 20),
  };
}

/** Undock = full edge overlay: side keeps the float w (full height); bottom
 *  keeps the float h (full width). Above docked windows (z 44). */
export function undockRect(win: WinState, mw: number, mh: number): WinRect {
  const M = WIN_CONST.margin;
  if (win.side === "bottom") {
    const h = Math.min(win.h, mh - 90);
    return { x: M, y: mh - h - M, w: mw - 2 * M, h, z: WIN_CONST.undockZ, kind: "undock" };
  }
  const w = Math.min(win.w, mw - 220);
  return {
    x: win.side === "left" ? M : mw - w - M,
    y: M, w, h: mh - 2 * M, z: WIN_CONST.undockZ, kind: "undock",
  };
}

/** The whole window layer's geometry: docked windows on one edge split it
 *  evenly with 10px gutters + 6px outer margin; left/right stacks are
 *  full-height columns of width sizeL/sizeR; bottom is a full-width row of
 *  height sizeB. Floats clamp into the canvas; undock overlays its edge. */
export function computeWindowRects(l: LayoutV2, mw: number, mh: number): Partial<Record<WinId, WinRect>> {
  const G = WIN_CONST.gutter, M = WIN_CONST.margin;
  const rects: Partial<Record<WinId, WinRect>> = {};
  const stacks: Record<Side, WinId[]> = { left: [], right: [], bottom: [] };
  for (const id of WIN_IDS) {
    const w = l.wins[id];
    if (w.open && w.mode === "dock") stacks[w.side].push(id);
  }
  for (const side of ["left", "right"] as const) {
    const ids = stacks[side];
    if (ids.length === 0) continue;
    const sw = side === "left" ? l.sizeL : l.sizeR;
    const h = (mh - 2 * M - (ids.length - 1) * G) / ids.length;
    ids.forEach((id, i) => {
      rects[id] = {
        x: side === "left" ? M : mw - sw - M,
        y: M + i * (h + G), w: sw, h,
        z: WIN_CONST.dockZSide + i,
        kind: side === "left" ? "dockL" : "dockR",
      };
    });
  }
  if (stacks.bottom.length > 0) {
    const ids = stacks.bottom;
    const w = (mw - 2 * M - (ids.length - 1) * G) / ids.length;
    ids.forEach((id, i) => {
      rects[id] = {
        x: M + i * (w + G), y: mh - l.sizeB - M, w, h: l.sizeB,
        z: WIN_CONST.dockZBottom + i, kind: "dockB",
      };
    });
  }
  for (const id of WIN_IDS) {
    const w = l.wins[id];
    if (!w.open || w.mode === "dock") continue;
    if (w.mode === "float") {
      rects[id] = { ...clampFloatRect(w, mw, mh), z: w.z, kind: "float" };
    } else {
      rects[id] = undockRect(w, mw, mh);
    }
  }
  return rects;
}

/** Drag-to-dock hit test: within 70px of the left/right edge or 80px of the
 *  bottom of the canvas → that dock zone. */
export function dropZoneHit(px: number, py: number, mw: number, mh: number): Side | null {
  if (px < WIN_CONST.edgeZoneX) return "left";
  if (px > mw - WIN_CONST.edgeZoneX) return "right";
  if (py > mh - WIN_CONST.edgeZoneBottom) return "bottom";
  return null;
}

/** The highlight rect for an active drop zone (accent fill, dashed border). */
export function dropZoneRect(side: Side, l: LayoutV2, mw: number, mh: number): { x: number; y: number; w: number; h: number } {
  if (side === "left") return { x: 4, y: 4, w: l.sizeL + 4, h: mh - 8 };
  if (side === "right") return { x: mw - l.sizeR - 8, y: 4, w: l.sizeR + 4, h: mh - 8 };
  return { x: 4, y: mh - l.sizeB - 8, w: mw - 8, h: l.sizeB + 4 };
}

/** Canvas insets from OPEN DOCKED edges — zoom-to-fit + overlay chips inset by
 *  these (the graph never hides behind a pinned dock). */
export function dockInsets(l: LayoutV2): { l: number; r: number; b: number } {
  const on = (side: Side): boolean =>
    WIN_IDS.some((id) => l.wins[id].open && l.wins[id].mode === "dock" && l.wins[id].side === side);
  return {
    l: on("left") ? l.sizeL + 14 : 0,
    r: on("right") ? l.sizeR + 14 : 0,
    b: on("bottom") ? l.sizeB + 14 : 0,
  };
}
