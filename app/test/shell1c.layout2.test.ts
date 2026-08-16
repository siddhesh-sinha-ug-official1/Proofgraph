/**
 * UI-1C round — unit suite for the windowing layer's PURE machinery
 * (shell-design/README.md §"1c windowing spec") — GEOMETRY groups:
 *   - defaults exactly per spec (project dock-left pinned · editor float
 *     640,40 620×430 · diag dock-bottom pinned · ai closed float · pins
 *     closed dock-bottom UNPINNED; edge sizes 296/340/204);
 *   - edge stacking math (even split, 10px gutters, 6px outer margin);
 *   - float clamps + undock (edge overlay) geometry + z bands;
 *   - drop-zone hit test (70/70/80 px capture bands) + highlight rects;
 *   - dock insets (zoom-to-fit insets by open docked edges).
 *
 * SUB200 restructure (wave 2): split by describe-groups — the WinState
 * machine lives in shell1c.layout2.machine.test.ts, persistence/migration in
 * shell1c.layout2.persist.test.ts. No test renamed, no assertion weakened.
 */

import { describe, test, expect, beforeEach } from "vitest";

import {
  clampFloatRect, computeWindowRects, defaultLayoutV2, dockInsets,
  dropZoneHit, dropZoneRect, hideWin, moveWinTo, setWinMode, toggleWin,
  undockRect, WIN_CONST,
} from "../src/layout2";
import { resetShellState } from "./helpers/shellProbe";

beforeEach(resetShellState);
const MW = 1500, MH = 900;

// ── defaults ─────────────────────────────────────────────────────────────────

describe("layout2 — spec defaults", () => {
  test("windows + edge sizes exactly per the 1c spec", () => {
    const d = defaultLayoutV2();
    expect(d.wins.project).toMatchObject({ open: true, mode: "dock", side: "left", pinned: true });
    expect(d.wins.editor).toMatchObject({ open: true, mode: "float", x: 640, y: 40, w: 620, h: 430 });
    expect(d.wins.diag).toMatchObject({ open: true, mode: "dock", side: "bottom", pinned: true });
    expect(d.wins.ai).toMatchObject({ open: false, mode: "float", w: 520, h: 330 });
    expect(d.wins.pins).toMatchObject({ open: false, mode: "dock", side: "bottom", pinned: false });
    expect({ sizeL: d.sizeL, sizeR: d.sizeR, sizeB: d.sizeB }).toEqual({ sizeL: 296, sizeR: 340, sizeB: 204 });
  });
});

// ── edge stacking ────────────────────────────────────────────────────────────

describe("layout2 — edge stacking math (pure)", () => {
  test("one left dock = a full-height column of width sizeL with 6px margins", () => {
    const l = defaultLayoutV2();
    const r = computeWindowRects(l, MW, MH).project!;
    expect(r).toMatchObject({ x: 6, y: 6, w: l.sizeL, kind: "dockL" });
    expect(r.h).toBeCloseTo(MH - 12);
    expect(r.z).toBe(WIN_CONST.dockZSide);
  });

  test("two windows on one edge split it EVENLY with a 10px gutter", () => {
    let l = defaultLayoutV2();
    l = moveWinTo(l, "ai", "left", "test"); // ai joins project on the left
    const rects = computeWindowRects(l, MW, MH);
    const a = rects.project!, b = rects.ai!;
    expect(a.h).toBeCloseTo(b.h);
    expect(a.h).toBeCloseTo((MH - 12 - 10) / 2);
    expect(b.y).toBeCloseTo(a.y + a.h + 10);
    expect(b.z).toBe(WIN_CONST.dockZSide + 1);
  });

  test("bottom is a full-width row of height sizeB; two bottom windows split the width", () => {
    let l = defaultLayoutV2();
    l = toggleWin(l, "pins", "test"); // pins default: dock-bottom (unpinned) → joins diag
    const rects = computeWindowRects(l, MW, MH);
    const a = rects.diag!, b = rects.pins!;
    expect(a.h).toBe(l.sizeB);
    expect(a.y).toBe(MH - l.sizeB - 6);
    expect(a.w).toBeCloseTo(b.w);
    expect(a.w).toBeCloseTo((MW - 12 - 10) / 2);
    expect(b.x).toBeCloseTo(a.x + a.w + 10);
    expect(a.z).toBe(WIN_CONST.dockZBottom);
  });

  test("right stack hugs the right edge at width sizeR", () => {
    let l = defaultLayoutV2();
    l = moveWinTo(l, "project", "right", "test");
    const r = computeWindowRects(l, MW, MH).project!;
    expect(r.x).toBe(MW - l.sizeR - 6);
    expect(r.w).toBe(l.sizeR);
    expect(r.kind).toBe("dockR");
  });
});

