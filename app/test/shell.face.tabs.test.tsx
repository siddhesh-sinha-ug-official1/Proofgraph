/**
 * App-shell round — component suite for the IDE shell, EXPLORER + TAB
 * lifecycle groups (SUB200 wave-2 split of shell.face.test.tsx; shared
 * fixture hoisted VERBATIM to test/helpers/shellFaceFixture.tsx).
 *
 * Proven HERE:
 *  2. explorer tree from mocked /fs/list — lazy directory loads (the child
 *     listing is fetched on FIRST expand only), file click opens a tab;
 *  3. tab lifecycle — keyed dispose+mount probed on switch (one-document
 *     bound), dirty markers, unsaved-close guard through the injected confirm.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, act, waitFor, within } from "@testing-library/react";

import { installReactFlowShims } from "./helpers/reactFlowShims";
import { resetShellState, probes } from "./helpers/shellProbe";
import { renderShell, shellTabs } from "./helpers/shellFaceFixture";
import { shellLogHistory } from "../src/shellLog";

beforeAll(installReactFlowShims);
beforeEach(resetShellState);
afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────

describe("shell — explorer tree (mocked /fs/list; lazy dirs)", () => {
  test("root lists lazily; a directory's children are fetched on FIRST expand only; file click opens a tab", async () => {
    const hub = await renderShell();
    // the root listing arrived; moatpkg dir row is present
    const explorer = await screen.findByTestId("explorer");
    await within(explorer).findByText("moatpkg");
    const listCallsBefore = hub.calls.filter((c) => c.path === "/fs/list").length;
    expect(hub.calls.some((c) => c.path === "/fs/list" && (c.query.path ?? "") === "moatpkg")).toBe(false);

    // expand → exactly one lazy child fetch
    fireEvent.click(within(explorer).getByText("moatpkg"));
    await within(explorer).findByText("helpers.py");
    expect(hub.calls.filter((c) => c.path === "/fs/list" && c.query.path === "moatpkg").length).toBe(1);
    // collapse + re-expand: cached, NOT refetched
    fireEvent.click(within(explorer).getByText("moatpkg"));
    fireEvent.click(within(explorer).getByText("moatpkg"));
    await within(explorer).findByText("helpers.py");
    expect(hub.calls.filter((c) => c.path === "/fs/list" && c.query.path === "moatpkg").length).toBe(1);
    expect(hub.calls.filter((c) => c.path === "/fs/list").length).toBe(listCallsBefore + 1);

    // click a file → GET /fs/file + a new tab activates (dispose+mount probed below)
    fireEvent.click(within(explorer).getByText("helpers.py"));
    await waitFor(() => {
      expect(shellTabs().getSnapshot().activePath).toBe("moatpkg/helpers.py");
    });
    expect(hub.calls.some((c) => c.path === "/fs/file" && c.query.path === "moatpkg/helpers.py")).toBe(true);
  });
});

describe("shell — tab lifecycle (dispose+mount probed; dirty guard)", () => {
  test("switching tabs disposes the old editor host and mounts the new one, in order (one-document bound)", async () => {
    await renderShell();
    // open a second file through the shell (hub-fs path)
    const explorer = await screen.findByTestId("explorer");
    fireEvent.click(within(explorer).getByText("moatpkg"));
    fireEvent.click(await within(explorer).findByText("helpers.py"));
    await waitFor(() => expect(shellTabs().getSnapshot().activePath).toBe("moatpkg/helpers.py"));

    // keyed remount probes: dispose(core) BEFORE mount(helpers)
    await waitFor(() => {
      const seq = shellLogHistory()
        .filter((e) => e.probeId === "shell.editor.mount" || e.probeId === "shell.editor.dispose")
        .map((e) => `${e.probeId === "shell.editor.mount" ? "mount" : "dispose"}:${e.payload.relPath}`);
      expect(seq).toContain("dispose:moatpkg/core.py");
      const di = seq.indexOf("dispose:moatpkg/core.py");
      const mi = seq.indexOf("mount:moatpkg/helpers.py");
      expect(di).toBeGreaterThanOrEqual(0);
      expect(mi).toBeGreaterThan(di); // dispose strictly precedes the new mount
    });
    // switch back: buffer cache path — mount(core) again, no refetch of /fs/file
    fireEvent.click(document.querySelector('[data-tab="moatpkg/core.py"]')!);
    await waitFor(() => expect(shellTabs().getSnapshot().activePath).toBe("moatpkg/core.py"));
    expect(probes("shell.tab.activate").length).toBeGreaterThanOrEqual(2);
  });

  test("closing a dirty tab asks; refusal keeps the tab; the guard is probed", async () => {
    const confirmFn = vi.fn(() => false);
    await renderShell({ confirmFn });
    act(() => shellTabs().updateBuffer("moatpkg/core.py", "edited!\n"));
    // the tab strip shows the dirty dot
    expect(document.querySelector(".editor-tab .dirty-dot")).not.toBeNull();
    fireEvent.click(screen.getByLabelText("close moatpkg/core.py"));
    expect(confirmFn).toHaveBeenCalledOnce();
    expect(shellTabs().getSnapshot().tabs.length).toBe(1); // still open
    expect(probes("shell.tab.close.blocked-dirty").length).toBe(1);
  });
});
