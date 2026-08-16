/**
 * UI-1C round — unit suite for the windowing layer's PURE machinery, the
 * WinState MACHINE group (SUB200 wave-2 split of shell1c.layout2.test.ts):
 *   - the WinState machine: every gear transition probed
 *     (shell.toolwindow.mode), z-order counter monotonic;
 *   - auto-hide of transients; edge-size clamps.
 */

import { describe, test, expect, beforeEach } from "vitest";

import {
  autoHideTransients, clampEdgeSize, defaultLayoutV2, EDGE_SIZE_BOUNDS,
  frontWin, hideWin, moveWinTo, setEdgeSize, setWinMode, toggleWin,
} from "../src/layout2";
import { resetShellState, probes } from "./helpers/shellProbe";

beforeEach(resetShellState);

describe("layout2 — WinState machine (every gear transition probed)", () => {
  test("every VIEW MODE change probes shell.toolwindow.mode with from/to", () => {
    let l = defaultLayoutV2();
    l = setWinMode(l, "project", "dock", false, "gear");   // Dock Unpinned
    l = setWinMode(l, "project", "undock", false, "gear"); // Undock
    l = setWinMode(l, "project", "float", false, "gear");  // Float
    l = setWinMode(l, "project", "dock", true, "gear");    // Dock Pinned
    const hits = probes("shell.toolwindow.mode");
    expect(hits.length).toBe(4);
    expect(hits.map((e) => (e.payload.to as { mode: string; pinned: boolean }).mode))
      .toEqual(["dock", "undock", "float", "dock"]);
    expect((hits[0].payload.to as { pinned: boolean }).pinned).toBe(false);
    expect((hits[3].payload.to as { pinned: boolean }).pinned).toBe(true);
    expect(l.wins.project).toMatchObject({ mode: "dock", pinned: true, open: true });
  });

  test("MOVE TO docks pinned onto the target edge (probed)", () => {
    let l = defaultLayoutV2();
    l = setWinMode(l, "editor", "float", true, "gear");
    l = moveWinTo(l, "editor", "bottom", "gear");
    expect(l.wins.editor).toMatchObject({ mode: "dock", side: "bottom", pinned: true, open: true });
    const hit = probes("shell.toolwindow.mode").at(-1)!;
    expect(hit.payload.to).toMatchObject({ mode: "dock", side: "bottom", pinned: true });
  });

  test("float z-order counter is monotonic: entering float + fronting raise, never reuse", () => {
    let l = defaultLayoutV2();
    const z0 = l.zTop;
    l = setWinMode(l, "ai", "float", true, "gear");
    expect(l.wins.ai.z).toBe(z0 + 1);
    l = frontWin(l, "editor");
    expect(l.wins.editor.z).toBe(z0 + 2);
    expect(l.zTop).toBe(z0 + 2);
    // fronting the already-top window is a no-op (no counter churn)
    const same = frontWin(l, "editor");
    expect(same).toBe(l);
  });

  test("toggle open/close + hide are probed; toggling a float open raises it", () => {
    let l = defaultLayoutV2();
    l = toggleWin(l, "ai", "rail");
    expect(l.wins.ai.open).toBe(true);
    expect(l.wins.ai.z).toBe(l.zTop);
    l = hideWin(l, "ai", "gear Hide");
    expect(l.wins.ai.open).toBe(false);
    expect(probes("shell.toolwindow.open").length).toBe(2);
  });

  test("auto-hide closes EVERY open dock-unpinned + undocked window, probed per window", () => {
    let l = defaultLayoutV2();
    l = toggleWin(l, "pins", "rail");                       // dock-bottom UNPINNED, open
    l = setWinMode(l, "project", "undock", true, "gear");   // undocked, open
    const { layout, closed } = autoHideTransients(l);
    expect(closed.sort()).toEqual(["pins", "project"]);
    expect(layout.wins.pins.open).toBe(false);
    expect(layout.wins.project.open).toBe(false);
    expect(layout.wins.diag.open).toBe(true);  // pinned dock survives
    expect(layout.wins.editor.open).toBe(true); // float survives
    expect(probes("shell.toolwindow.autohide").length).toBe(2);
  });

  test("edge sizes clamp into the per-edge bounds (220–540 / 240–640 / 140–460)", () => {
    for (const side of ["left", "right", "bottom"] as const) {
      const b = EDGE_SIZE_BOUNDS[side];
      expect(clampEdgeSize(side, 0)).toBe(b.min);
      expect(clampEdgeSize(side, 99999)).toBe(b.max);
      expect(clampEdgeSize(side, b.min + 5)).toBe(b.min + 5);
    }
    let l = defaultLayoutV2();
    l = setEdgeSize(l, "left", 10);
    expect(l.sizeL).toBe(EDGE_SIZE_BOUNDS.left.min);
    l = setEdgeSize(l, "bottom", 9999);
    expect(l.sizeB).toBe(EDGE_SIZE_BOUNDS.bottom.max);
  });
});
