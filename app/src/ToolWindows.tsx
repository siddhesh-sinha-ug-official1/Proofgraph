/**
 * UI-1C round — the tool-window LAYER: five JetBrains-style windows over the
 * full-bleed graph canvas, rendered as plain absolutely-positioned divs
 * exactly as prototyped in shell-design/ProofGraphGraphFirst.dc.html.
 *
 * All geometry is the PURE math in layout2.ts (unit-tested); this file owns
 * only the DOM wiring: title-bar drag (>4px tears to float; edge zones dock
 * pinned on release), the gear (⚙) options menu (VIEW MODE · MOVE TO · Hide —
 * "Window" honest-disabled with the README's reason verbatim), resize handles
 * (float corner 15px min 280×170; docked 6px inner-border handles adjusting
 * the SHARED edge size), and z-raise on click. Every mutation is probed via
 * the layout2 reducers; drags persist ONCE on release, never per move.
 *
 * SUB200 restructure: this module stays the FACADE — the gear-menu model +
 * icon live in toolWindowKit.tsx, the drag/resize pointer wiring in
 * toolWindowDrag.ts; the WindowLayer composition stays here. Surface
 * unchanged (WindowLayer + WINDOW_MODE_DISABLED_REASON re-exported).
 */

import React, { useEffect, useRef, useState } from "react";
import {
  computeWindowRects, dropZoneRect, frontWin, hideWin, WIN_CONST,
  type LayoutV2, type Side, type WinId, type WinRect,
} from "./layout2";
import { probeShell } from "./shellLog";
import { buildGearRows, GearIcon, modeTag, type WindowMeta } from "./toolWindowKit";
import { makeResize, makeTitleDrag } from "./toolWindowDrag";

export { WINDOW_MODE_DISABLED_REASON, type WindowMeta } from "./toolWindowKit";

export interface WindowLayerProps {
  layout: LayoutV2;
  /** live (unpersisted) update during drags — persisted once on release */
  setLayoutLive: (l: LayoutV2) => void;
  /** persist + probe (saveLayoutV2 under pgshell.layout.v2) */
  commitLayout: (l: LayoutV2, cause: string) => void;
  mw: number;
  mh: number;
  meta: Record<WinId, WindowMeta>;
  content: Record<WinId, React.ReactNode>;
  /** bump to close the gear popup (canvas pointer-down, Esc handled here too) */
  transientCloseTick: number;
}

