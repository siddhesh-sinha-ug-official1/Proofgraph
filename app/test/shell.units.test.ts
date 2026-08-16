/**
 * App-shell round — unit suite for the shell's pure machinery, CHROME
 * PERSISTENCE groups:
 *   - splitter min-size math (clampSplit — the contract's "splitter-resizable,
 *     min sizes" made testable as a pure function);
 *   - prefs persistence (versioned localStorage key; every change PROBED;
 *     corrupt blob = loud reset, never a half-parse);
 *   - recents (versioned key, dedupe, tail bound);
 *   - layout persistence + reset.
 *
 * SUB200 restructure (wave 2): split by describe-groups — TabsStore lives in
 * shell.units.tabs.test.ts, fsSource + small helpers in
 * shell.units.fs.test.ts. No test renamed, no assertion weakened.
 */

import { describe, test, expect, beforeEach } from "vitest";

import { clampSplit, defaultLayout, loadLayout, resetLayout, saveLayout, LAYOUT_KEY, MIN_SIZES } from "../src/layout";
import {
  addRecent, defaultPrefs, loadPrefs, loadRecents, setPref,
  PREFS_KEY, RECENTS_KEY, RECENTS_BOUND, FONT_SIZE_MIN, FONT_SIZE_MAX,
} from "../src/prefs";
import { resetShellState, probes } from "./helpers/shellProbe";

beforeEach(resetShellState);

// ── splitter math ────────────────────────────────────────────────────────────

describe("splitter min-size math (pure)", () => {
  test("in-range proposals pass through untouched", () => {
    expect(clampSplit(300, 1000, 150, 260)).toBe(300);
  });
  test("the near minimum is a hard floor", () => {
    expect(clampSplit(10, 1000, MIN_SIZES.explorer, MIN_SIZES.center)).toBe(MIN_SIZES.explorer);
  });
  test("the far side keeps ITS minimum too (ceiling = total - minFar)", () => {
    expect(clampSplit(950, 1000, 150, 260)).toBe(1000 - 260);
  });
  test("degenerate container (cannot honor both minimums): near min wins deterministically", () => {
    expect(clampSplit(200, 300, 150, 260)).toBe(150);
    expect(clampSplit(0, 0, 150, 260)).toBe(150);
  });
});

// ── prefs ────────────────────────────────────────────────────────────────────

describe("prefs — versioned persistence, probed changes, loud resets", () => {
  test("defaults when nothing stored; jsdom (no matchMedia impl) → dark", () => {
    const p = loadPrefs();
    expect(p).toEqual(defaultPrefs());
    expect(p.theme).toBe("dark");
    expect(p.pyrightMode).toBe("none"); // leads stay honest by default
  });

  test("setPref persists under the VERSIONED key and probes shell.pref.change", () => {
    const p = setPref(loadPrefs(), "editorFontSize", 16);
    expect(p.editorFontSize).toBe(16);
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).editorFontSize).toBe(16);
    const changes = probes("shell.pref.change");
    expect(changes.length).toBe(1);
    expect(changes[0].payload).toMatchObject({ key: "editorFontSize", from: 13, to: 16, persistedKey: PREFS_KEY });
    // reload round-trips
    expect(loadPrefs().editorFontSize).toBe(16);
  });

  test("a corrupt stored blob resets to defaults LOUDLY (probed), never a half-parse", () => {
    localStorage.setItem(PREFS_KEY, "{not json");
    const p = loadPrefs();
    expect(p).toEqual(defaultPrefs());
    expect(probes("shell.pref.load.reset").length).toBe(1);
  });

  test("stored font size is clamped to the declared bounds on load", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ editorFontSize: 900 }));
    expect(loadPrefs().editorFontSize).toBe(FONT_SIZE_MAX);
    localStorage.setItem(PREFS_KEY, JSON.stringify({ editorFontSize: 1 }));
    expect(loadPrefs().editorFontSize).toBe(FONT_SIZE_MIN);
  });

  test("recents: versioned key, dedupe, tail bound, probed", () => {
    let r = loadRecents();
    expect(r).toEqual([]);
    r = addRecent(r, "file", "moatpkg/core.py");
    r = addRecent(r, "file", "moatpkg/helpers.py");
    r = addRecent(r, "file", "moatpkg/core.py"); // dedupe → moves to front
    expect(r.map((x) => x.path)).toEqual(["moatpkg/core.py", "moatpkg/helpers.py"]);
    for (let i = 0; i < RECENTS_BOUND + 3; i++) r = addRecent(r, "file", `f${i}.py`);
    expect(r.length).toBe(RECENTS_BOUND); // bound enforced
    expect(JSON.parse(localStorage.getItem(RECENTS_KEY)!).length).toBe(RECENTS_BOUND);
    expect(probes("shell.recents.add").length).toBeGreaterThan(0);
  });
});

// ── layout ───────────────────────────────────────────────────────────────────

describe("layout — persistence under the versioned key", () => {
  test("save → load round-trip; probed", () => {
    const l = saveLayout({ ...defaultLayout(), explorerW: 305, bottomTab: "pins" }, "test");
    expect(l.explorerW).toBe(305);
    const back = loadLayout();
    expect(back.explorerW).toBe(305);
    expect(back.bottomTab).toBe("pins");
    expect(probes("shell.layout.change").length).toBe(1);
  });
  test("stored sizes below the minimums are floored on load (min sizes survive reloads)", () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ explorerW: 5, bottomH: 2 }));
    const l = loadLayout();
    expect(l.explorerW).toBe(MIN_SIZES.explorer);
    expect(l.bottomH).toBe(MIN_SIZES.bottom);
  });
  test("reset removes the key and probes", () => {
    saveLayout({ ...defaultLayout(), graphW: 999 }, "test");
    const l = resetLayout();
    expect(l).toEqual(defaultLayout());
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull();
    expect(probes("shell.layout.reset").length).toBe(1);
  });
  test("corrupt layout blob = defaults, loudly", () => {
    localStorage.setItem(LAYOUT_KEY, "]]");
    expect(loadLayout()).toEqual(defaultLayout());
    expect(probes("shell.layout.load.reset").length).toBe(1);
  });
});
