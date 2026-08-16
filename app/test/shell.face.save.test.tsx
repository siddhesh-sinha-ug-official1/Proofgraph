/**
 * App-shell round — component suite for the IDE shell, SAVE FLOW + PREFS +
 * STATUS BAR groups (SUB200 wave-2 split of shell.face.test.tsx; shared
 * fixture hoisted VERBATIM to test/helpers/shellFaceFixture.tsx).
 *
 * Proven HERE:
 *  4. prefs persistence — Ctrl+, opens Preferences; changes hit the versioned
 *     localStorage key AND the probe log (the theme data-theme flip is proven
 *     in shell.face.test.tsx's View-menu test, where that action lives);
 *  5. status-bar facts sourced from SERVED data — schema pin from /health,
 *     N/E/L from the served envelope, selected nodeId from the joined bus;
 *  6. save flow honesty — PUT /fs/file success clears dirty (probed); a hub
 *     path-escape refusal renders the NAMED class in the banner region.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { screen, cleanup, fireEvent, act, waitFor, within } from "@testing-library/react";

import { installReactFlowShims } from "./helpers/reactFlowShims";
import { resetShellState, probes } from "./helpers/shellProbe";
import {
  CORE_CONTENT, FN_MAIN, SCHEMA_HASH, renderShell, shellBus, shellTabs,
} from "./helpers/shellFaceFixture";
import { PREFS_KEY } from "../src/prefs";
import { isDirty } from "../src/tabsStore";

beforeAll(installReactFlowShims);
beforeEach(resetShellState);
afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────

describe("shell — save flow honesty", () => {
  test("Ctrl+S PUTs the buffer to /fs/file, clears dirty, probes shell.save.ok", async () => {
    const hub = await renderShell();
    act(() => shellTabs().updateBuffer("moatpkg/core.py", CORE_CONTENT + "# edit\n"));
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(probes("shell.save.ok").length).toBe(1));
    const put = hub.calls.find((c) => c.method === "PUT" && c.path === "/fs/file")!;
    expect((put.body as { path: string; content: string }).path).toBe("moatpkg/core.py");
    expect((put.body as { content: string }).content).toContain("# edit");
    expect(isDirty(shellTabs().find("moatpkg/core.py")!)).toBe(false); // L5 pre-GitHub: dirty derived
    expect(shellTabs().find("moatpkg/core.py")!.sha256).toBe("sha-core-1");
  });

  test("a hub path-escape refusal renders the NAMED class in the banner region — never silent", async () => {
    await renderShell({
      put: () => ({ status: 403, body: { failureClass: "path-escape", detail: "path escapes the workspace jail" } }),
    });
    act(() => shellTabs().updateBuffer("moatpkg/core.py", "x\n"));
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    const hits = await screen.findAllByText("path-escape", { exact: false });
    expect(hits.length).toBeGreaterThan(0);
    expect(probes("shell.save.failed")[0].payload.failureClass).toBe("path-escape");
    expect(isDirty(shellTabs().find("moatpkg/core.py")!)).toBe(true); // a refused save never fakes clean (L5 pre-GitHub: dirty derived)
  });
});

describe("shell — prefs (Ctrl+, dialog; versioned persistence; probed)", () => {
  test("Ctrl+, opens Preferences; a font-size change persists under pgshell.prefs.v1 and probes shell.pref.change", async () => {
    await renderShell();
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    const dialog = await screen.findByTestId("prefs-dialog");
    // SELECTOR ADAPTED for the UI-1C round (behavior unchanged): Settings is
    // now PAGED per the design spec — the font stepper lives on the
    // "Editor · Font" page; navigate there first. Persist + probe assertions
    // are identical (17 is inside the 1c 10–18 stepper bounds).
    fireEvent.click(within(dialog).getByText("Editor · Font"));
    fireEvent.change(within(dialog).getByLabelText("editor font size"), { target: { value: "17" } });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).editorFontSize).toBe(17);
    const change = probes("shell.pref.change").find((e) => e.payload.key === "editorFontSize");
    expect(change?.payload).toMatchObject({ from: 13, to: 17 });
    // Esc closes the dialog
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByTestId("prefs-dialog")).toBeNull();
  });
});

describe("shell — status bar facts come from SERVED data (never hardcoded)", () => {
  test("schema pin from /health, N/E/L from the served envelope, selected nodeId from the joined bus", async () => {
    await renderShell();
    const bar = screen.getByTestId("status-bar");
    // pin: the mocked /health's schemaVersion/hash prefix
    await within(bar).findByText(new RegExp(`v0/${SCHEMA_HASH.slice(0, 8)}`));
    // counts from the served id sets (3 nodes / 1 edge / 0 leads fixture)
    within(bar).getByText(/3 nodes · 1 edges · 0 leads/);
    // analysis honesty
    within(bar).getByText(/pending \(no-analysis-computed\)/);
    // selected nodeId arrives over the V5 joined bus (graph-origin select)
    act(() => shellBus().graphSide.emit({ type: "select", nodeId: FN_MAIN, source: "graph" }));
    await within(bar).findByText(FN_MAIN);
  });
});
