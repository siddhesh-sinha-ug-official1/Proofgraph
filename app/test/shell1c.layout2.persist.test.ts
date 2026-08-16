/**
 * UI-1C round — unit suite for the windowing layer's PURE machinery, the
 * PERSISTENCE + MIGRATION group (SUB200 wave-2 split of
 * shell1c.layout2.test.ts):
 *   - persistence: v2 versioned key, corrupt blob = loud reset, v1→v2
 *     migration LOUD (probed with the mapping), reset removes the key.
 */

import { describe, test, expect, beforeEach } from "vitest";

import {
  defaultLayoutV2, EDGE_SIZE_BOUNDS, LAYOUT_V2_KEY, loadLayoutV2,
  migrateV1toV2, moveWinTo, resetLayoutV2, saveLayoutV2, setEdgeSize,
  setWinMode, WIN_CONST, WIN_IDS,
} from "../src/layout2";
import { LAYOUT_KEY as LAYOUT_V1_KEY } from "../src/layout";
import { __resetShellLogForTests } from "../src/shellLog";
import { resetShellState, probes } from "./helpers/shellProbe";

beforeEach(resetShellState);

describe("layout2 — persistence (v2 key; migrate-or-reset LOUDLY)", () => {
  test("save → load round-trip under pgshell.layout.v2; probed", () => {
    let l = defaultLayoutV2();
    l = setWinMode(l, "ai", "dock", true, "test");
    l = moveWinTo(l, "ai", "right", "test");
    l = setEdgeSize(l, "right", 400);
    saveLayoutV2(l, "test");
    expect(probes("shell.layout.change").length).toBe(1);
    expect(probes("shell.layout.change")[0].payload.persistedKey).toBe(LAYOUT_V2_KEY);
    const back = loadLayoutV2();
    expect(back.wins.ai).toMatchObject({ mode: "dock", side: "right", pinned: true, open: true });
    expect(back.sizeR).toBe(400);
  });

  test("a corrupt v2 blob resets to defaults LOUDLY (probed), never a half-parse", () => {
    localStorage.setItem(LAYOUT_V2_KEY, "{nope");
    const l = loadLayoutV2();
    expect(l).toEqual(defaultLayoutV2());
    expect(probes("shell.layout.load.reset").length).toBe(1);
  });

  test("stored edge sizes + float sizes are clamped on load (bounds survive reloads)", () => {
    const d = defaultLayoutV2();
    localStorage.setItem(LAYOUT_V2_KEY, JSON.stringify({
      ...d, sizeL: 5, sizeB: 9999,
      wins: { ...d.wins, editor: { ...d.wins.editor, w: 10, h: 10 } },
    }));
    const l = loadLayoutV2();
    expect(l.sizeL).toBe(EDGE_SIZE_BOUNDS.left.min);
    expect(l.sizeB).toBe(EDGE_SIZE_BOUNDS.bottom.max);
    expect(l.wins.editor.w).toBe(WIN_CONST.floatMinW);
    expect(l.wins.editor.h).toBe(WIN_CONST.floatMinH);
  });

  test("v1 → v2 migration is LOUD: probed with the mapping; v2 persists; v1 stays for rollback", () => {
    localStorage.setItem(LAYOUT_V1_KEY, JSON.stringify({
      explorerW: 305, graphW: 380, bottomH: 260,
      explorerVisible: false, graphVisible: true, bottomVisible: true, bottomTab: "pins",
    }));
    const l = loadLayoutV2();
    expect(l.wins.project.open).toBe(false);       // explorerVisible:false carried
    expect(l.sizeL).toBe(305);                      // explorerW carried
    expect(l.sizeB).toBe(260);                      // bottomH carried
    expect(l.wins.pins).toMatchObject({ open: true, mode: "dock", side: "bottom", pinned: true });
    expect(l.wins.diag.open).toBe(false);           // only the visible v1 tab opens
    const mig = probes("shell.layout.migrate");
    expect(mig.length).toBe(1);
    expect(mig[0].payload.outcome).toBe("migrated");
    expect((mig[0].payload.unmapped as { note: string }).note).toContain("full-bleed canvas");
    expect(localStorage.getItem(LAYOUT_V2_KEY)).not.toBeNull(); // migration persisted
    expect(localStorage.getItem(LAYOUT_V1_KEY)).not.toBeNull(); // rollback keeps v1
    // second load reads the persisted v2 — no second migration probe
    __resetShellLogForTests();
    loadLayoutV2();
    expect(probes("shell.layout.migrate").length).toBe(0);
  });

  test("an unparseable v1 blob migrates as a LOUD reset", () => {
    const l = migrateV1toV2("]]not json");
    expect(l).toEqual(defaultLayoutV2());
    expect(probes("shell.layout.migrate")[0].payload.outcome).toBe("reset");
  });

  test("reset removes the v2 key and probes", () => {
    saveLayoutV2(defaultLayoutV2(), "test");
    const l = resetLayoutV2();
    expect(l).toEqual(defaultLayoutV2());
    expect(localStorage.getItem(LAYOUT_V2_KEY)).toBeNull();
    expect(probes("shell.layout.reset").length).toBe(1);
  });

  test("every window id participates in the machine (the five-window contract)", () => {
    expect([...WIN_IDS]).toEqual(["project", "editor", "ai", "diag", "pins"]);
  });
});
