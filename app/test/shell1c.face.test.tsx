/**
 * UI-1C round — component suite for the graph-first shell's NEW chrome
 * (jsdom; the hub's endpoints MOCKED at exactly the contract shapes — the
 * same fixture discipline as shell.face.test.tsx, credited).
 *
 * SUB200 restructure (wave 2): split by describe-groups — this file keeps the
 * WELCOME + SEARCH groups; shell1c.face.windows.test.tsx carries the accent /
 * gear / rail / chrome-facts groups. Shared fixture hoisted VERBATIM to
 * test/helpers/shell1cFixture.tsx. No test renamed, no assertion weakened.
 *
 * Proven HERE:
 *  1. Welcome screen — Close project returns to it (probed); recents render
 *     from pgshell.recents; "New empty workspace" is honest-disabled with a
 *     reason; Open sample workspace re-enters the hub workspace flow (probed
 *     + a full refresh fires);
 *  2. Search Everywhere — BOTH sources (files via a bounded /fs/list walk +
 *     graph nodes from the served envelope), the walk + row bounds PROBED,
 *     debounced queries probed, a node hit selects over the V5 bus.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

import { installReactFlowShims } from "./helpers/reactFlowShims";
import { resetShellState, probes } from "./helpers/shellProbe";
import { FN_MAIN, renderShell, shellTabs, openMenu, menuItem } from "./helpers/shell1cFixture";
import { SEARCH_MAX_ROWS, searchHits } from "../src/SearchEverywhere";

beforeAll(installReactFlowShims);
beforeEach(resetShellState);
afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────

describe("1c — welcome screen (Close project returns; recents; honest disable)", () => {
  test("File > Close project → welcome (probed); recents listed; New-empty disabled with reason; Open sample re-enters the hub flow", async () => {
    const hub = await renderShell();
    // seed a recent through the real flow (explorer open)
    const explorer = await screen.findByTestId("explorer");
    fireEvent.click(within(explorer).getByText("moatpkg"));
    fireEvent.click(await within(explorer).findByText("helpers.py"));
    await waitFor(() => expect(shellTabs().getSnapshot().activePath).toBe("moatpkg/helpers.py"));

    openMenu("file");
    fireEvent.click(menuItem("close-project"));
    expect(probes("shell.project.close").length).toBe(1);
    const welcome = await screen.findByTestId("welcome-screen");
    // the canvas is gone — welcome replaces the IDE surface
    expect(screen.queryByTestId("graph-canvas")).toBeNull();
    // recents from pgshell.recents render
    expect(within(welcome).getAllByTestId("welcome-recent").length).toBeGreaterThan(0);
    within(welcome).getByText("moatpkg/helpers.py");
    // honest disable: New empty workspace carries a reason, never a dead button
    const emptyBtn = within(welcome).getByText("New empty workspace") as HTMLButtonElement;
    expect(emptyBtn.disabled).toBe(true);
    expect(emptyBtn.getAttribute("title")).toContain("hub-side declaration");

    // Open sample workspace = the current hub workspace flow (probed refresh)
    const graphCallsBefore = hub.calls.filter((c) => c.path === "/graph").length;
    fireEvent.click(within(welcome).getByTestId("open-sample-workspace"));
    expect(probes("shell.welcome.open-sample").length).toBe(1);
    expect(probes("shell.refresh").length).toBeGreaterThan(0);
    await screen.findByTestId("graph-canvas");
    await waitFor(() => {
      expect(hub.calls.filter((c) => c.path === "/graph").length).toBeGreaterThan(graphCallsBefore);
    });
  });
});

describe("1c — search everywhere (both sources, bounded + probed)", () => {
  test("files via bounded /fs/list walk + nodes from the served envelope; bounds probed; node hit selects on the bus", async () => {
    await renderShell();
    fireEvent.click(screen.getByTestId("search-everywhere-button"));
    const dlg = await screen.findByTestId("search-everywhere");
    // the walk is bounded AND probed with its bounds
    await waitFor(() => expect(probes("shell.search.files.walk").length).toBe(1));
    const walk = probes("shell.search.files.walk")[0].payload as { bounds: { maxDirs: number; maxFiles: number }; files: number };
    expect(walk.bounds).toEqual({ maxDirs: 40, maxFiles: 200 });
    expect(walk.files).toBeGreaterThan(0);

    // both sources visible before narrowing: a file row and a node row
    await within(dlg).findByText("moatpkg/core.py");
    await within(dlg).findByText("moatpkg.helpers.used_fn");

    // debounced query → probed with counts + the row bound
    fireEvent.change(within(dlg).getByLabelText("search everywhere"), { target: { value: "main" } });
    await waitFor(() => {
      const q = probes("shell.search.query").map((e) => e.payload.query);
      expect(q).toContain("main");
    });
    const last = probes("shell.search.query").at(-1)!.payload as { rowBound: number };
    expect(last.rowBound).toBe(SEARCH_MAX_ROWS);

    // node hit → V5 bus selection (probed) + the status bar shows the id
    fireEvent.click(await within(dlg).findByText("moatpkg.core.main"));
    expect(probes("shell.search.pick-node")[0].payload.nodeId).toBe(FN_MAIN);
    const bar = screen.getByTestId("status-bar");
    await within(bar).findByText(FN_MAIN);
    expect(screen.queryByTestId("search-everywhere")).toBeNull(); // closed on pick
  });

  test("searchHits (pure) bounds rows at SEARCH_MAX_ROWS and flags truncation", () => {
    const files = Array.from({ length: 30 }, (_, i) => `pkg/f${i}.py`);
    const { hits, truncated } = searchHits(files, [{ id: "n_1", name: "pkg.f" }], "f");
    expect(hits.length).toBe(SEARCH_MAX_ROWS);
    expect(truncated).toBe(true);
    const none = searchHits(files, [], "zzz-no-hit");
    expect(none.hits).toEqual([]);
    expect(none.truncated).toBe(false);
  });
});
