// §6.H cost meter: tier cliffs (Sonnet 5 date cliff, Gemini 2.5 Pro 200k
// prompt cliff), reasoning-billed-as-output, cache-read pricing, and the
// explicit unpriced-model path (gpt-4.1 "(verify)" is NOT hardcoded).

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, payloadsOf } from "./helpers.ts";

function close(a: number, b: number, msg?: string) {
  assert.ok(Math.abs(a - b) < 1e-12, msg ?? `expected ${a} ≈ ${b}`);
}

const MILLION = { inputTokens: 1_000_000, outputTokens: 1_000_000 };

test("sonnet-5 INTRO pricing before Sep 1 2026 ($2/$10) with the tierCliff decision", () => {
  const cell = makeTestCell({ now: () => new Date("2026-07-19T00:00:00Z") });
  const cost = cell.estimateCost("anthropic", "claude-sonnet-5", MILLION);
  close(cost, 12);
  const cliff = payloadOf(cell, "cost.estimate.tierCliff");
  assert.equal(cliff.cliff, "anthropic.sonnet5.introVsStandard");
  assert.equal(cliff.applied, "intro");
  assert.equal(cliff.branchNotTaken, "standard");
});

test("sonnet-5 STANDARD pricing on/after Sep 1 2026 ($3/$15) — hardcoding intro would under-report", () => {
  const cell = makeTestCell({ now: () => new Date("2026-09-01T00:00:00Z") });
  close(cell.estimateCost("anthropic", "claude-sonnet-5", MILLION), 18);
  assert.equal(payloadOf(cell, "cost.estimate.tierCliff").applied, "standard");
});

test("gemini 2.5 pro 200k prompt cliff: ≤200k at $1.25/$10, >200k at $2.50/$15", () => {
  const cell = makeTestCell();
  const under = cell.estimateCost("gemini", "gemini-2.5-pro", { inputTokens: 100_000, outputTokens: 1_000 });
  close(under, 100_000 * 1.25 / 1e6 + 1_000 * 10 / 1e6);
  assert.equal(payloadOf(cell, "cost.estimate.tierCliff").applied, "le200k");

  const over = cell.estimateCost("gemini", "gemini-2.5-pro", { inputTokens: 300_000, outputTokens: 1_000 });
  close(over, 300_000 * 2.5 / 1e6 + 1_000 * 15 / 1e6);
  assert.equal(payloadOf(cell, "cost.estimate.tierCliff").applied, "gt200k");
});

test("reasoning tokens billed as OUTPUT: added for gemini (thoughts are outside candidatesTokenCount), already inside for openai/anthropic", () => {
  const cell = makeTestCell();
  const usage = { inputTokens: 0, outputTokens: 100, reasoningTokens: 50 };

  const gem = cell.estimateCost("gemini", "gemini-2.5-flash", usage);
  close(gem, 150 * 2.5 / 1e6, "gemini bills output + thoughts");
  const gemSplit = payloadOf(cell, "cost.estimate.reasoningSplit");
  assert.deepEqual(gemSplit, { reasoningTokens: 50, billedAs: "output", includedInOutputTokens: false });

  const oai = cell.estimateCost("openai", "gpt-5.6", usage);
  close(oai, 100 * 15 / 1e6, "openai completion_tokens already contains reasoning");
  assert.equal(payloadOf(cell, "cost.estimate.reasoningSplit").includedInOutputTokens, true);
});

test("cache reads: anthropic bills cache separately; openai carves cached out of prompt_tokens", () => {
  const cell = makeTestCell();
  const anth = cell.estimateCost("anthropic", "claude-haiku-4-5",
    { inputTokens: 1_000, outputTokens: 0, cachedInputTokens: 1_000 });
  close(anth, 1_000 * 1 / 1e6 + 1_000 * 0.1 / 1e6, "input_tokens EXCLUDES cache reads on anthropic");

  const oai = cell.estimateCost("openai", "gpt-5.6-luna",
    { inputTokens: 1_000, outputTokens: 0, cachedInputTokens: 400 });
  close(oai, 600 * 0.5 / 1e6 + 400 * 0.05 / 1e6, "prompt_tokens INCLUDES the cached portion on openai");
  const compute = payloadOf(cell, "cost.estimate.compute");
  assert.equal(compute.billableInputTokens, 600);
});

test("unpriced model (gpt-4.1 marked '(verify)'): 0 EXPLICITLY via the unpricedModel decision — never a silent guess", () => {
  const cell = makeTestCell();
  const cost = cell.estimateCost("openai", "gpt-4.1", { inputTokens: 1000, outputTokens: 1000 });
  assert.equal(cost, 0);
  const unpriced = payloadOf(cell, "cost.estimate.unpricedModel");
  assert.equal(unpriced.model, "gpt-4.1");
  assert.match(unpriced.reason, /not hardcoded/);
  assert.ok(cell.bus.getLogs().some((l) => l.includes("no verified price row")));
});

test("snapshotWarn fires on EVERY estimate — the table is a snapshot, not truth", () => {
  const cell = makeTestCell();
  cell.estimateCost("anthropic", "claude-fable-5", MILLION);
  cell.estimateCost("openai", "gpt-4.1", MILLION);
  const warns = payloadsOf(cell, "cost.estimate.snapshotWarn");
  assert.equal(warns.length, 2, "priced AND unpriced paths both warn");
  assert.match(warns[0].note, /verify at runtime/);
});

test("the arithmetic is on the compute lead and output folds into estimatedCostUsd", () => {
  const cell = makeTestCell();
  const cost = cell.estimateCost("anthropic", "claude-fable-5", { inputTokens: 420, outputTokens: 58 });
  const compute = payloadOf(cell, "cost.estimate.compute");
  close(compute.inputCost, 420 * 10 / 1e6);
  close(compute.outputCost, 58 * 50 / 1e6);
  close(compute.totalUsd, cost);
  close(payloadOf(cell, "cost.estimate.output").estimatedCostUsd, cost);
});

test("flat models record cliff:'none' — the no-cliff branch is visible too", () => {
  const cell = makeTestCell();
  cell.estimateCost("openai", "gpt-5.4-nano", MILLION);
  assert.equal(payloadOf(cell, "cost.estimate.tierCliff").cliff, "none");
});
