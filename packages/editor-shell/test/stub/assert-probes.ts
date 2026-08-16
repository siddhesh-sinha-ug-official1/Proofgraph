/**
 * Probe-assertion helpers: every self-test asserts on PROBE OUTPUT, not just
 * return values (Probe Density Contract rule 7). These make that ergonomic.
 */

import assert from "node:assert/strict";
import type { ProbeBus, ProbeEvent } from "../../src/probe/probe-bus.js";

export function eventsOf(bus: ProbeBus, probeId: string): ProbeEvent[] {
  return bus.history().filter((e) => e.probeId === probeId);
}

export function payloadsOf<T = Record<string, unknown>>(bus: ProbeBus, probeId: string): T[] {
  return eventsOf(bus, probeId).map((e) => e.payload as T);
}

export function lastPayload<T = Record<string, unknown>>(bus: ProbeBus, probeId: string): T {
  const all = payloadsOf<T>(bus, probeId);
  assert.ok(all.length > 0, `expected at least one "${probeId}" probe, saw none`);
  return all[all.length - 1];
}

export function assertFired(bus: ProbeBus, probeId: string, atLeast = 1): ProbeEvent[] {
  const evs = eventsOf(bus, probeId);
  assert.ok(
    evs.length >= atLeast,
    `expected "${probeId}" to fire >= ${atLeast} time(s); fired ${evs.length}`,
  );
  return evs;
}

export function assertNeverFired(bus: ProbeBus, probeId: string, context = ""): void {
  const evs = eventsOf(bus, probeId);
  assert.equal(
    evs.length,
    0,
    `expected "${probeId}" to NEVER fire${context ? ` (${context})` : ""}; fired ${evs.length}: ${JSON.stringify(evs[0]?.payload)}`,
  );
}

/** Assert a strictly increasing logicalClock ordering across the given ids. */
export function assertOrdered(bus: ProbeBus, probeIds: string[]): void {
  let lastClock = -1;
  for (const id of probeIds) {
    const evs = eventsOf(bus, id);
    assert.ok(evs.length > 0, `assertOrdered: "${id}" never fired`);
    const clock = evs[0].logicalClock;
    assert.ok(
      clock > lastClock,
      `assertOrdered: "${id}" (clock ${clock}) did not come after previous (clock ${lastClock})`,
    );
    lastClock = clock;
  }
}

/** Strip nondeterministic fields for history comparison (§9.10). */
export function normalizeHistory(events: ProbeEvent[]): unknown[] {
  return events.map((e) => ({
    probeId: e.probeId,
    cellId: e.cellId,
    stage: e.stage,
    kind: e.kind,
    payload: e.payload,
    logicalClock: e.logicalClock,
    causeId: e.causeId,
    // wallNanos intentionally dropped — never asserted on (contract rule 6).
  }));
}
