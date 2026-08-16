/**
 * [Wave-B D5] GapReportDialog blindSpots rendering test.
 *
 * The outer wall serves gapAnalysis.blindSpots as an ARRAY OF OBJECTS
 * shaped {source, blindSpots?: string[], payload?: object} (one entry per
 * source: model-wall unused query, extractor t3 soundness pins, per-dock
 * honestCeilings — see acceptance/analysis-moat.json).  Pre-D5, the
 * dialog did .map(String) over the array and rendered
 * "[object Object], [object Object]" instead of the vocabulary strings.
 * This test drives the dialog with a fixture that mirrors the served
 * shape (verbatim strings from analysis-moat.json) and asserts the real
 * vocabulary — "dynamic dispatch", "reflection", the extractor caveat,
 * the per-dock ceilings — appears in the rendered text, and that
 * "[object Object]" does NOT.
 */

import React from "react";
import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

import { GapReportDialog } from "../src/dialogInfo";

afterEach(() => cleanup());

// Verbatim shape from acceptance/analysis-moat.json (Wave-B ledger reference).
const MOAT_BLINDSPOTS = [
  { source: "graph-model.wall.query(unused)",
    blindSpots: ["dynamic dispatch", "reflection", "dynamic import"] },
  { source: "structure-extractor::extractor.t3.soundness.blindspots",
    payload: { caveat: "reachability-based 'unused' is only as complete as the edge set",
      missingEdgeClasses: ["dynamic dispatch", "reflection",
        "dependency injection", "dynamic imports"] } },
  { source: "structure-extractor.honestCeilings[python]",
    blindSpots: ["Pyright inference is static: runtime re-binding invisible",
      "grimp is module-granular: intra-module call structure needs Pyright",
      "reflection / DI edges not statically visible"] },
];

const MOAT_GAP: Record<string, unknown> = {
  unused: ["n_x"], unreferenced: ["n_x"], incompleteBases: {},
  blindSpots: MOAT_BLINDSPOTS,
  soundnessNote: "reachability-based 'unused' is only as complete as the resolved edge set",
};

describe("GapReportDialog — blindSpots served shape (D5)", () => {
  test("renders each blindSpots source with its vocabulary VERBATIM, not [object Object]", () => {
    render(<GapReportDialog gapAnalysis={MOAT_GAP} onClose={() => { /* noop */ }} />);
    const dialog = screen.getByTestId("gap-report-dialog");
    const section = within(dialog).getByTestId("blindspots-section");
    // The count reflects the served entries (3 sources), not stringified objects.
    expect(section.textContent).toContain("blind spots");
    expect(section.textContent).toContain("(3)");
    // Vocabulary strings appear verbatim (previously rendered as [object Object])
    const text = section.textContent ?? "";
    expect(text).toContain("dynamic dispatch");
    expect(text).toContain("reflection");
    expect(text).toContain("dynamic import");
    expect(text).toContain("Pyright inference is static: runtime re-binding invisible");
    // The extractor payload's caveat + missingEdgeClasses render (payload dict)
    expect(text).toContain("reachability-based");
    expect(text).toContain("dependency injection");
    // Each source has its own header, addressable
    expect(within(dialog).getByTestId("blindspot-source-0")).toBeTruthy();
    expect(within(dialog).getByTestId("blindspot-source-1")).toBeTruthy();
    expect(within(dialog).getByTestId("blindspot-source-2")).toBeTruthy();
    // The pre-D5 defect signature — must NOT appear anywhere in the section
    expect(text).not.toContain("[object Object]");
  });

  test("empty blindSpots array renders '(none)' — no source blocks", () => {
    render(<GapReportDialog gapAnalysis={{ blindSpots: [], incompleteBases: {} }}
                             onClose={() => { /* noop */ }} />);
    const section = within(screen.getByTestId("gap-report-dialog"))
      .getByTestId("blindspots-section");
    expect(section.textContent).toContain("(0)");
    expect(section.textContent).toContain("(none)");
    expect(screen.queryByTestId("blindspot-source-0")).toBeNull();
  });
});
