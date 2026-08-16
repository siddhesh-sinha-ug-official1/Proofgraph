/**
 * §9.10 — failure class: NONDETERMINISTIC PROBE STREAM.
 *
 * The same scenario run twice must produce identical probe histories —
 * identical probeId/logicalClock/causeId/payload sequences (wallNanos is
 * excluded by normalizeHistory and is never asserted). The logical clock is
 * gapless and strictly increasing, and every causeId resolves to an earlier
 * event that actually exists in the history.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { normalizeHistory } from "./stub/assert-probes.js";
import type { ProbeEvent } from "../src/probe/probe-bus.js";

/**
 * One fixed scenario: open type-error.py, two cursor moves, one user edit
 * (overwrite "undefined_name" [121,135) with "y" — clears the error), dispose.
 * NOTE: reads cell.probe.history() directly — cell.history() would append an
 * editor.probe.history event and perturb the stream under test.
 */
async function runScenario(): Promise<ProbeEvent[]> {
  const h = await openTestCell("type-error.py");
  h.adapter.moveCursor({ line: 1, column: 5 }); // inside add()
  h.adapter.moveCursor({ line: 9, column: 6 }); // inside broken()
  h.adapter.simulateUserEdit([{ rangeOffset: 121, rangeLength: 14, text: "y" }]);
  await h.cell.dispose();
  return h.cell.probe.history();
}

test("nondeterministic probe stream: identical scenario twice ⇒ identical normalized histories (probeId/clock/causeId/payload)", async () => {
  const runA = await runScenario();
  const runB = await runScenario();

  assert.ok(runA.length > 100, `scenario produced only ${runA.length} probe events — too thin to trust`);
  assert.equal(
    runA.length,
    runB.length,
    `event counts diverged across identical runs: ${runA.length} vs ${runB.length}`,
  );
  assert.deepEqual(
    normalizeHistory(runA),
    normalizeHistory(runB),
    "probe histories diverged across two identical runs — the stream is nondeterministic",
  );
});

test("nondeterministic probe stream: logicalClock is strictly increasing with no gaps (clock i+1 = clock i + 1)", async () => {
  const events = await runScenario();
  assert.ok(events.length > 0, "empty history");
  assert.equal(events[0].logicalClock, 1, `first event clock is ${events[0].logicalClock}, expected 1`);
  for (let i = 1; i < events.length; i++) {
    assert.equal(
      events[i].logicalClock,
      events[i - 1].logicalClock + 1,
      `clock gap/regression at index ${i}: ${events[i - 1].probeId}@${events[i - 1].logicalClock} → ${events[i].probeId}@${events[i].logicalClock}`,
    );
  }
});

test("nondeterministic probe stream: every causeId references an EARLIER event that exists in the history", async () => {
  const events = await runScenario();
  const byClock = new Map<number, ProbeEvent>(events.map((e) => [e.logicalClock, e]));
  let checked = 0;
  for (const e of events) {
    if (e.causeId === null) continue;
    const at = e.causeId.lastIndexOf("@");
    assert.ok(at > 0, `causeId "${e.causeId}" of ${e.probeId}@${e.logicalClock} is not "<probeId>@<clock>"`);
    const causeProbeId = e.causeId.slice(0, at);
    const causeClock = Number(e.causeId.slice(at + 1));
    const target = byClock.get(causeClock);
    assert.ok(
      target !== undefined,
      `dangling causeId: ${e.probeId}@${e.logicalClock} points at ${e.causeId}, but no event has clock ${causeClock}`,
    );
    assert.equal(
      target!.probeId,
      causeProbeId,
      `causeId mismatch: ${e.probeId}@${e.logicalClock} points at ${e.causeId}, but clock ${causeClock} is ${target!.probeId}`,
    );
    assert.ok(
      causeClock < e.logicalClock,
      `causal loop: ${e.probeId}@${e.logicalClock} caused by ${e.causeId}, which is not earlier`,
    );
    checked++;
  }
  assert.ok(checked > 50, `only ${checked} events carry a causeId — the causal chain is suspiciously thin`);
});
