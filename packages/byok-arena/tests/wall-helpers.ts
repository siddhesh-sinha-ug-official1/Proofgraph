// Shared helpers for the Phase-1 wall conformance suite (split across
// wall-conformance.test.ts — construction gates + pins/catalog — and
// wall-conformance-face.test.ts — pins-vs-face + leak scan). Assertion
// content lives in the test files; this module only builds the test wall
// and reads pin payloads.

import assert from "node:assert/strict";

import { createByokWall } from "../src/wall.ts";
import type { ByokWall } from "../src/wall.ts";
import { providerHappyFetch } from "../src/testkit/fakefetch.ts";
import { makeCounterClock } from "./helpers.ts";

export const GOOD_SECRET = "assembled-master-secret-strong-0001";

export const ROUND_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.6",
  gemini: "gemini-3.5-flash",
};

export function makeTestWall(): ByokWall {
  return createByokWall({
    masterSecret: GOOD_SECRET,
    fetchImpl: providerHappyFetch(),
    retry: { maxRetries: 2, baseBackoffMs: 1, maxBackoffMs: 4, sleep: async () => {} },
    now: () => new Date("2026-07-19T00:00:00Z"),
    nanoClock: makeCounterClock(),
  });
}

export function lastPayload<T = any>(wall: ByokWall, probeId: string): T {
  const events = wall.pins.history().filter((e) => e.probeId === probeId);
  assert.ok(events.length > 0, `expected at least one pin event for ${probeId}`);
  return events[events.length - 1].payload as T;
}
