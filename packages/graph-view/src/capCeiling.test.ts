/**
 * Gate 14 — the honest ceiling (F7). A degraded render self-reports as degraded
 * and never claims full fidelity; the cell declares its ceilings with a
 * rationale; layout.engine honestly reports the coordinate provenance.
 * Split from cap.test.ts (SUB200 restructure — same tests, unchanged
 * assertions; gate 9 stays in cap.test.ts).
 */

import { describe, expect, it } from "vitest";
import { runGraphView } from "./cell";
import { createMockGraphEventBus } from "./eventBus";
import { SKELETON, eventsFor, payloadOf, soleEvent } from "./testUtil";

describe("gate 14 — the honest ceiling (F7)", () => {
  it("the cell declares its ceilings with a rationale", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    const limit = payloadOf<{ maxNodes: number; maxExpanded: number; rationale: string }>(
      soleEvent(cell.bus, "cap.limit"),
    );
    expect(limit.maxNodes).toBe(1500);
    expect(limit.maxExpanded).toBe(8);
    expect(limit.rationale).toContain("Monaco");
    expect(payloadOf<{ maxExpanded: number }>(soleEvent(cell.bus, "cap.expanded.limit")).maxExpanded).toBe(8);
  });

  it("a degraded render self-reports as degraded — never full fidelity", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus(), {
      capConfig: { maxNodes: 2 },
    });
    expect(cell.cap.mode).toBe("light-only");
    expect(cell.banner.bannerShown).toBe(true);
    expect(cell.dump().cap.mode).toBe("light-only"); // dump() tells the same story
    // Expansion (the richer tier) is refused while degraded, and says why.
    expect(cell.controller.requestExpand("A")).toBe(false);
    const refused = eventsFor(cell.bus, "link.expand.refused");
    expect(payloadOf<{ reason: string }>(refused[0]).reason).toContain("degrade mode light-only");
  });

  it("layout.engine honestly reports which engine + version + SPDX produced the coordinates", async () => {
    const cell = await runGraphView(SKELETON(), createMockGraphEventBus());
    const engine = payloadOf<{ name: string; version: string; spdx: string; worker: boolean }>(
      soleEvent(cell.bus, "layout.engine"),
    );
    expect(engine.name).toBe("elkjs");
    expect(engine.spdx).toBe("EPL-2.0");
    expect(engine.version).not.toBe("unknown");
    expect(engine.worker).toBe(false); // honest: no Worker under Node — and the decision says why
    const decision = payloadOf<{ useWorker: boolean; reason: string }>(
      soleEvent(cell.bus, "layout.worker.decision"),
    );
    expect(decision.useWorker).toBe(false);
    expect(decision.reason).toContain("no Web Worker");
  });
});
