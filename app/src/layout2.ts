/**
 * UI-1C round — the graph-first windowing layer's state + PURE layout math
 * (shell-design/README.md §"1c windowing spec (implement exactly)").
 *
 * Five tool windows (project · editor · ai · diag · pins), each a WinState
 * machine: dock (pinned/unpinned auto-hide) · undock (edge overlay) · float
 * (free window, z-raise). Persisted under the NEW versioned key
 * pgshell.layout.v2; the old v1 blob is migrated-or-reset LOUDLY (probed,
 * never silent). Every mutation is probed (shell.layout.* /
 * shell.toolwindow.mode) — the clampSplit discipline of layout.ts carried
 * forward: all geometry math is exported pure functions, unit-tested directly.
 *
 * SUB200 restructure: this module is now the FACADE over layout2Model.ts
 * (types + spec constants + defaults), layout2Geometry.ts (pure geometry),
 * layout2Machine.ts (the probed WinState reducers) and layout2Persist.ts
 * (versioned storage + the loud v1→v2 migration). Public surface unchanged.
 */

export {
  DEFAULT_EDGE_SIZES, EDGE_SIZE_BOUNDS, LAYOUT_V2_KEY, WIN_CONST, WIN_IDS,
  defaultLayoutV2,
  type LayoutV2, type Side, type ViewMode, type WinId, type WinState,
} from "./layout2Model";

export {
  clampEdgeSize, clampFloatRect, computeWindowRects, dockInsets,
  dropZoneHit, dropZoneRect, undockRect,
  type WinRect,
} from "./layout2Geometry";

export {
  autoHideTransients, frontWin, hideWin, moveWinTo,
  setEdgeSize, setFloatGeom, setWinMode, toggleWin,
} from "./layout2Machine";

export { loadLayoutV2, migrateV1toV2, resetLayoutV2, saveLayoutV2 } from "./layout2Persist";
