/**
 * P3 — human-face component suite, the PAINTS group.
 *
 * SUB200 restructure (wave 2): split by describe-groups — overlay id-safety,
 * analysisSource honesty and the App error-surface group live in
 * p3.face.honesty.test.tsx (which also keeps the declared PENDING todo).
 * Shared fixture hoisted VERBATIM to test/helpers/p3fixture.ts. No test
 * renamed, no assertion weakened.
 *
 * What is proven HERE (component level, per the Phase-3 brief):
 *  1. /analysis fixture data (OUTERWALL-CONTRACT shape) overlaid on a served
 *     envelope renders EXACTLY the canonical paints — ring status per node ==
 *     the CANONICAL worstOfVerdict/WORST_TO_STATUS derivation from
 *     packages/schema/gen (no local tables anywhere in the assertion path),
 *     asserted against the graph-view WALL's own pins (dump().paints +
 *     verdict.outline.worstOfCheck), never a return value alone.
 *  2. The honest ceiling is never overridden: unknown fill stays hatched grey
 *     (never #2E7D32), a null outline renders "unknown"/not-yet-computed,
 *     an unrecognized worstOf token ranks WORST and renders unknown.
 */

import { describe, test, expect, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";

import { installReactFlowShims } from "./helpers/reactFlowShims";
import {
  MOD_CORE, FN_MAIN, FN_SIDE, MOD_HELP, FN_USED, FN_UNUSED,
  servedEnvelope, analysisVerdicts,
} from "./helpers/p3fixture";
import { overlayVerdicts, type AnalysisVerdict } from "../src/analysisSource";
import { createJoinedBus } from "../src/busAdapter";
import { createGraphViewWall, type GraphViewWall } from "@graph-view/src/wall";
import { COLORS } from "@graph-view/src/verdict";
import { worstOfVerdict, WORST_TO_STATUS, OUTLINE_WORST_ORDER } from "@schema/gen/graph-schema";

beforeAll(installReactFlowShims);

const disposables: GraphViewWall[] = [];
afterEach(() => {
  for (const w of disposables.splice(0)) {
    try { w.cell.controller.dispose(); } catch { /* already down */ }
  }
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────────────

describe("P3 face — /analysis paints (canonical WORST_TO_STATUS, no local tables)", () => {
  test("overlaid verdicts render paints that equal the canonical schema derivation, pin-verified", async () => {
    const env = servedEnvelope();
    const verdicts = analysisVerdicts();

    // fixture self-gate: every declared status IS the canonical derivation
    for (const [id, v] of Object.entries(verdicts)) {
      if (v.outline !== null && id !== FN_UNUSED) {
        expect(v.outline.status).toBe(worstOfVerdict(v.outline.worstOf).status);
      }
    }

    const overlaid = overlayVerdicts(env, verdicts);
    expect(overlaid.applied.length).toBe(6);
    expect(overlaid.unverdicted).toEqual([]);

    const bus = createJoinedBus();
    const wall = await createGraphViewWall(structuredClone(overlaid.envelope) as unknown, bus.graphSide);
    disposables.push(wall);

    const paints = wall.pins.dump().paints as Record<string, {
      fillStatus: string; fillColor: string; fillHatched: boolean;
      outlineStatus: string; outlineColor: string; outlineWasNull: boolean;
    }>;

    for (const [id, v] of Object.entries(verdicts)) {
      const paint = paints[id];
      expect(paint, `paint for ${id}`).toBeTruthy();
      // fill: exactly the analysis fill status; unknown stays hatched grey.
      expect(paint.fillStatus).toBe(v.fill.status);
      if (v.fill.status === "unknown") {
        expect(paint.fillHatched).toBe(true);
        expect(paint.fillColor).not.toBe(COLORS.green);
      }
      // ring: the CANONICAL derivation from the worstOf tokens — computed here
      // via packages/schema/gen worstOfVerdict/WORST_TO_STATUS, never a local table.
      const derived = worstOfVerdict(v.outline!.worstOf);
      const expectedRing = id === FN_UNUSED ? "unknown" : derived.status;
      expect(paint.outlineStatus).toBe(v.outline!.status);
      expect(paint.outlineStatus).toBe(expectedRing);
      expect(paint.outlineColor).toBe(COLORS[expectedRing as keyof typeof COLORS]);
      expect(paint.outlineWasNull).toBe(false);
    }

    // the WALL's own worst-of verification pins agree (declared == derived) for
    // every node whose declared status is the pure derivation; the lead-capped
    // node's cap (ruling 8) is DECLARED to differ and the cell's check says so.
    const checks = wall.pins.history().filter((e) => e.probeId === "verdict.outline.worstOfCheck");
    expect(checks.length).toBe(6);
    for (const c of checks) {
      const p = c.payload as { nodeId: string; consistent: boolean };
      expect(p.consistent).toBe(p.nodeId !== FN_UNUSED);
    }

    // spot-check the canonical mapping surface itself is what we think it is
    expect(WORST_TO_STATUS.definition).toBe("blue");
    expect(OUTLINE_WORST_ORDER[0]).toBe("red");
  });

  test("without /analysis the served nulls stay not-yet-computed — grey, never green (T4/T5 behavior not overridden)", async () => {
    const bus = createJoinedBus();
    const wall = await createGraphViewWall(structuredClone(servedEnvelope()) as unknown, bus.graphSide);
    disposables.push(wall);
    const paints = wall.pins.dump().paints as Record<string, {
      fillColor: string; fillHatched: boolean; outlineStatus: string; outlineWasNull: boolean;
    }>;
    for (const id of [MOD_CORE, FN_MAIN, FN_SIDE, MOD_HELP, FN_USED, FN_UNUSED]) {
      expect(paints[id].outlineWasNull).toBe(true);
      expect(paints[id].outlineStatus).toBe("unknown");
      expect(paints[id].fillHatched).toBe(true);
      expect(paints[id].fillColor).not.toBe(COLORS.green);
    }
    // leads render as leadEdge (dashed), never resolvedEdge
    const leadGuards = wall.pins.history().filter((e) => e.probeId === "render.edge.leadGuard");
    expect(leadGuards.length).toBe(1);
  });

  test("an unrecognized worstOf token ranks WORST and renders unknown (canonical policy through the face)", async () => {
    const env = servedEnvelope();
    const verdicts: Record<string, AnalysisVerdict> = {
      [FN_MAIN]: { fill: { status: "unknown", source: "" }, outline: { status: "unknown", worstOf: ["mystery-token", "green"] } },
    };
    // canonical: unrecognized -> status unknown
    expect(worstOfVerdict(["mystery-token", "green"]).status).toBe("unknown");
    const overlaid = overlayVerdicts(env, verdicts);
    const bus = createJoinedBus();
    const wall = await createGraphViewWall(structuredClone(overlaid.envelope) as unknown, bus.graphSide);
    disposables.push(wall);
    const paint = (wall.pins.dump().paints as Record<string, { outlineStatus: string; outlineColor: string }>)[FN_MAIN];
    expect(paint.outlineStatus).toBe("unknown");
    expect(paint.outlineColor).toBe(COLORS.unknown);
    const check = wall.pins.history()
      .filter((e) => e.probeId === "verdict.outline.worstOfCheck")
      .map((e) => e.payload as { nodeId: string; unrecognizedTokens?: string[] })
      .find((p) => p.nodeId === FN_MAIN);
    expect(check?.unrecognizedTokens).toEqual(["mystery-token"]);
  });
});
