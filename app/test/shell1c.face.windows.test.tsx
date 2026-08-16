/**
 * UI-1C round — component suite for the graph-first shell's NEW chrome,
 * ACCENT + TOOL-WINDOW + RAIL + CHROME-FACTS groups (SUB200 wave-2 split of
 * shell1c.face.test.tsx; shared fixture hoisted VERBATIM to
 * test/helpers/shell1cFixture.tsx).
 *
 * Proven HERE:
 *  3. Accent preference — free hex persists under pgshell.prefs.v1, probed,
 *     and drives --acc on the root (verdict fills stay canonical — the accent
 *     never reaches them);
 *  4. Tool-window gear menu — VIEW MODE transitions probed
 *     (shell.toolwindow.mode) + persisted under pgshell.layout.v2; "Window"
 *     is honest-disabled with the README's title string VERBATIM; Dock
 *     Unpinned then a canvas pointer-down AUTO-HIDES the window (probed);
 *  5. Rail — toggles windows (probed), active tint class tracks open state;
 *  6. Status bar — breadcrumbs from REAL data (workspace › file), hub chip
 *     dot reflects the real /health answer.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

import { installReactFlowShims } from "./helpers/reactFlowShims";
import { resetShellState, probes } from "./helpers/shellProbe";
import { renderShell, openMenu, menuItem } from "./helpers/shell1cFixture";
import { PREFS_KEY } from "../src/prefs";
import { LAYOUT_V2_KEY } from "../src/layout2";
import { WINDOW_MODE_DISABLED_REASON } from "../src/ToolWindows";

beforeAll(installReactFlowShims);
beforeEach(resetShellState);
afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────

describe("1c — accent preference (free hex; --acc only)", () => {
  test("Settings › Appearance accent hex persists under pgshell.prefs.v1, probes, and drives --acc on the root", async () => {
    await renderShell();
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    const dialog = await screen.findByTestId("prefs-dialog");
    // Appearance is the default page: swatch + hex field live here
    fireEvent.change(within(dialog).getByLabelText("accent hex"), { target: { value: "#3574D4" } });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).accentColor).toBe("#3574D4");
    const change = probes("shell.pref.change").find((e) => e.payload.key === "accentColor");
    expect(change?.payload).toMatchObject({ from: "#7C6FD4", to: "#3574D4" });
    const root = document.querySelector(".app-root") as HTMLElement;
    expect(root.style.getPropertyValue("--acc")).toBe("#3574D4");
    // a non-hex draft never persists (the field holds the draft, storage stays valid)
    fireEvent.change(within(dialog).getByLabelText("accent hex"), { target: { value: "#zz" } });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).accentColor).toBe("#3574D4");
  });
});

describe("1c — tool-window gear menu (WinState machine through the DOM)", () => {
  test("VIEW MODE transitions are probed + persisted; 'Window' is honest-disabled with the README string VERBATIM; unpinned auto-hides on canvas pointer-down", async () => {
    await renderShell();
    expect(screen.getByTestId("toolwindow-project")).toBeTruthy();
    fireEvent.click(screen.getByTestId("toolwindow-gear-project"));
    const gearPopup = await screen.findByTestId("gear-popup");

    // the honest-disable contract, string VERBATIM from the handoff README
    const windowRow = within(gearPopup).getByText("Window").closest("[data-gear-item]") as HTMLElement;
    expect(windowRow.getAttribute("aria-disabled")).toBe("true");
    expect(windowRow.getAttribute("title")).toBe(WINDOW_MODE_DISABLED_REASON);
    fireEvent.click(windowRow); // a blocked gear click is probed, never silent
    expect(probes("shell.toolwindow.gear.blocked").at(-1)!.payload).toMatchObject({ id: "project", item: "mode-window" });

    // Dock Unpinned → probed mode change, persisted under the v2 key
    fireEvent.click(within(gearPopup).getByText("Dock Unpinned"));
    const modeProbe = probes("shell.toolwindow.mode").at(-1)!.payload as { id: string; to: { mode: string; pinned: boolean } };
    expect(modeProbe.id).toBe("project");
    expect(modeProbe.to).toMatchObject({ mode: "dock", pinned: false });
    const stored = JSON.parse(localStorage.getItem(LAYOUT_V2_KEY)!) as { wins: { project: { pinned: boolean } } };
    expect(stored.wins.project.pinned).toBe(false);
    expect(screen.getByTestId("toolwindow-project").getAttribute("data-mode")).toBe("dock-unpinned");

    // canvas pointer-down auto-hides the unpinned window (probed per window)
    fireEvent.pointerDown(screen.getByTestId("graph-canvas"));
    expect(probes("shell.toolwindow.autohide").some((e) => e.payload.id === "project")).toBe(true);
    expect(screen.queryByTestId("toolwindow-project")).toBeNull();
  });

  test("MOVE TO docks pinned on the target edge; the current edge row is checked + disabled with a reason", async () => {
    await renderShell();
    fireEvent.click(screen.getByTestId("toolwindow-gear-project"));
    const gearPopup = await screen.findByTestId("gear-popup");
    const leftRow = within(gearPopup).getByText("Left").closest("[data-gear-item]") as HTMLElement;
    expect(leftRow.getAttribute("aria-disabled")).toBe("true"); // already docked left
    expect(leftRow.getAttribute("title")).toContain("already docked");
    fireEvent.click(within(gearPopup).getByText("Right"));
    expect(probes("shell.toolwindow.mode").at(-1)!.payload).toMatchObject({
      id: "project", to: { mode: "dock", side: "right", pinned: true },
    });
    const stored = JSON.parse(localStorage.getItem(LAYOUT_V2_KEY)!) as { wins: { project: { side: string } } };
    expect(stored.wins.project.side).toBe("right");
  });
});

describe("1c — rail + view-menu mirrors", () => {
  test("rail toggles a window (probed + persisted); active tint tracks open state; the View menu mirrors it", async () => {
    await renderShell();
    expect(screen.queryByTestId("toolwindow-ai")).toBeNull(); // ai defaults closed
    const railAi = screen.getByTestId("rail-ai");
    expect(railAi.className).not.toContain("rail-btn-active");
    fireEvent.click(railAi);
    expect(await screen.findByTestId("toolwindow-ai")).toBeTruthy();
    expect(screen.getByTestId("rail-ai").className).toContain("rail-btn-active");
    expect(probes("shell.toolwindow.open").at(-1)!.payload).toMatchObject({ id: "ai", open: true });

    // the View menu shows the mirrored check and toggles it back off
    openMenu("view");
    const item = menuItem("toggle-ai");
    expect(item.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(item);
    expect(screen.queryByTestId("toolwindow-ai")).toBeNull();
    expect(probes("shell.toolwindow.open").at(-1)!.payload).toMatchObject({ id: "ai", open: false });
  });

  test("Reset window layout restores the spec defaults (probed) and clears the v2 key", async () => {
    await renderShell();
    fireEvent.click(screen.getByTestId("rail-ai")); // mutate first (persists)
    expect(localStorage.getItem(LAYOUT_V2_KEY)).not.toBeNull();
    openMenu("view");
    fireEvent.click(menuItem("reset-layout"));
    expect(probes("shell.layout.reset").length).toBe(1);
    expect(localStorage.getItem(LAYOUT_V2_KEY)).toBeNull();
    expect(screen.queryByTestId("toolwindow-ai")).toBeNull(); // ai closed again per defaults
  });
});

describe("1c — sourced chrome facts (breadcrumbs + hub chip)", () => {
  test("breadcrumbs come from the served workspace + the active tab; the hub chip dot reflects the real /health", async () => {
    await renderShell();
    const bar = screen.getByTestId("status-bar");
    const crumbs = await within(bar).findByTestId("breadcrumbs");
    // workspace basename › tab path segments — all real served data
    expect(crumbs.textContent).toContain("fixture");
    expect(crumbs.textContent).toContain("moatpkg");
    expect(crumbs.textContent).toContain("core.py");

    const chip = screen.getByTestId("hub-chip");
    await waitFor(() => {
      expect(chip.querySelector(".hub-dot-ok")).not.toBeNull(); // /health answered
    });
    expect(chip.textContent).toContain("hub :");
  });
});