// ── floats + undock ──────────────────────────────────────────────────────────

describe("layout2 — float clamps + undock geometry + z bands", () => {
  test("floats clamp into the canvas (title bar stays reachable)", () => {
    expect(clampFloatRect({ x: -50, y: -50, w: 300, h: 200 }, MW, MH)).toMatchObject({ x: 4, y: 4 });
    expect(clampFloatRect({ x: 9999, y: 9999, w: 300, h: 200 }, MW, MH)).toMatchObject({ x: MW - 140, y: MH - 70 });
    const big = clampFloatRect({ x: 10, y: 10, w: 9999, h: 9999 }, MW, MH);
    expect(big.w).toBe(MW - 20);
    expect(big.h).toBe(MH - 20);
  });

  test("undock left/right = full-height overlay of the float width at z 44", () => {
    const l = defaultLayoutV2();
    const r = undockRect({ ...l.wins.project, mode: "undock" }, MW, MH);
    expect(r).toMatchObject({ x: 6, y: 6, w: l.wins.project.w, h: MH - 12, z: 44, kind: "undock" });
    const rr = undockRect({ ...l.wins.project, mode: "undock", side: "right" }, MW, MH);
    expect(rr.x).toBe(MW - l.wins.project.w - 6);
  });

  test("undock bottom = full-width overlay of the float height", () => {
    const l = defaultLayoutV2();
    const r = undockRect({ ...l.wins.diag, mode: "undock", side: "bottom" }, MW, MH);
    expect(r).toMatchObject({ x: 6, w: MW - 12, h: l.wins.diag.h, z: 44 });
    expect(r.y).toBe(MH - l.wins.diag.h - 6);
  });

  test("z bands: dock < undock < drop-zone < gear < popups < dialogs", () => {
    expect(WIN_CONST.dockZSide).toBeLessThan(WIN_CONST.undockZ);
    expect(WIN_CONST.undockZ).toBeLessThan(WIN_CONST.dropZoneZ);
    expect(WIN_CONST.dropZoneZ).toBeLessThan(WIN_CONST.gearZ);
    expect(WIN_CONST.gearZ).toBeLessThan(WIN_CONST.popupZ);
    expect(WIN_CONST.popupZ).toBeLessThan(WIN_CONST.dialogZ);
  });
});

// ── drop zones ───────────────────────────────────────────────────────────────

describe("layout2 — drag-to-dock zone math", () => {
  test("70px left/right bands, 80px bottom band, else null", () => {
    expect(dropZoneHit(69, 400, MW, MH)).toBe("left");
    expect(dropZoneHit(70, 400, MW, MH)).toBeNull();
    expect(dropZoneHit(MW - 69, 400, MW, MH)).toBe("right");
    expect(dropZoneHit(700, MH - 79, MW, MH)).toBe("bottom");
    expect(dropZoneHit(700, MH - 80, MW, MH)).toBeNull();
    expect(dropZoneHit(700, 400, MW, MH)).toBeNull();
  });

  test("left/right capture wins over bottom in the corners (spec order)", () => {
    expect(dropZoneHit(10, MH - 10, MW, MH)).toBe("left");
    expect(dropZoneHit(MW - 10, MH - 10, MW, MH)).toBe("right");
  });

  test("highlight rects hug their edge at the shared dock size", () => {
    const l = defaultLayoutV2();
    expect(dropZoneRect("left", l, MW, MH)).toMatchObject({ x: 4, y: 4, w: l.sizeL + 4, h: MH - 8 });
    expect(dropZoneRect("right", l, MW, MH)).toMatchObject({ x: MW - l.sizeR - 8, w: l.sizeR + 4 });
    expect(dropZoneRect("bottom", l, MW, MH)).toMatchObject({ y: MH - l.sizeB - 8, w: MW - 8, h: l.sizeB + 4 });
  });
});

// ── insets ───────────────────────────────────────────────────────────────────

describe("layout2 — dock insets (zoom-to-fit insets by open docked edges)", () => {
  test("defaults: left + bottom docked → those insets; float contributes none", () => {
    const l = defaultLayoutV2();
    expect(dockInsets(l)).toEqual({ l: l.sizeL + 14, r: 0, b: l.sizeB + 14 });
  });
  test("hiding the docked windows zeroes their insets", () => {
    let l = defaultLayoutV2();
    l = hideWin(l, "project", "test");
    l = hideWin(l, "diag", "test");
    expect(dockInsets(l)).toEqual({ l: 0, r: 0, b: 0 });
  });
  test("an UNDOCKED window contributes no inset (it overlays, never reserves)", () => {
    let l = defaultLayoutV2();
    l = setWinMode(l, "project", "undock", true, "test");
    expect(dockInsets(l).l).toBe(0);
  });
});
