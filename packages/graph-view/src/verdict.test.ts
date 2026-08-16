/**
 * Gates 6–8 — the never-green guards and worst-case-wins.
 * F2 (the faked green): unknown fill / null outline / unknown outline may NEVER
 * render green. F5 (the misread trust base): the ring must reflect the worst of
 * the trust base; the worstOfCheck lead flags a declared status that disagrees.
 */

import { describe, expect, it } from "vitest";
import { ProbeBus } from "./probeBus";
import { KNOWN_PROBE_IDS } from "./probeCatalog";
import { ingest } from "./ingest";
import { paintVerdicts, COLORS, WORST_CASE_ORDER_STRING } from "./verdict";
import { SKELETON, eventsFor, payloadOf } from "./testUtil";

const GREENS = ["#2E7D32"]; // any green is a violation on unknown

function paintSkeleton(mutate?: (fixture: ReturnType<typeof SKELETON>) => void) {
  const bus = new ProbeBus(KNOWN_PROBE_IDS);
  const fixture = SKELETON();
  mutate?.(fixture);
  const { model } = ingest(fixture, bus);
  const result = paintVerdicts(model, bus, null);
  return { bus, result };
}

describe("gate 6 — unknown ≠ green (FILL)", () => {
  it("fill.status=unknown maps to the hatch, never any green, and the guard branch fires", () => {
    const { bus, result } = paintSkeleton();
    const paintC = result.paints.get("C")!;
    expect(paintC.fillHatched).toBe(true);
    expect(paintC.fillColor).toBe("#9E9E9E");
    expect(GREENS).not.toContain(paintC.fillColor);

    const guards = eventsFor(bus, "verdict.fill.unknownGuard");
    expect(guards).toHaveLength(1);
    expect(payloadOf<object>(guards[0])).toEqual({
      nodeId: "C", wouldBeGreen: false, mappedTo: "#9E9E9E hatched", reason: "unknown ≠ green",
    });
    // The guard's causal chain runs back through the fill decision for C.
    const decisionC = eventsFor(bus, "verdict.fill.decision").find((e) => (e.payload as { nodeId: string }).nodeId === "C")!;
    expect(guards[0].causeId).toBe(`verdict.fill.decision#${decisionC.logicalClock}`);
  });

  it("green fill comes ONLY from the real verdict already in the record (A: lean4-kernel)", () => {
    const { bus, result } = paintSkeleton();
    expect(result.paints.get("A")!.fillColor).toBe(COLORS.green);
    const inA = eventsFor(bus, "verdict.fill.in").find((e) => (e.payload as { nodeId: string }).nodeId === "A")!;
    expect(payloadOf<{ source: string }>(inA).source).toBe("lean4-kernel");
  });
});

describe("gate 7 — unknown ≠ green (OUTLINE)", () => {
  it("outline===null renders a grey ring with outlineWasNull=true, never green, and the null branch fires", () => {
    const { bus, result } = paintSkeleton();
    const paintC = result.paints.get("C")!;
    expect(paintC.outlineWasNull).toBe(true);
    expect(paintC.outlineColor).toBe("#9E9E9E");
    expect(GREENS).not.toContain(paintC.outlineColor);

    const branches = eventsFor(bus, "verdict.outline.nullBranch");
    expect(branches).toHaveLength(1);
    expect(payloadOf<object>(branches[0])).toEqual({
      nodeId: "C", mappedTo: "grey ring", outlineWasNull: true,
      reason: "outline not computed — render as unknown, never green",
    });
  });

  it("outline.status=unknown fires the outline-side never-green guard", () => {
    const { bus, result } = paintSkeleton((f) => {
      (f as { nodes: { outline: unknown }[] }).nodes[0].outline = { status: "unknown", worstOf: [] };
    });
    expect(result.paints.get("A")!.outlineColor).toBe("#9E9E9E");
    const guards = eventsFor(bus, "verdict.outline.unknownGuard");
    expect(guards).toHaveLength(1);
    expect(payloadOf<{ nodeId: string; wouldBeGreen: boolean }>(guards[0])).toMatchObject({
      nodeId: "A", wouldBeGreen: false,
    });
  });
});

