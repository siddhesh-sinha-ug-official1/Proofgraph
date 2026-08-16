// Shared test scaffolding: a deterministic cell (fake transport, counter
// nano-clock, fixed date, instant retry sleep) and the walking-skeleton flow.

import { createCell } from "../src/index.ts";
import type { Cell, CellOptions } from "../src/index.ts";
import type { ArenaReport } from "../src/arena/arena.ts";
import { providerHappyFetch } from "../src/testkit/fakefetch.ts";
import { executeWeatherTool, weatherTask } from "../src/testkit/goldens.ts";

export const TEST_KEYS = {
  anthropic: "sk-ant-api03-TESTKEY-alpha-0001",
  openai: "sk-oai-TESTKEY-bravo-0002",
  gemini: "AIzaTESTKEY-charlie-0003",
} as const;

/** Deterministic nano clock — every call advances exactly 1µs. */
export function makeCounterClock(): () => bigint {
  let n = 0n;
  return () => (n += 1000n);
}

export function makeTestCell(overrides: CellOptions = {}): Cell {
  return createCell({
    fetchImpl: providerHappyFetch(),
    masterSecret: "test-master-secret",
    retry: { maxRetries: 2, baseBackoffMs: 1, maxBackoffMs: 4, sleep: async () => {} },
    now: () => new Date("2026-07-19T00:00:00Z"),
    nanoClock: makeCounterClock(),
    ...overrides,
  });
}

/**
 * The §8 walking skeleton: vault store/retrieve → validateKey ×2 →
 * arena (Anthropic vs OpenAI) on the one get_weather task.
 */
export async function runSkeleton(cell: Cell): Promise<ArenaReport> {
  cell.vault.store("u1", "anthropic", TEST_KEYS.anthropic);
  cell.vault.store("u1", "openai", TEST_KEYS.openai);
  const keyA = cell.vault.retrieve("u1", "u1", "anthropic");
  const keyB = cell.vault.retrieve("u1", "u1", "openai");
  await cell.adapters.anthropic.validateKey(keyA);
  await cell.adapters.openai.validateKey(keyB);
  return cell.runArena({
    task: weatherTask,
    sideA: { adapter: cell.adapters.anthropic, model: "claude-sonnet-5", apiKey: keyA },
    sideB: { adapter: cell.adapters.openai, model: "gpt-5.6", apiKey: keyB },
    executeTool: () => executeWeatherTool(),
  });
}

export function payloadOf<T = any>(cell: Cell, probeId: string): T {
  const ev = cell.bus.last(probeId);
  if (!ev) throw new Error(`expected at least one event for ${probeId}`);
  return ev.payload as T;
}

export function payloadsOf<T = any>(cell: Cell, probeId: string): T[] {
  return cell.bus.find(probeId).map((e) => e.payload as T);
}
