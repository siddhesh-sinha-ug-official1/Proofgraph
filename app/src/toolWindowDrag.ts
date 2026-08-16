/**
 * Tool-window drag + resize wiring (SUB200 split of ToolWindows.tsx — no
 * behavior change): title-bar drag (>4px tears to float; edge zones dock
 * pinned on release) and the resize handles (float corner 15px min 280×170;
 * docked 6px inner-border handles adjusting the SHARED edge size). Drags
 * persist ONCE on release, never per move. ToolWindows.tsx is the facade.
 */

import type React from "react";
import {
  dropZoneHit, frontWin, moveWinTo, setEdgeSize, setFloatGeom, setWinMode, WIN_CONST,
  type LayoutV2, type Side, type WinId,
} from "./layout2";
import { probeShell } from "./shellLog";

export interface DragCtx {
  liveRef: React.MutableRefObject<LayoutV2>;
  mw: number;
  mh: number;
  setGear: (g: WinId | null) => void;
  setDropHint: (s: Side | null) => void;
  setLayoutLive: (l: LayoutV2) => void;
  commitLayout: (l: LayoutV2, cause: string) => void;
}

/** Title-bar drag: >4px tears into float; edge zones dock pinned on release. */
export const makeTitleDrag = (ctx: DragCtx) => (id: WinId) => (e: React.PointerEvent): void => {
  if ((e.target as HTMLElement).closest("[data-nodrag]") !== null) return;
  if (e.button !== 0) return;
  e.preventDefault();
  const host = (e.currentTarget as HTMLElement).closest("[data-canvas]") as HTMLElement | null;
  const rect = host?.getBoundingClientRect() ?? { left: 0, top: 0, width: ctx.mw, height: ctx.mh };
  const w0 = { ...ctx.liveRef.current.wins[id] };
  const sx = e.clientX, sy = e.clientY;
  const grabX = Math.min(w0.w - 60, 170);
  let started = false;
  let hint: Side | null = null;
  const move = (ev: PointerEvent): void => {
    if (!started && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) <= WIN_CONST.tearThreshold) return;
    if (!started) {
      started = true;
      ctx.setGear(null);
      if (w0.mode !== "float") {
        // the tear is a real mode transition — probed once via the reducer
        ctx.setLayoutLive(setWinMode(ctx.liveRef.current, id, "float", w0.pinned, "drag-tear"));
      } else {
        ctx.setLayoutLive(frontWin(ctx.liveRef.current, id));
      }
      probeShell("shell.toolwindow.drag.start", { id, fromMode: w0.mode });
    }
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    hint = dropZoneHit(px, py, ctx.mw, ctx.mh);
    ctx.setDropHint(hint);
    ctx.setLayoutLive(setFloatGeom(ctx.liveRef.current, id, {
      x: px - grabX, y: Math.max(2, py - 14),
    }));
  };
  const up = (): void => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    ctx.setDropHint(null);
    if (!started) return;
    if (hint !== null) {
      ctx.commitLayout(moveWinTo(ctx.liveRef.current, id, hint, "drag-to-dock"), `drag-to-dock ${id}→${hint}`);
    } else {
      ctx.commitLayout(ctx.liveRef.current, `drag-float ${id}`);
    }
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
};

/** Resize: float corner / docked shared-size handles. */
export const makeResize = (ctx: DragCtx) =>
  (id: WinId, kind: "corner" | "sizeL" | "sizeR" | "sizeB") => (e: React.PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    const s0 = {
      w: ctx.liveRef.current.wins[id].w, h: ctx.liveRef.current.wins[id].h,
      sl: ctx.liveRef.current.sizeL, sr: ctx.liveRef.current.sizeR, sb: ctx.liveRef.current.sizeB,
    };
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (kind === "corner") {
        ctx.setLayoutLive(setFloatGeom(ctx.liveRef.current, id, {
          w: Math.max(WIN_CONST.floatMinW, s0.w + dx),
          h: Math.max(WIN_CONST.floatMinH, s0.h + dy),
        }));
      } else if (kind === "sizeL") {
        ctx.setLayoutLive(setEdgeSize(ctx.liveRef.current, "left", s0.sl + dx));
      } else if (kind === "sizeR") {
        ctx.setLayoutLive(setEdgeSize(ctx.liveRef.current, "right", s0.sr - dx));
      } else {
        ctx.setLayoutLive(setEdgeSize(ctx.liveRef.current, "bottom", s0.sb - dy));
      }
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      ctx.commitLayout(ctx.liveRef.current, `resize ${id} (${kind})`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
