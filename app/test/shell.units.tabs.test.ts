/**
 * App-shell round — unit suite for the shell's pure machinery, the TABSSTORE
 * group (SUB200 wave-2 split of shell.units.test.ts):
 *   - TabsStore lifecycle: open/activate (the probed dispose+mount switch),
 *     buffer cache + dirty markers, the unsaved-close guard.
 */

import { describe, test, expect, beforeEach } from "vitest";

import { TabsStore, isDirty } from "../src/tabsStore";
import { resetShellState, probes } from "./helpers/shellProbe";

beforeEach(resetShellState);

const file = (relPath: string, content = "x = 1\n") => ({
  relPath, uri: `file:///ws/${relPath}`, languageId: "python",
  savedContent: content, sha256: "s0", readOnlyReason: null,
});

describe("TabsStore — lifecycle, dirty markers, unsaved-close guard (all probed)", () => {
  test("open + switch: activation probes the dispose+mount note (one-document bound)", () => {
    const s = new TabsStore();
    s.open(file("a.py"));
    s.open(file("b.py"));
    expect(s.getSnapshot().activePath).toBe("b.py");
    s.activate("a.py");
    const acts = probes("shell.tab.activate");
    expect(acts.length).toBe(3); // null→a, a→b, b→a
    expect(String(acts[2].payload.note)).toContain("dispose+mount");
    expect(acts[2].payload).toMatchObject({ from: "b.py", to: "a.py" });
  });

  test("re-opening an open tab just activates — no duplicate tab", () => {
    const s = new TabsStore();
    s.open(file("a.py"));
    s.open(file("b.py"));
    s.open(file("a.py"));
    expect(s.getSnapshot().tabs.length).toBe(2);
    expect(s.getSnapshot().activePath).toBe("a.py");
  });

  test("buffer cache + dirty marker: isDirty tracks divergence from savedContent, transitions probed (L5 pre-GitHub: dirty is derived, no stored field)", () => {
    const s = new TabsStore();
    s.open(file("a.py", "orig"));
    s.updateBuffer("a.py", "edited");
    expect(isDirty(s.find("a.py")!)).toBe(true);
    s.updateBuffer("a.py", "orig"); // typing back to saved content clears dirty
    expect(isDirty(s.find("a.py")!)).toBe(false);
    expect(probes("shell.tab.dirty").map((e) => e.payload.dirty)).toEqual([true, false]);
  });

  test("markSaved clears dirty and records the hub sha", () => {
    const s = new TabsStore();
    s.open(file("a.py", "orig"));
    s.updateBuffer("a.py", "edited");
    s.markSaved("a.py", "edited", "sha-new");
    const t = s.find("a.py")!;
    expect(isDirty(t)).toBe(false); // L5 pre-GitHub: dirty is derived (buffer===savedContent)
    expect(t.savedContent).toBe("edited");
    expect(t.sha256).toBe("sha-new");
  });

  test("unsaved-close guard: refusal keeps the tab + buffer (probed); confirm discards (probed)", () => {
    const s = new TabsStore();
    s.open(file("a.py", "orig"));
    s.updateBuffer("a.py", "edited");
    const closedNo = s.requestClose("a.py", () => false);
    expect(closedNo).toBe(false);
    expect(s.find("a.py")!.buffer).toBe("edited"); // buffer intact
    expect(probes("shell.tab.close.blocked-dirty").length).toBe(1);

    const closedYes = s.requestClose("a.py", () => true);
    expect(closedYes).toBe(true);
    expect(s.find("a.py")).toBeUndefined();
    expect(probes("shell.tab.close.discarded").length).toBe(1);
    expect(probes("shell.tab.close").length).toBe(1);
  });

  test("a clean tab closes without any confirm; the neighbor auto-activates", () => {
    const s = new TabsStore();
    s.open(file("a.py"));
    s.open(file("b.py"));
    let confirmCalled = 0;
    expect(s.requestClose("b.py", () => { confirmCalled++; return false; })).toBe(true);
    expect(confirmCalled).toBe(0);
    expect(s.getSnapshot().activePath).toBe("a.py");
  });
});