describe("gate 8 — worst-case-wins (F5: the misread trust base)", () => {
  it("node B: amber body but RED ring — the worst of the trust base wins over the green-looking fill", () => {
    const { bus, result } = paintSkeleton();
    const paintB = result.paints.get("B")!;
    expect(paintB.fillColor).toBe(COLORS.amber);
    expect(paintB.outlineColor).toBe("#C62828");

    const decisionB = eventsFor(bus, "verdict.outline.decision").find(
      (e) => (e.payload as { nodeId: string }).nodeId === "B",
    )!;
    expect(payloadOf<{ ringColor: string }>(decisionB).ringColor).toBe("#C62828");

    const check = eventsFor(bus, "verdict.outline.worstOfCheck").find(
      (e) => (e.payload as { nodeId: string }).nodeId === "B",
    )!;
    expect(payloadOf<object>(check)).toMatchObject({
      worstOf: ["red"], derivedWorst: "red", declaredStatus: "red", consistent: true,
      order: WORST_CASE_ORDER_STRING,
    });
  });

  it("a declared status that disagrees with the re-derived worst is flagged consistent:false", () => {
    const { bus } = paintSkeleton((f) => {
      // Trust base contains red but the (gap-analysis-owned) status claims blue.
      (f as { nodes: { outline: unknown }[] }).nodes[1].outline = { status: "blue", worstOf: ["red", "lemma"] };
    });
    const check = eventsFor(bus, "verdict.outline.worstOfCheck").find(
      (e) => (e.payload as { nodeId: string }).nodeId === "B",
    )!;
    expect(payloadOf<object>(check)).toMatchObject({ derivedWorst: "red", declaredStatus: "blue", consistent: false });
  });

  it("definition/lemma rank between blue and none/green in the precedence — and definition maps to BLUE", () => {
    const { bus } = paintSkeleton((f) => {
      // Assembly ruling 1 (canonical worstTokenToStatus): definition→BLUE, not green
      // — the local definition→green decision was overridden at assembly. A
      // definition-dominated trust base is consistent with a declared BLUE ring.
      (f as { nodes: { outline: unknown }[] }).nodes[1].outline = { status: "blue", worstOf: ["lemma", "definition"] };
    });
    const check = eventsFor(bus, "verdict.outline.worstOfCheck").find(
      (e) => (e.payload as { nodeId: string }).nodeId === "B",
    )!;
    // definition (rank 3) is worse than lemma (rank 4); definition→blue (ruling 1).
    expect(payloadOf<object>(check)).toMatchObject({ derivedWorst: "definition", consistent: true });
  });

  it("a definition-dominated outline DECLARED green is now flagged inconsistent (ruling 1: definition→blue)", () => {
    const { bus } = paintSkeleton((f) => {
      // This exact shape was consistent:true pre-assembly (definition→green locally);
      // canonical WORST_TO_STATUS (ruling 1) makes it a red-flag mismatch.
      (f as { nodes: { outline: unknown }[] }).nodes[1].outline = { status: "green", worstOf: ["lemma", "definition"] };
    });
    const check = eventsFor(bus, "verdict.outline.worstOfCheck").find(
      (e) => (e.payload as { nodeId: string }).nodeId === "B",
    )!;
    expect(payloadOf<object>(check)).toMatchObject({ derivedWorst: "definition", declaredStatus: "green", consistent: false });
  });

  it("an unrecognized worstOf token ranks WORST and is reported (ruling 4), and the fused 'none/green' is banned from data", () => {
    const { bus } = paintSkeleton((f) => {
      // "none/green" is the pre-assembly fused spelling — canonical data must use
      // the split tokens, so it is now an unrecognized token: ranked worst,
      // reported, and never rank-flag-consistent.
      (f as { nodes: { outline: unknown }[] }).nodes[1].outline = { status: "green", worstOf: ["none/green", "lemma"] };
    });
    const check = eventsFor(bus, "verdict.outline.worstOfCheck").find(
      (e) => (e.payload as { nodeId: string }).nodeId === "B",
    )!;
    expect(payloadOf<object>(check)).toMatchObject({
      derivedWorst: "none/green", consistent: false,
      unrecognizedToken: true, unrecognizedTokens: ["none/green"],
    });
  });

  it("the verdict histogram census never launders unknown into green", () => {
    const { bus, result } = paintSkeleton();
    expect(result.counts).toEqual({ green: 1, amber: 1, red: 0, blue: 0, unknown: 1, nullOutline: 1 });
    const histograms = eventsFor(bus, "verdict.histogram");
    expect(histograms).toHaveLength(3); // running census, one per node — a firehose, no sampling
    expect(payloadOf<{ fill: { unknown: number; green: number } }>(histograms[2]).fill).toMatchObject({
      green: 1, unknown: 1,
    });
  });
});
