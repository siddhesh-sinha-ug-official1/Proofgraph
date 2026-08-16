/**
 * layout2 persistence (SUB200 split of layout2.ts — no behavior change):
 * versioned localStorage under pgshell.layout.v2, sanitized load, and the
 * LOUD v1→v2 migration (probed with the full mapping, never silent).
 */

import { probeShell } from "./shellLog";
import { LAYOUT_KEY as LAYOUT_V1_KEY } from "./layout";
import { clampEdgeSize } from "./layout2Geometry";
import {
  defaultLayoutV2, LAYOUT_V2_KEY, WIN_CONST, WIN_IDS,
  type LayoutV2, type Side, type ViewMode, type WinId, type WinState,
} from "./layout2Model";

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

const SIDES: readonly Side[] = ["left", "right", "bottom"];
const MODES: readonly ViewMode[] = ["dock", "undock", "float"];

function sanitizeWin(raw: unknown, d: WinState): WinState {
  const p = (raw ?? {}) as Partial<WinState>;
  return {
    open: typeof p.open === "boolean" ? p.open : d.open,
    mode: MODES.includes(p.mode as ViewMode) ? (p.mode as ViewMode) : d.mode,
    pinned: typeof p.pinned === "boolean" ? p.pinned : d.pinned,
    side: SIDES.includes(p.side as Side) ? (p.side as Side) : d.side,
    x: typeof p.x === "number" ? p.x : d.x,
    y: typeof p.y === "number" ? p.y : d.y,
    w: typeof p.w === "number" ? Math.max(WIN_CONST.floatMinW, p.w) : d.w,
    h: typeof p.h === "number" ? Math.max(WIN_CONST.floatMinH, p.h) : d.h,
    z: typeof p.z === "number" ? p.z : d.z,
  };
}

/** Migrate the v1 dock layout into v2 — LOUD (probed with the full mapping),
 *  never silent: explorer→project window, the visible bottom TAB→its window
 *  docked bottom, explorerW→sizeL, bottomH→sizeB (clamped to the v2 bounds).
 *  The v1 graph dock has no v2 equivalent (the graph is the full-bleed canvas)
 *  — declared in the probe, not guessed. The v1 key is left in place (a
 *  rollback still finds it). */
export function migrateV1toV2(v1raw: string): LayoutV2 {
  const d = defaultLayoutV2();
  let v1: Record<string, unknown>;
  try {
    v1 = JSON.parse(v1raw) as Record<string, unknown>;
  } catch {
    probeShell("shell.layout.migrate", {
      from: LAYOUT_V1_KEY, to: LAYOUT_V2_KEY, outcome: "reset",
      reason: "v1 blob unparseable — v2 starts from the 1c defaults (loud, never a silent half-parse)",
    });
    return d;
  }
  const next = structuredClone(d);
  if (typeof v1.explorerVisible === "boolean") next.wins.project.open = v1.explorerVisible;
  if (typeof v1.explorerW === "number") next.sizeL = clampEdgeSize("left", v1.explorerW);
  if (typeof v1.bottomH === "number") next.sizeB = clampEdgeSize("bottom", v1.bottomH);
  const tab = v1.bottomTab === "ai" ? "ai" : v1.bottomTab === "pins" ? "pins" : "diag";
  if (typeof v1.bottomVisible === "boolean") {
    next.wins.ai.open = false; next.wins.diag.open = false; next.wins.pins.open = false;
    if (v1.bottomVisible) {
      next.wins[tab] = { ...next.wins[tab], open: true, mode: "dock", side: "bottom", pinned: true };
    }
  }
  probeShell("shell.layout.migrate", {
    from: LAYOUT_V1_KEY, to: LAYOUT_V2_KEY, outcome: "migrated",
    mapped: {
      explorerVisible: v1.explorerVisible, explorerW: v1.explorerW,
      bottomVisible: v1.bottomVisible, bottomTab: v1.bottomTab, bottomH: v1.bottomH,
    },
    unmapped: {
      graphVisible: v1.graphVisible,
      note: "the v1 graph dock has no v2 window — the graph is the 1c full-bleed canvas",
    },
  });
  return next;
}

export function loadLayoutV2(): LayoutV2 {
  const s = storage();
  const d = defaultLayoutV2();
  if (s === null) return d;
  const raw = s.getItem(LAYOUT_V2_KEY);
  if (raw !== null) {
    try {
      const p = JSON.parse(raw) as Partial<LayoutV2>;
      const wins = {} as Record<WinId, WinState>;
      for (const id of WIN_IDS) wins[id] = sanitizeWin((p.wins ?? ({} as Record<string, unknown>))[id], d.wins[id]);
      return {
        wins,
        sizeL: typeof p.sizeL === "number" ? clampEdgeSize("left", p.sizeL) : d.sizeL,
        sizeR: typeof p.sizeR === "number" ? clampEdgeSize("right", p.sizeR) : d.sizeR,
        sizeB: typeof p.sizeB === "number" ? clampEdgeSize("bottom", p.sizeB) : d.sizeB,
        zTop: typeof p.zTop === "number" ? p.zTop : d.zTop,
      };
    } catch {
      probeShell("shell.layout.load.reset", {
        key: LAYOUT_V2_KEY, reason: "unparseable stored v2 layout — defaults (loud)",
      });
      return d;
    }
  }
  const v1raw = s.getItem(LAYOUT_V1_KEY);
  if (v1raw !== null) {
    const migrated = migrateV1toV2(v1raw);
    s.setItem(LAYOUT_V2_KEY, JSON.stringify(migrated)); // migration persists immediately
    return migrated;
  }
  return d;
}

export function saveLayoutV2(next: LayoutV2, cause: string): LayoutV2 {
  const s = storage();
  if (s !== null) s.setItem(LAYOUT_V2_KEY, JSON.stringify(next));
  probeShell("shell.layout.change", {
    cause, persistedKey: LAYOUT_V2_KEY,
    open: WIN_IDS.filter((id) => next.wins[id].open),
    modes: Object.fromEntries(WIN_IDS.map((id) => [id, `${next.wins[id].mode}${next.wins[id].mode === "dock" ? (next.wins[id].pinned ? ":pinned" : ":unpinned") : ""}@${next.wins[id].side}`])),
    sizes: { sizeL: next.sizeL, sizeR: next.sizeR, sizeB: next.sizeB },
  });
  return next;
}

export function resetLayoutV2(): LayoutV2 {
  const d = defaultLayoutV2();
  const s = storage();
  if (s !== null) s.removeItem(LAYOUT_V2_KEY);
  probeShell("shell.layout.reset", { key: LAYOUT_V2_KEY });
  return d;
}
