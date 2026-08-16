// ============================================================================
// The ARENA — this cell's round-trip gate (§5.1.4, §6.I).
// Run two adapters on the SAME tool-call task, execute the tool locally, feed
// results back through submitToolResults, then compare the two NORMALIZED
// projections. Verdict: normalization HOLDS, or DIVERGES(where + why) — the
// failure class is named before any fix. Several comparisons read the probe
// stream itself (probes are the test substrate, §3 rule 7).
// Types + the TRAP-3 shape validators live in ./compare.ts (re-exported here
// so this module path keeps the arena's full public surface).
// ============================================================================

import type { ProbeBus } from "../probe/bus.ts";
import type { ChatResult, ToolCall } from "../interface.ts";
import type { ArenaConfig, ArenaReport } from "./compare.ts";
import { deepEqual, isPlainObject, validateResultShape } from "./compare.ts";

export type { ArenaConfig, ArenaReport, ArenaSide } from "./compare.ts";

export async function runArena(bus: ProbeBus, cfg: ArenaConfig): Promise<ArenaReport> {
  const t0 = bus.nowNanos();
  const stage = "arena";
  const pA = cfg.sideA.adapter.provider;
  const pB = cfg.sideB.adapter.provider;

  const taskEv = bus.emit("arena.dispatch.task", stage, "input", {
    task: cfg.task,
    providerA: pA, providerB: pB,
    modelA: cfg.sideA.model, modelB: cfg.sideB.model,
    mode: "sequential-dispatch (A then B) for deterministic logicalClock ordering",
  });
  const cause = bus.ref(taskEv);
  const dispatchClock = taskEv.logicalClock;

  // ---- dispatch + collect ---------------------------------------------------
  bus.emit("arena.dispatch.A", stage, "call", { provider: pA, model: cfg.sideA.model }, cause);
  const resultA = await cfg.sideA.adapter.chat({
    apiKey: cfg.sideA.apiKey, model: cfg.sideA.model,
    messages: cfg.task.messages, tools: cfg.task.tools, maxTokens: cfg.maxTokens,
  });
  bus.emit("arena.collect.A", stage, "output", resultA, cause);

  bus.emit("arena.dispatch.B", stage, "call", { provider: pB, model: cfg.sideB.model }, cause);
  const resultB = await cfg.sideB.adapter.chat({
    apiKey: cfg.sideB.apiKey, model: cfg.sideB.model,
    messages: cfg.task.messages, tools: cfg.task.tools, maxTokens: cfg.maxTokens,
  });
  bus.emit("arena.collect.B", stage, "output", resultB, cause);

  const callA: ToolCall | undefined = resultA.toolCalls[0];
  const callB: ToolCall | undefined = resultB.toolCalls[0];
  const divergedAt: string[] = [];

  // ---- tool execution + continuation (TRAP 2/3 end-to-end) ------------------
  let continuationA: ChatResult | null = null;
  let continuationB: ChatResult | null = null;
  if (callA) {
    const outA = cfg.executeTool(callA);
    bus.emit("arena.toolExec", stage, "value", { side: "A", call: callA, output: outA }, cause);
    continuationA = await cfg.sideA.adapter.submitToolResults({
      apiKey: cfg.sideA.apiKey, model: cfg.sideA.model, messages: cfg.task.messages,
      results: [{ toolCallId: callA.id, name: callA.name, output: outA }],
      tools: cfg.task.tools,
    });
  }
  if (callB) {
    const outB = cfg.executeTool(callB);
    bus.emit("arena.toolExec", stage, "value", { side: "B", call: callB, output: outB }, cause);
    continuationB = await cfg.sideB.adapter.submitToolResults({
      apiKey: cfg.sideB.apiKey, model: cfg.sideB.model, messages: cfg.task.messages,
      results: [{ toolCallId: callB.id, name: callB.name, output: outB }],
      tools: cfg.task.tools,
    });
  }

  // ---- compare: same tool name ---------------------------------------------
  const sameToolName = callA != null && callB != null && callA.name === callB.name;
  bus.emit("arena.compare.sameToolName", stage, "decision", {
    nameA: callA?.name ?? null, nameB: callB?.name ?? null, agree: sameToolName,
  }, cause);
  if (!sameToolName) divergedAt.push("sameToolName");

  // ---- compare: TRAP 1 — args are parsed objects on BOTH sides --------------
  const aIsObject = callA != null && isPlainObject(callA.args);
  const bIsObject = callB != null && isPlainObject(callB.args);
  bus.emit("arena.compare.argsAreObjects", stage, "decision", {
    aIsObject, bIsObject, agree: aIsObject && bIsObject,
  }, cause);
  if (!(aIsObject && bIsObject)) divergedAt.push("argsAreObjects");

  // ---- compare: parsed args match on the same task --------------------------
  const argsEquivalent = callA != null && callB != null && deepEqual(callA.args, callB.args);
  bus.emit("arena.compare.argsEquivalent", stage, "value", {
    argsA: callA?.args ?? null, argsB: callB?.args ?? null,
    equivalent: argsEquivalent,
    ...(argsEquivalent ? {} : { diff: `A=${JSON.stringify(callA?.args ?? null)} B=${JSON.stringify(callB?.args ?? null)}` }),
  }, cause);
  if (!argsEquivalent) divergedAt.push("argsEquivalent");

  // ---- compare: TRAP 2 — call id echoed (read from the probe stream) --------
  const echoedOk = (provider: string): boolean => {
    const echoes = bus.find(`adapter.${provider}.submit.idEcho`)
      .filter((e) => e.logicalClock > dispatchClock);
    return echoes.length > 0 && echoes.every((e) => (e.payload as { matchesReceived: boolean }).matchesReceived);
  };
  const aEchoed = callA != null && echoedOk(pA);
  const bEchoed = callB != null && echoedOk(pB);
  bus.emit("arena.compare.callIdEchoed", stage, "decision", { aEchoed, bEchoed }, cause);
  if (!(aEchoed && bEchoed)) divergedAt.push("callIdEchoed");

  // ---- compare: TRAP 3 — provider-correct result shapes (from probe bodies) -
  const submitBody = (provider: string): any => {
    const reqs = bus.find(`adapter.${provider}.submit.request`)
      .filter((e) => e.logicalClock > dispatchClock);
    return reqs.length > 0 ? (reqs[reqs.length - 1].payload as { body: unknown }).body : null;
  };
  const shapeA = callA != null ? validateResultShape(pA, submitBody(pA)) : { shape: "no-tool-call", correct: false };
  const shapeB = callB != null ? validateResultShape(pB, submitBody(pB)) : { shape: "no-tool-call", correct: false };
  bus.emit("arena.compare.resultShape", stage, "decision", {
    aShape: shapeA.shape, bShape: shapeB.shape,
    bothProviderCorrect: shapeA.correct && shapeB.correct,
  }, cause);
  if (!(shapeA.correct && shapeB.correct)) divergedAt.push("resultShape");

  // ---- compare: usage mapped on both ----------------------------------------
  const usageOk = (r: ChatResult) =>
    Number.isFinite(r.usage?.inputTokens) && Number.isFinite(r.usage?.outputTokens) &&
    (r.usage.inputTokens > 0 || r.usage.outputTokens > 0);
  const aMapped = usageOk(resultA);
  const bMapped = usageOk(resultB);
  bus.emit("arena.compare.usageMapped", stage, "decision", { aMapped, bMapped }, cause);
  if (!(aMapped && bMapped)) divergedAt.push("usageMapped");

  // ---- compare: both priced through estimateCost ----------------------------
  const costA = cfg.sideA.adapter.estimateCost(cfg.sideA.model, resultA.usage);
  const costB = cfg.sideB.adapter.estimateCost(cfg.sideB.model, resultB.usage);
  bus.emit("arena.compare.costPriced", stage, "value", { costA, costB }, cause);
  if (!(Number.isFinite(costA) && Number.isFinite(costB))) divergedAt.push("costPriced");

  // ---- verdict --------------------------------------------------------------
  const normalizationHolds = divergedAt.length === 0;
  const reason = normalizationHolds
    ? "both sides produced an equivalent neutral ToolCall (object args, echoed id, provider-correct result shape, mapped usage, priced cost) on the same task"
    : `normalization DIVERGES at: ${divergedAt.join(", ")} — failure class named before any fix`;
  bus.emit("arena.verdict", stage, "decision", { normalizationHolds, divergedAt, reason }, cause);
  bus.emit("arena.honestCeiling", stage, "value", {
    note: "the arena proves normalization for THIS task only, not universally",
  }, cause);
  bus.emit("arena.timing", stage, "timing",
    { stage: "arena", wallNanos: Number(bus.nowNanos() - t0) }, cause);

  return {
    normalizationHolds, divergedAt, reason,
    resultA, resultB, continuationA, continuationB, costA, costB,
  };
}
