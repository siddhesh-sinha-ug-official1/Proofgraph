/**
 * Gate 15 — deterministic probe stream (§6.1). Same schema.json → identical
 * structural stream by logicalClock/causeId. Coordinate floats are compared under
 * tolerance (normalizeStream rounds them); wallNanos is never asserted.
 */

import { describe, expect, it } from "vitest";
import { runGraphView } from "./cell";
import { createMockGraphEventBus } from "./eventBus";
import { SKELETON, MERMAID_TRAP, normalizeStream } from "./testUtil";

describe("gate 15 — deterministic probe stream", () => {
  for (const [name, fixture] of [["skeleton", SKELETON], ["mermaid-trap", MERMAID_TRAP]] as const) {
    it(`${name}: two runs produce identical normalized streams (clock, cause, payload)`, async () => {
      const run1 = await runGraphView(fixture(), createMockGraphEventBus());
      const run2 = await runGraphView(fixture(), createMockGraphEventBus());

      const s1 = normalizeStream(run1.history());
      const s2 = normalizeStream(run2.history());
      expect(s1.length).toBeGreaterThan(30);
      expect(s1).toEqual(s2);
    });
  }

  it("logicalClock is strictly monotonic and is the only ordering key", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    const clocks = cell.history().map((e) => e.logicalClock);
    for (let i = 1; i < clocks.length; i++) expect(clocks[i]).toBe(clocks[i - 1] + 1);
  });

  it("every causeId refers to an EARLIER event in the same stream (causal chains never dangle or point forward)", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    const history = cell.history();
    const seen = new Set<string>();
    for (const e of history) {
      if (e.causeId !== null) {
        expect(seen.has(e.causeId), `causeId ${e.causeId} of ${e.probeId}#${e.logicalClock} must precede it`).toBe(true);
      }
      seen.add(`${e.probeId}#${e.logicalClock}`);
    }
  });

  it("wallNanos lives in its own field and is not part of the normalized assertion surface", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    for (const e of cell.history()) {
      expect(typeof e.wallNanos === "number" || e.wallNanos === null).toBe(true);
    }
    const normalized = normalizeStream(cell.history()) as Record<string, unknown>[];
    for (const e of normalized) expect("wallNanos" in e).toBe(false);
  });
});
