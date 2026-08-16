/**
 * App-shell round — pre-GitHub cluster R (round R2 + R3).  The shell's
 * re-analyze must not silently downgrade the workspace's pyrightMode
 * (R2), and Open Folder must not leave tabs bound to the previous
 * workspace root (R3 — a stale relPath would 404 or land bytes in the
 * wrong file on the next save).
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { screen, cleanup, fireEvent, act, waitFor, within } from "@testing-library/react";

import { installReactFlowShims } from "./helpers/reactFlowShims";
import { resetShellState, probes } from "./helpers/shellProbe";
import { FN_MAIN, renderShell, shellTabs, openMenu, menuItem } from "./helpers/shellFaceFixture";

beforeAll(installReactFlowShims);
beforeEach(resetShellState);
afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────

describe("shell — R2: same-root re-analyze uses workspace.pyrightMode (never silently downgraded)", () => {
  test("hub launched with pyrightMode 'live' -> the re-analyze body carries pyright_mode 'live', NOT prefs default 'none'", async () => {
    const hub = await renderShell({ workspace: { pyrightMode: "live" } });
    // Drive a same-root re-analyze through the root-picker (a proven POST /analyze path
    // with no root-changing intent — matches the R2 sameRoot branch exactly).
    openMenu("analysis");
    fireEvent.click(menuItem("choose-roots"));
    const dialog = await screen.findByTestId("root-picker-dialog");
    await within(dialog).findByText(/moatpkg\.core\.main/);
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByText(/declare 1 root/));
    await waitFor(() => {
      const analyze = hub.calls.find((c) => c.method === "POST" && c.path === "/analyze");
      expect(analyze).toBeTruthy();
      const cfg = (analyze!.body as { extractorConfig: Record<string, string> }).extractorConfig;
      // The R2 fix: sameRoot => workspace.pyrightMode wins over prefs (default 'none').
      expect(cfg.pyright_mode).toBe("live");
      // The declared root passthrough is unchanged (regression guard for the dialogs test).
      expect((analyze!.body as { roots: string[] }).roots).toEqual([FN_MAIN]);
    });
  });

  test("workspace.pyrightMode null (unknown) -> falls back to prefs.pyrightMode", async () => {
    const hub = await renderShell({ workspace: { pyrightMode: null } });
    openMenu("analysis");
    fireEvent.click(menuItem("choose-roots"));
    const dialog = await screen.findByTestId("root-picker-dialog");
    await within(dialog).findByText(/moatpkg\.core\.main/);
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByText(/declare 1 root/));
    await waitFor(() => {
      const analyze = hub.calls.find((c) => c.method === "POST" && c.path === "/analyze");
      expect(analyze).toBeTruthy();
      const cfg = (analyze!.body as { extractorConfig: Record<string, string> }).extractorConfig;
      // Unknown workspace pyrightMode -> prefs.pyrightMode (defaults to 'none').
      expect(cfg.pyright_mode).toBe("none");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("shell — R3: workspace-root change invalidates open tabs (no silent save into the wrong jail)", () => {
  test("Open Folder -> workspace root changes -> clean tabs from the previous workspace close (probed)", async () => {
    const hub = await renderShell();
    // sanity: initial tab is open under the OLD workspace (fixture default)
    await waitFor(() => expect(shellTabs().getSnapshot().activePath).toBe("moatpkg/core.py"));
    expect(shellTabs().getSnapshot().tabs.map((t) => t.relPath)).toContain("moatpkg/core.py");

    // Now simulate an Open Folder that switches the hub's workspace root.
    // The mock's /workspace returns the NEW root after we mutate it — the shell
    // refetches /workspace on refreshAll (triggered by the runAnalyze success).
    act(() => hub.setWorkspace({ root: "C:/ws/other" }));

    // Drive a same-root re-analyze through the root-picker: it POSTs /analyze
    // and refreshAll re-fetches /workspace (which now returns the new root).
    // (Using root-picker keeps the test independent of the openFolder UI wiring;
    // the R3 fix hangs off workspace.root change detection, not the trigger.)
    openMenu("analysis");
    fireEvent.click(menuItem("choose-roots"));
    const dialog = await screen.findByTestId("root-picker-dialog");
    await within(dialog).findByText(/moatpkg\.core\.main/);
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByText(/declare 1 root/));

    // The workspace-changed probe fires and the stale tab is closed.
    await waitFor(() => {
      expect(probes("shell.workspace.changed").length).toBeGreaterThan(0);
    });
    const changed = probes("shell.workspace.changed")[0].payload as { from: string; to: string; tabsToClose: string[] };
    expect(changed.from).toBe("C:/ws/fixture");
    expect(changed.to).toBe("C:/ws/other");
    expect(changed.tabsToClose).toContain("moatpkg/core.py");
    await waitFor(() => {
      expect(shellTabs().getSnapshot().tabs.map((t) => t.relPath)).not.toContain("moatpkg/core.py");
    });
  });

  test("workspace root unchanged (same-root re-analyze) -> tabs are NOT closed", async () => {
    const hub = await renderShell();
    await waitFor(() => expect(shellTabs().getSnapshot().activePath).toBe("moatpkg/core.py"));
    // do NOT mutate the mock workspace — refreshAll returns the same root
    openMenu("analysis");
    fireEvent.click(menuItem("choose-roots"));
    const dialog = await screen.findByTestId("root-picker-dialog");
    await within(dialog).findByText(/moatpkg\.core\.main/);
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByText(/declare 1 root/));
    // wait for POST /analyze to land
    await waitFor(() => {
      expect(hub.calls.some((c) => c.method === "POST" && c.path === "/analyze")).toBe(true);
    });
    // give the refresh a beat — no workspace-changed probe should have fired
    await new Promise((r) => setTimeout(r, 50));
    expect(probes("shell.workspace.changed").length).toBe(0);
    expect(shellTabs().getSnapshot().tabs.map((t) => t.relPath)).toContain("moatpkg/core.py");
  });
});
