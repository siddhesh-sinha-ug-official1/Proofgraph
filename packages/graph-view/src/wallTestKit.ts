/**
 * Shared substrate for the Phase-1 wall conformance suites (SUB200 restructure:
 * the split wall.conformance.* test files share these instead of each carrying
 * a copy). Conformance reads pins THROUGH THE WALL — pins.history(), never a
 * side channel. No vitest imports here: helpers throw plain Errors (which fail
 * the calling test), so the boundary census can sweep this file under the
 * production allow-list.
 */

import { createGraphViewWall, type WallPins } from "./wall";
import { createMockGraphEventBus } from "./eventBus";
import { SKELETON } from "./testUtil";
import type { ProbeEvent } from "./probeBus";

/** The served canonical envelope, as the neighbor (V4 hub) would serve it. */
export interface ServedEnvelope {
  schemaVersion: string;
  nodes: { id: string; fill: { status: string } }[];
  edges: { id: string }[];
  leads: { id: string }[];
}
export const serve = () => SKELETON() as ServedEnvelope;

// Conformance reads pins THROUGH THE WALL — pins.history(), never a side channel.
export const pinEvents = (pins: WallPins, probeId: string): ProbeEvent[] =>
  pins.history().filter((e) => e.probeId === probeId);
export const solePin = (pins: WallPins, probeId: string): ProbeEvent => {
  const evts = pinEvents(pins, probeId);
  if (evts.length !== 1) throw new Error(`expected exactly 1 pin event for ${probeId}, got ${evts.length}`);
  return evts[0];
};
export const idSet = (xs: readonly { id: string }[]) => new Set(xs.map((x) => x.id));

export async function standWall(opts?: Parameters<typeof createGraphViewWall>[2]) {
  const mockBus = createMockGraphEventBus();
  const wall = await createGraphViewWall(serve(), mockBus, opts);
  return { wall, mockBus };
}
