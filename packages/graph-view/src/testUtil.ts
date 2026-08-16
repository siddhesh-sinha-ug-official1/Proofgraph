/**
 * Shared test substrate (test-only file — the boundary gate treats it as such).
 * Loads fixtures and provides probe-stream assertion helpers: every self-test
 * asserts on probe output, not just return values (Operating Contract rule 6).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProbeBus, ProbeEvent } from "./probeBus";

const here = dirname(fileURLToPath(import.meta.url));

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(here, "..", "fixtures", name), "utf8"));
}

export const SKELETON = () => loadFixture("skeleton.schema.json");
export const MERMAID_TRAP = () => loadFixture("mermaid-trap.schema.json");

/** All events for a probeId, in logicalClock order. */
export function eventsFor(bus: ProbeBus, probeId: string): ProbeEvent[] {
  return bus.filter({ probeId });
}

/** Exactly-one event for a probeId; throws (test-fails) otherwise. */
export function soleEvent(bus: ProbeBus, probeId: string): ProbeEvent {
  const evts = eventsFor(bus, probeId);
  if (evts.length !== 1) {
    throw new Error(`expected exactly 1 event for ${probeId}, got ${evts.length}`);
  }
  return evts[0];
}

export function payloadOf<T>(e: ProbeEvent): T {
  return e.payload as T;
}

/**
 * Normalize a probe stream for determinism comparison (§6.1):
 * wallNanos stripped everywhere (real time is never an ordering/assertion key);
 * coordinate floats rounded to a tolerance so an engine-version nudge is caught
 * by a snapshot rather than destabilizing the logical golden stream.
 */
export function normalizeStream(events: ProbeEvent[], decimals = 3): unknown[] {
  const factor = 10 ** decimals;
  const roundFloats = (v: unknown): unknown => {
    if (typeof v === "number" && !Number.isInteger(v)) return Math.round(v * factor) / factor;
    if (Array.isArray(v)) return v.map(roundFloats);
    if (typeof v === "object" && v !== null) {
      return Object.fromEntries(
        Object.entries(v)
          // $H is elkjs's process-global object counter leaking into the raw response
          // echo (layout.call.response) — engine bookkeeping, not a coordinate; it is
          // the one engine-internal field excluded from the determinism surface.
          .filter(([k]) => k !== "$H")
          .map(([k, val]) => [k, roundFloats(val)]),
      );
    }
    return v;
  };
  return events.map((e) => {
    let payload = roundFloats(e.payload);
    if (e.probeId === "layout.timing" || e.probeId === "render.timing") {
      payload = { ...(payload as object), wallNanos: 0 };
    }
    return {
      probeId: e.probeId,
      cellId: e.cellId,
      stage: e.stage,
      kind: e.kind,
      payload,
      logicalClock: e.logicalClock,
      causeId: e.causeId,
      // wallNanos deliberately omitted — never used for ordering or assertions
    };
  });
}
