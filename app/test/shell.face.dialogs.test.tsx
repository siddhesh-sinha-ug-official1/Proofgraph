/**
 * App-shell round — component suite for the IDE shell, DIALOGS group
 * (SUB200 wave-2 split of shell.face.test.tsx; shared fixture hoisted
 * VERBATIM to test/helpers/shellFaceFixture.tsx).
 *
 * Proven HERE:
 *  7. Help > About carries the contract's out-of-scope list verbatim;
 *     root picker declares roots via POST /analyze{roots} (never inferred);
 *     gap report honest-disabled while /analysis is pending.
 */

import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

import { installReactFlowShims } from "./helpers/reactFlowShims";
import { resetShellState, probes } from "./helpers/shellProbe";
import { FN_MAIN, renderShell, openMenu, menuItem } from "./helpers/shellFaceFixture";
import { OUT_OF_SCOPE_VERBATIM } from "../src/dialogs";

beforeAll(installReactFlowShims);
beforeEach(resetShellState);
afterEach(() => cleanup());

// ─────────────────────────────────────────────────────────────────────────────

describe("shell — dialogs", () => {
  test("Help > About carries the contract's out-of-scope list VERBATIM + the honest tier statement", async () => {
    await renderShell();
    openMenu("help");
    fireEvent.click(menuItem("about"));
    const dialog = await screen.findByTestId("about-dialog");
    expect(within(dialog).getByTestId("out-of-scope").textContent).toBe(OUT_OF_SCOPE_VERBATIM);
    // headless: no measured stream → the stub-floor statement, no fabricated tier
    expect(within(dialog).getByText(/stub floor at tier G/)).toBeTruthy();
  });

  test("root picker lists /fs/roots-candidates, shows current declared roots, applies as POST /analyze{roots} — never inferred", async () => {
    const hub = await renderShell();
    openMenu("analysis");
    fireEvent.click(menuItem("choose-roots"));
    const dialog = await screen.findByTestId("root-picker-dialog");
    const row = await within(dialog).findByText(/moatpkg\.core\.main/);
    // select it and apply
    fireEvent.click(within(dialog).getByRole("checkbox"));
    void row;
    fireEvent.click(within(dialog).getByText(/declare 1 root/));
    await waitFor(() => {
      const analyze = hub.calls.find((c) => c.method === "POST" && c.path === "/analyze");
      expect(analyze).toBeTruthy();
      expect((analyze!.body as { roots: string[] }).roots).toEqual([FN_MAIN]);
    });
    expect(probes("shell.roots.declared")[0].payload.roots).toEqual([FN_MAIN]);
  });

  test("gap report is disabled with the pending reason while /analysis is not computed (never fabricated)", async () => {
    await renderShell();
    openMenu("analysis");
    const item = menuItem("gap-report");
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.getAttribute("title")).toContain("pending (no-analysis-computed)");
  });
});
