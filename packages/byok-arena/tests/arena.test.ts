// §6.I — the ARENA, this cell's round-trip gate. Two genuinely different
// native responses collapse to the same neutral ToolCall → verdict HOLDS.
// A sabotaged side (unparsed OpenAI arguments) → verdict DIVERGES naming
// argsAreObjects — the failure class, before any fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, runSkeleton, TEST_KEYS } from "./helpers.ts";
import { executeWeatherTool, weatherTask } from "../src/testkit/goldens.ts";
import type { ChatResult, ModelAdapter, Provider, Usage } from "../src/interface.ts";

test("round-trip gate HOLDS: anthropic vs openai on the identical get_weather task", async () => {
  const cell = makeTestCell();
  const report = await runSkeleton(cell);

  assert.equal(report.normalizationHolds, true, report.reason);
  assert.deepEqual(report.divergedAt, []);

  // the dispatch really was the identical task
  const task = payloadOf(cell, "arena.dispatch.task");
  assert.equal(task.providerA, "anthropic");
  assert.equal(task.providerB, "openai");
  assert.deepEqual(task.task.messages, weatherTask.messages);

  // both sides normalized to the same neutral call from different natives
  assert.equal(report.resultA.toolCalls[0].id, "toolu_01A8fGx");
  assert.equal(report.resultB.toolCalls[0].id, "call_9f2GOLD");
  assert.deepEqual(report.resultA.toolCalls[0].args, report.resultB.toolCalls[0].args);

  // every comparison lead agrees
  assert.deepEqual(payloadOf(cell, "arena.compare.sameToolName"),
    { nameA: "get_weather", nameB: "get_weather", agree: true });
  assert.deepEqual(payloadOf(cell, "arena.compare.argsAreObjects"),
    { aIsObject: true, bIsObject: true, agree: true });
  const argsEq = payloadOf(cell, "arena.compare.argsEquivalent");
  assert.equal(argsEq.equivalent, true);
  assert.deepEqual(argsEq.argsA, { location: "Paris" });
  assert.deepEqual(payloadOf(cell, "arena.compare.callIdEchoed"), { aEchoed: true, bEchoed: true });
  const shape = payloadOf(cell, "arena.compare.resultShape");
  assert.deepEqual(shape, {
    aShape: "tool_result-in-user-msg", bShape: "role:tool-msg", bothProviderCorrect: true,
  });
  assert.deepEqual(payloadOf(cell, "arena.compare.usageMapped"), { aMapped: true, bMapped: true });
  const cost = payloadOf(cell, "arena.compare.costPriced");
  assert.ok(cost.costA > 0 && cost.costB > 0);

  const verdict = payloadOf(cell, "arena.verdict");
  assert.equal(verdict.normalizationHolds, true);
  assert.deepEqual(verdict.divergedAt, []);

  // the gate's honest ceiling: task-scoped proof, not universal
  assert.match(payloadOf(cell, "arena.honestCeiling").note, /THIS task only/);

  // continuations completed on both sides
  assert.equal(report.continuationA?.text, "It's 15°C and sunny in Paris.");
  assert.equal(report.continuationB?.text, "It's 15°C and sunny in Paris.");
});

test("thickened gate HOLDS: anthropic vs GEMINI (third contestant) on the same task", async () => {
  const cell = makeTestCell();
  const report = await cell.runArena({
    task: weatherTask,
    sideA: { adapter: cell.adapters.anthropic, model: "claude-sonnet-5", apiKey: TEST_KEYS.anthropic },
    sideB: { adapter: cell.adapters.gemini, model: "gemini-3.5-flash", apiKey: TEST_KEYS.gemini },
    executeTool: () => executeWeatherTool(),
  });
  assert.equal(report.normalizationHolds, true, report.reason);
  assert.equal(payloadOf(cell, "arena.compare.resultShape").bShape, "functionResponse-part");
});

/** A sabotaged adapter: proxies the real one but un-parses args back to a string —
 *  exactly the bug an adapter that forgot JSON.parse would ship. */
class BrokenArgsAdapter implements ModelAdapter {
  readonly provider: Provider;
  private inner: ModelAdapter;
  constructor(inner: ModelAdapter) {
    this.inner = inner;
    this.provider = inner.provider;
  }
  validateKey(apiKey: string) { return this.inner.validateKey(apiKey); }
  async chat(req: Parameters<ModelAdapter["chat"]>[0]): Promise<ChatResult> {
    const r = await this.inner.chat(req);
    if (r.toolCalls[0]) {
      r.toolCalls = [{ ...r.toolCalls[0], args: JSON.stringify(r.toolCalls[0].args) as unknown as Record<string, unknown> }];
    }
    return r;
  }
  submitToolResults(req: Parameters<ModelAdapter["submitToolResults"]>[0]) { return this.inner.submitToolResults(req); }
  estimateCost(model: string, usage: Usage) { return this.inner.estimateCost(model, usage); }
}

test("round-trip gate DIVERGES on sabotage: unparsed OpenAI arguments named as the failure class", async () => {
  const cell = makeTestCell();
  const report = await cell.runArena({
    task: weatherTask,
    sideA: { adapter: cell.adapters.anthropic, model: "claude-sonnet-5", apiKey: TEST_KEYS.anthropic },
    sideB: { adapter: new BrokenArgsAdapter(cell.adapters.openai), model: "gpt-5.6", apiKey: TEST_KEYS.openai },
    executeTool: () => executeWeatherTool(),
  });
  assert.equal(report.normalizationHolds, false);
  assert.ok(report.divergedAt.includes("argsAreObjects"),
    `divergedAt names TRAP 1: ${JSON.stringify(report.divergedAt)}`);
  const verdict = payloadOf(cell, "arena.verdict");
  assert.equal(verdict.normalizationHolds, false);
  assert.match(verdict.reason, /DIVERGES/);
  const argsCmp = payloadOf(cell, "arena.compare.argsAreObjects");
  assert.deepEqual(argsCmp, { aIsObject: true, bIsObject: false, agree: false });
});

test("arena degenerate case: a side that makes no tool call diverges visibly, not silently", async () => {
  const cell = makeTestCell();
  const noCall: ModelAdapter = new (class extends BrokenArgsAdapter {
    async chat(req: Parameters<ModelAdapter["chat"]>[0]): Promise<ChatResult> {
      const r = await (cell.adapters.openai).chat(req);
      return { ...r, toolCalls: [] };
    }
  })(cell.adapters.openai);
  const report = await cell.runArena({
    task: weatherTask,
    sideA: { adapter: cell.adapters.anthropic, model: "claude-sonnet-5", apiKey: TEST_KEYS.anthropic },
    sideB: { adapter: noCall, model: "gpt-5.6", apiKey: TEST_KEYS.openai },
    executeTool: () => executeWeatherTool(),
  });
  assert.equal(report.normalizationHolds, false);
  assert.ok(report.divergedAt.includes("sameToolName"));
  assert.equal(payloadOf(cell, "arena.compare.sameToolName").nameB, null);
});