export function WindowLayer(props: WindowLayerProps): React.ReactElement {
  const { layout, mw, mh } = props;
  const [gear, setGear] = useState<WinId | null>(null);
  const [dropHint, setDropHint] = useState<Side | null>(null);
  const liveRef = useRef(layout);
  liveRef.current = layout;

  // canvas pointer-down / dialog opens close the gear popup
  useEffect(() => setGear(null), [props.transientCloseTick]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setGear(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rects = computeWindowRects(layout, mw, mh);

  const dragCtx = {
    liveRef, mw, mh, setGear, setDropHint,
    setLayoutLive: props.setLayoutLive, commitLayout: props.commitLayout,
  };
  const titleDrag = makeTitleDrag(dragCtx);
  const resize = makeResize(dragCtx);

  const gearPos = (id: WinId): { x: number; y: number } | null => {
    const r = rects[id];
    if (r === undefined) return null;
    return {
      x: Math.max(6, Math.min(r.x + r.w - 248, mw - 256)),
      y: Math.min(r.y + 36, Math.max(6, mh - 330)),
    };
  };

  const renderWindow = (id: WinId, r: WinRect): React.ReactElement => {
    const w = layout.wins[id];
    const m = props.meta[id];
    const cls = `tw tw-${r.kind === "float" ? "float" : r.kind === "undock" ? "undock" : "dock"}`;
    return (
      <div
        key={id}
        className={cls}
        data-testid={`toolwindow-${id}`}
        data-mode={w.mode === "dock" ? (w.pinned ? "dock-pinned" : "dock-unpinned") : w.mode}
        style={{ left: Math.round(r.x), top: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h), zIndex: r.z }}
        onPointerDown={() => {
          if (w.mode === "float") {
            const next = frontWin(layout, id);
            if (next !== layout) props.commitLayout(next, `front ${id}`);
          }
          if (gear !== null && gear !== id) setGear(null);
        }}
      >
        <div className="tw-titlebar" title="drag to float — drop on an edge zone to dock" onPointerDown={titleDrag(id)}>
          <span className="tw-title">{m.title}</span>
          <span className="tw-sub">{m.sub}</span>
          <span className="tw-modetag" title="current view mode — change via the gear menu">{modeTag(layout, id)}</span>
          <span data-nodrag="1" className="tw-buttons">
            <button
              type="button"
              className={`tw-btn ${gear === id ? "tw-btn-active" : ""}`}
              data-testid={`toolwindow-gear-${id}`}
              title="tool window options — view mode · move to · hide"
              onClick={(e) => { e.stopPropagation(); setGear((g) => (g === id ? null : id)); }}
            >
              <GearIcon />
            </button>
            <button
              type="button"
              className="tw-btn"
              aria-label={`hide ${m.title} window`}
              title="hide — the rail icon restores it"
              onClick={() => props.commitLayout(hideWin(layout, id, "titlebar hide"), `hide ${id}`)}
            >—</button>
          </span>
        </div>
        <div className="tw-body">{props.content[id]}</div>
        {r.kind === "float" && (
          <div className="tw-resize tw-resize-corner" title="resize" onPointerDown={resize(id, "corner")} />
        )}
        {r.kind === "dockL" && (
          <div className="tw-resize tw-resize-right" title="resize dock" onPointerDown={resize(id, "sizeL")} />
        )}
        {r.kind === "dockR" && (
          <div className="tw-resize tw-resize-left" title="resize dock" onPointerDown={resize(id, "sizeR")} />
        )}
        {r.kind === "dockB" && (
          <div className="tw-resize tw-resize-top" title="resize dock" onPointerDown={resize(id, "sizeB")} />
        )}
      </div>
    );
  };

  const gp = gear !== null ? gearPos(gear) : null;
  const dz = dropHint !== null ? dropZoneRect(dropHint, layout, mw, mh) : null;

  return (
    <>
      {(Object.entries(rects) as Array<[WinId, WinRect]>).map(([id, r]) => renderWindow(id, r))}
      {dz !== null && (
        <div
          className="tw-dropzone"
          data-testid="dock-drop-zone"
          style={{ left: dz.x, top: dz.y, width: dz.w, height: dz.h, zIndex: WIN_CONST.dropZoneZ }}
        />
      )}
      {gear !== null && gp !== null && (
        <div className="tw-gear-popup" role="menu" aria-label={`${props.meta[gear].title} window options`}
          data-testid="gear-popup" style={{ left: Math.round(gp.x), top: Math.round(gp.y), zIndex: WIN_CONST.gearZ }}>
          {buildGearRows(layout, gear, () => setGear(null), props.commitLayout).map((g, i) => {
            if (g.kind === "head") return <div key={i} className="tw-gear-head">{g.label}</div>;
            if (g.kind === "sep") return <div key={i} className="menu-separator" role="separator" />;
            return (
              <div
                key={i}
                role="menuitem"
                aria-disabled={g.enabled !== true}
                aria-checked={g.checked === true}
                data-gear-item={g.itemId}
                title={g.tip ?? ""}
                className={`tw-gear-row ${g.enabled === true ? "" : "menu-item-disabled"}`}
                onClick={() => {
                  if (g.enabled !== true) {
                    probeShell("shell.toolwindow.gear.blocked", { id: gear, item: g.itemId, reason: g.tip });
                    return;
                  }
                  g.act?.();
                }}
              >
                <span className="menu-item-check">{g.checked === true ? "✓" : ""}</span>
                <span className="menu-item-label">{g.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
