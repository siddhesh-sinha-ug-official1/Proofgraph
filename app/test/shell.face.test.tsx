/**
 * App-shell round — component suite for the IDE shell (jsdom; the hub's
 * workspace-fs endpoints are MOCKED at exactly the APP-SHELL-CONTRACT shapes —
 * HUB-workspace-fs lands the live side in parallel; the Integrate stage runs
 * the live loop, never faked green here).
 *
 * SUB200 restructure (wave 2): the original single-file suite split by its
 * describe-groups — this file keeps the MENUBAR semantics; siblings carry the
 * explorer/tab (shell.face.tabs), save/prefs/status (shell.face.save) and
 * dialog (shell.face.dialogs) groups. Shared fixture + helpers hoisted
 * VERBATIM to test/helpers/shellFaceFixture.tsx. No test renamed, no
 * assertion weakened.
 *
 * Proven HERE:
 *  1. menubar semantics — items enabled/disabled per state WITH title reasons
 *     (no dead buttons), actions dispatch (Re-analyze → POST /analyze),
 *     activations probed, arrow-key nav + Esc-returns-focus accessibility;
 *     plus the View menu's tool-window toggle (persisted under
 *     pgshell.layout.v2, probed) and the theme data-theme flip.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, act, waitFor } from "@testing-library/react";

import { installReactFlowShims } from "./helpers/reactFlowShims";
import { resetShellState, probes } from "./helpers/shellProbe";
import {
  CORE_CONTENT, mockHub, renderShell, shellTabs, openMenu, menuItem,
} from "./helpers/shellFaceFixture";
import { PREFS_KEY } from "../src/prefs";

beforeAll(installReactFlowShims);
beforeEach(resetShellState);
afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────

describe("shell — menubar semantics (no dead buttons; actions dispatch; probed)", () => {
  test("Save is disabled-with-reason when clean, enabled when dirty; Export graph enabled once served; Import absent entirely", async () => {
    await renderShell();
    openMenu("file");
    const save = menuItem("save");
    expect(save.getAttribute("aria-disabled")).toBe("true");
    expect(save.getAttribute("title")).toContain("no unsaved changes");
    // export graph: served envelope exists → enabled
    expect(menuItem("export-graph").getAttribute("aria-disabled")).toBe("false");
    // export analysis: /analysis is PENDING → disabled with the named class in the reason
    const expAnalysis = menuItem("export-analysis");
    expect(expAnalysis.getAttribute("aria-disabled")).toBe("true");
    expect(expAnalysis.getAttribute("title")).toContain("no-analysis-computed");
    // Import is OMITTED per contract — no item anywhere
    expect(document.querySelector('[data-item*="import"]')).toBeNull();

    // dirty the buffer → Save becomes enabled
    act(() => shellTabs().updateBuffer("moatpkg/core.py", CORE_CONTENT + "unused_fn()\n"));
    expect(menuItem("save").getAttribute("aria-disabled")).toBe("false");
  });

  test("Re-analyze dispatches POST /analyze with the pyright config and the activation is probed", async () => {
    const hub = await renderShell();
    openMenu("file");
    fireEvent.click(menuItem("reanalyze"));
    await waitFor(() => {
      expect(hub.calls.some((c) => c.method === "POST" && c.path === "/analyze")).toBe(true);
    });
    const analyze = hub.calls.find((c) => c.method === "POST" && c.path === "/analyze")!;
    // Integrate-stage adaptation to the LANDED hub vocabulary (hub/server.py
    // analyze(), REPORT-appshell-hubfs): the re-run config crosses as
    // extractorConfig{pyright_mode} (snake_case) and 'root' is REQUIRED —
    // resolved from the served /workspace root, never guessed client-side.
    const body = analyze.body as { root: string; extractorConfig: { pyright_mode: string; python_package?: string } };
    expect(body.extractorConfig.pyright_mode).toBe("none"); // the declared re-run config
    expect(body.root).toBe("C:/ws/fixture"); // the served workspace root, hub-required
    expect(body.extractorConfig.python_package).toBe("moatpkg"); // the workspace's own package fact
    expect(probes("shell.menu.action").some((e) => e.payload.item === "reanalyze")).toBe(true);
    expect(probes("shell.analyze.request").length).toBe(1);
    // the refresh refetched /graph (byte-gate re-run)
    await waitFor(() => {
      expect(hub.calls.filter((c) => c.path === "/graph").length).toBeGreaterThanOrEqual(2);
    });
  });

  test("Edit menu items are disabled with the honest reason in headless mode (editor cannot mount)", async () => {
    await renderShell();
    openMenu("edit");
    for (const id of ["undo", "redo", "find", "replace"]) {
      const item = menuItem(id);
      expect(item.getAttribute("aria-disabled")).toBe("true");
      expect(item.getAttribute("title")).toContain("editor disabled (test/headless mode)");
    }
  });

  test("keyboard: ArrowDown walks items, ArrowRight moves to the next menu, Esc closes AND returns focus to the menubar button", async () => {
    await renderShell();
    // SELECTOR ADAPTED (UI-1C): the menubar mounts on hamburger toggle —
    // query it AFTER openMenu revealed it (keyboard semantics unchanged).
    openMenu("file");
    const bar = document.querySelector('[role="menubar"]')!;
    expect(document.querySelector(".menu-popup")).not.toBeNull();
    // ArrowDown moves item focus
    fireEvent.keyDown(bar, { key: "ArrowDown" });
    const focused = document.querySelector(".menu-item-focused")!;
    expect(focused.getAttribute("data-item")).toBe("open-file");
    // ArrowRight → Edit menu opens
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect((document.querySelector(".menu-popup") as HTMLElement).getAttribute("aria-label")).toBe("Edit");
    // Esc closes; focus returns to the Edit menubar button (contract)
    fireEvent.keyDown(bar, { key: "Escape" });
    expect(document.querySelector(".menu-popup")).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[data-menu="edit"]'));
  });

  test("a disabled item never fires — the block is PROBED, not silent", async () => {
    await renderShell();
    const hub = mockHub(); // fresh recorder not wired — we assert via probes
    void hub;
    openMenu("file");
    fireEvent.click(menuItem("save")); // clean tab → disabled
    expect(probes("shell.menu.blocked").length).toBe(1);
    expect(probes("shell.menu.action").some((e) => e.payload.item === "save")).toBe(false);
  });

  // SELECTOR ADAPTED for the UI-1C round (behavior unchanged): the v1 graph
  // dock became the full-bleed canvas, and the View menu now toggles the five
  // TOOL WINDOWS — the same behavior (menu toggle → visibility flip →
  // persisted+probed layout change) is asserted on the Project window under
  // the NEW v2 key.
  test("View menu toggles tool windows (persisted under pgshell.layout.v2) and flips the theme attribute", async () => {
    await renderShell();
    expect(document.querySelector('[data-testid="toolwindow-project"]')).not.toBeNull();
    openMenu("view");
    fireEvent.click(menuItem("toggle-project"));
    expect(document.querySelector('[data-testid="toolwindow-project"]')).toBeNull();
    expect(probes("shell.layout.change").length).toBeGreaterThan(0);
    expect(probes("shell.layout.change").at(-1)!.payload.persistedKey).toBe("pgshell.layout.v2");
    expect(probes("shell.toolwindow.open").at(-1)!.payload).toMatchObject({ id: "project", open: false });

    openMenu("view");
    fireEvent.click(menuItem("theme-light"));
    expect((document.querySelector(".app-root") as HTMLElement).getAttribute("data-theme")).toBe("light");
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).theme).toBe("light");
  });
});
