// §3 rule 6: same input → same probe stream. Two fresh cells with identical
// deterministic inputs (fake transport, counter nano-clock, fixed date) must
// produce IDENTICAL histories — probeId, stage, kind, payload, logicalClock,
// causeId, and (because the clock is injected) even wallNanos. Real timings
// live only in wallNanos and are never used for ordering.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, runSkeleton } from "./helpers.ts";

test("two identical skeleton runs produce byte-identical probe streams", async () => {
  const cellA = makeTestCell();
  const cellB = makeTestCell();
  await runSkeleton(cellA);
  await runSkeleton(cellB);
  const histA = cellA.history();
  const histB = cellB.history();
  assert.equal(histA.length, histB.length, "same number of leads");
  assert.deepEqual(histA, histB, "identical ordered probe streams (incl. causal chain)");
});

test("logicalClock is strictly monotonic and causeId always points backwards", async () => {
  const cell = makeTestCell();
  await runSkeleton(cell);
  const hist = cell.history();
  const seen = new Map<string, number>();
  hist.forEach((ev, i) => {
    assert.equal(ev.logicalClock, i, "clock == position, no gaps, no reordering");
    assert.equal(ev.cellId, "ai.outlet");
    seen.set(`${ev.probeId}#${ev.logicalClock}`, ev.logicalClock);
    if (ev.causeId !== null) {
      const causeClock = seen.get(ev.causeId);
      assert.notEqual(causeClock, undefined, `causeId ${ev.causeId} must reference an earlier event`);
      assert.ok(causeClock! < ev.logicalClock, "causes precede effects");
    }
  });
});

test("payloads are frozen at emit time — later mutation cannot rewrite history", async () => {
  const cell = makeTestCell();
  const report = await runSkeleton(cell);
  // mutate the returned result object aggressively
  (report.resultA.toolCalls[0].args as Record<string, unknown>).location = "MUTATED";
  const collected = cell.bus.last("arena.collect.A")!.payload as { toolCalls: { args: { location: string } }[] };
  assert.equal(collected.toolCalls[0].args.location, "Paris", "probe history unaffected by caller mutation");
});
