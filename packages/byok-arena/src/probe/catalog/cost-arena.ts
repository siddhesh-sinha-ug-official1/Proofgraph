// Catalog section — §6.H cost meter + §6.I arena (the round-trip gate) leads.
// Assembled (in this exact order) by ../catalog.ts; element-for-element what
// it always was.

import type { CatalogEntry } from "../bus.ts";
import { e } from "./entry.ts";

export function costEntries(): CatalogEntry[] {
  return [
    e("cost.estimate.input", "input", "{model,usage:Usage}", "what is being priced"),
    e("cost.estimate.lookup", "value", "{model,resolvedKey,table:{inputPerM,outputPerM,cacheReadPerM}}",
      "the per-model price row pulled from the snapshot table"),
    e("cost.estimate.unpricedModel", "decision", "{model,reason,estimatedCostUsd}",
      "[addition] model has no verified price row (dossier marks '(verify)') — priced 0 EXPLICITLY, never silently"),
    e("cost.estimate.tierCliff", "decision", "{cliff,applied,reason,branchNotTaken?}",
      "Sonnet 5 steps up Sep 1 2026; Gemini 2.5 Pro rate ~doubles above 200k prompt; 'none' otherwise"),
    e("cost.estimate.reasoningSplit", "value", "{reasoningTokens,billedAs,includedInOutputTokens}",
      "reasoning/thinking tokens billed as output on every provider; surfaced separately (can dominate cost)"),
    e("cost.estimate.compute", "value", "{inputCost,outputCost,cacheReadCost,totalUsd,billableInputTokens,billedOutputTokens}",
      "the arithmetic behind the number"),
    e("cost.estimate.output", "output", "{estimatedCostUsd}",
      "the priced result folded into Usage.estimatedCostUsd"),
    e("cost.estimate.snapshotWarn", "value", "{note}",
      "prices/model-IDs rev on the order of weeks; verify at runtime via list-models — the table is a snapshot, not truth"),
  ];
}

export function arenaEntries(): CatalogEntry[] {
  return [
    e("arena.dispatch.task", "input", "{task,providerA,providerB,modelA,modelB,mode}",
      "the identical task handed to both adapters (mode notes sequential dispatch for deterministic logicalClock)"),
    e("arena.dispatch.A", "call", "{provider,model}", "side A launched"),
    e("arena.dispatch.B", "call", "{provider,model}", "side B launched"),
    e("arena.collect.A", "output", "ChatResult", "side A's normalized result"),
    e("arena.collect.B", "output", "ChatResult", "side B's normalized result"),
    e("arena.toolExec", "value", "{side,call:ToolCall,output}",
      "[addition] the local tool execution fed back through submitToolResults on each side"),
    e("arena.compare.sameToolName", "decision", "{nameA,nameB,agree}", "did both pick the same tool?"),
    e("arena.compare.argsAreObjects", "decision", "{aIsObject,bIsObject,agree}",
      "TRAP 1 held on both — neither side's args is a raw string"),
    e("arena.compare.argsEquivalent", "value", "{argsA,argsB,equivalent,diff?}",
      "the parsed args match on the same task"),
    e("arena.compare.callIdEchoed", "decision", "{aEchoed,bEchoed}",
      "TRAP 2 held on both — each opaque id carried through to the result message"),
    e("arena.compare.resultShape", "decision", "{aShape,bShape,bothProviderCorrect}",
      "TRAP 3 held on both — provider-correct result messages built (validated from submit.request probe bodies)"),
    e("arena.compare.usageMapped", "decision", "{aMapped,bMapped}",
      "usage normalized on both from different native fields"),
    e("arena.compare.costPriced", "value", "{costA,costB}", "both priced through estimateCost"),
    e("arena.verdict", "decision", "{normalizationHolds,divergedAt,reason}",
      "THE proof — normalization HOLDS, or DIVERGES with exactly where and why (failure class named before any fix)"),
    e("arena.honestCeiling", "value", "{note}",
      "the arena proves normalization for THIS task only, not universally"),
    e("arena.timing", "timing", "{stage,wallNanos}", "[addition] full arena wall time"),
  ];
}
