/**
 * layout2 model (SUB200 split of layout2.ts — no behavior change): the
 * windowing layer's types, spec constants (1c windowing spec, verbatim) and
 * the spec-default layout. Pure data — no DOM, no storage. layout2.ts stays
 * the facade with the layer's full doc.
 */

export const LAYOUT_V2_KEY = "pgshell.layout.v2";

export type WinId = "project" | "editor" | "ai" | "diag" | "pins";
export type Side = "left" | "right" | "bottom";
export type ViewMode = "dock" | "undock" | "float";

export interface WinState {
  open: boolean;
  mode: ViewMode;
  /** dock only: pinned = always visible; unpinned = auto-hides on canvas focus */
  pinned: boolean;
  /** last/current dock edge (kept while floating) */
  side: Side;
  /** float geometry, px in canvas space */
  x: number; y: number; w: number; h: number;
  /** float stacking; monotonically increasing counter (zTop) */
  z: number;
}

export interface LayoutV2 {
  wins: Record<WinId, WinState>;
  /** shared per-edge dock sizes (px) */
  sizeL: number; sizeR: number; sizeB: number;
  /** the float z counter's high-water mark (persisted so raises stay monotonic) */
  zTop: number;
}

export const WIN_IDS: readonly WinId[] = ["project", "editor", "ai", "diag", "pins"];

/** Spec constants — the 1c windowing spec's numbers, verbatim. */
export const WIN_CONST = {
  gutter: 10,          // between docked windows on one edge
  margin: 6,           // outer margin of the dock stacks
  dockZSide: 10,       // left/right dock stack base z
  dockZBottom: 14,     // bottom dock row base z
  undockZ: 44,         // edge overlay
  dropZoneZ: 70,
  gearZ: 76,
  popupZ: 90,
  dialogZ: 95,
  floatMinW: 280, floatMinH: 170,
  edgeZoneX: 70,       // drag-to-dock capture: within 70px of left/right edge
  edgeZoneBottom: 80,  // …or 80px of the bottom
  tearThreshold: 4,    // drag >4px tears a window into float mode
} as const;

/** Per-edge shared-size bounds (resize handles clamp into these). */
export const EDGE_SIZE_BOUNDS: Record<Side, { min: number; max: number }> = {
  left: { min: 220, max: 540 },
  right: { min: 240, max: 640 },
  bottom: { min: 140, max: 460 },
};

export const DEFAULT_EDGE_SIZES = { sizeL: 296, sizeR: 340, sizeB: 204 } as const;

/** Spec defaults: project docked-left pinned; editor floating (640,40 620×430);
 *  diag docked-bottom pinned; ai closed (float 520×330); pins closed
 *  (dock-bottom UNPINNED). */
export function defaultLayoutV2(): LayoutV2 {
  return {
    wins: {
      project: { open: true, mode: "dock", side: "left", pinned: true, x: 90, y: 70, w: 320, h: 380, z: 31 },
      editor: { open: true, mode: "float", side: "right", pinned: true, x: 640, y: 40, w: 620, h: 430, z: 32 },
      ai: { open: false, mode: "float", side: "right", pinned: true, x: 430, y: 210, w: 520, h: 330, z: 33 },
      diag: { open: true, mode: "dock", side: "bottom", pinned: true, x: 260, y: 320, w: 560, h: 300, z: 34 },
      pins: { open: false, mode: "dock", side: "bottom", pinned: false, x: 300, y: 360, w: 600, h: 320, z: 35 },
    },
    ...DEFAULT_EDGE_SIZES,
    zTop: 40,
  };
}
