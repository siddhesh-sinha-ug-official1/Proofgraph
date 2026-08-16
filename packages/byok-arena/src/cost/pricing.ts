// ============================================================================
// Cost meter (§5.1.3, §6.H, §7.5) — estimateCost prices a normalized Usage
// from the dossier's SNAPSHOT table (USD per million tokens). The table is a
// snapshot, not truth (snapshotWarn fires on every estimate). Tier cliffs:
//   - claude-sonnet-5: intro $2/$10 through Aug 31 2026 → standard $3/$15
//   - gemini-2.5-pro: rate ~doubles above a 200k-token prompt
// Reasoning/thinking tokens are billed as output on every provider; for
// Anthropic/OpenAI they are already INSIDE the native output count, for Gemini
// thoughtsTokenCount is SEPARATE from candidatesTokenCount and must be added.
// gpt-4.1 prices are marked "(verify)" in the dossier — NOT hardcoded; such
// models price to 0 with an explicit unpricedModel decision (never silently).
// ============================================================================

import type { ProbeBus } from "../probe/bus.ts";
import type { Provider, Usage } from "../interface.ts";

export interface PriceRow {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number | null;
}

// Snapshot pricing (§7.5), USD per million tokens.
export const PRICE_TABLE: Record<string, PriceRow> = {
  // Anthropic
  "claude-fable-5": { inputPerM: 10, outputPerM: 50, cacheReadPerM: 1 },
  "claude-opus-4-8": { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5 },
  "claude-sonnet-5#intro": { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.2 },
  "claude-sonnet-5#standard": { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3 },
  "claude-haiku-4-5": { inputPerM: 1, outputPerM: 5, cacheReadPerM: 0.1 },
  // OpenAI  (gpt-4.1 deliberately ABSENT: dossier marks its prices "(verify)")
  "gpt-5.6": { inputPerM: 2.5, outputPerM: 15, cacheReadPerM: 0.25 },
  "gpt-5.6-sol": { inputPerM: 2.5, outputPerM: 15, cacheReadPerM: 0.25 },
  "gpt-5.6-terra": { inputPerM: 1.25, outputPerM: 7.5, cacheReadPerM: 0.125 },
  "gpt-5.6-luna": { inputPerM: 0.5, outputPerM: 3, cacheReadPerM: 0.05 },
  "gpt-5.4-mini": { inputPerM: 0.375, outputPerM: 2.25, cacheReadPerM: 0.0375 },
  "gpt-5.4-nano": { inputPerM: 0.1, outputPerM: 0.625, cacheReadPerM: 0.01 },
  // Gemini (no cache-read column in the dossier table)
  "gemini-2.5-pro#le200k": { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: null },
  "gemini-2.5-pro#gt200k": { inputPerM: 2.5, outputPerM: 15, cacheReadPerM: null },
  "gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5, cacheReadPerM: null },
  "gemini-2.5-flash-lite": { inputPerM: 0.1, outputPerM: 0.4, cacheReadPerM: null },
  "gemini-3.5-flash": { inputPerM: 1.5, outputPerM: 9, cacheReadPerM: null },
};

/** Sonnet 5 steps up Sep 1 2026 (UTC) — hardcoding $2/$10 under-reports after. */
export const SONNET5_STANDARD_FROM_UTC = Date.UTC(2026, 8, 1); // 2026-09-01T00:00:00Z
export const GEMINI_25PRO_PROMPT_CLIFF = 200_000;

export function estimateCostForModel(
  bus: ProbeBus,
  provider: Provider,
  model: string,
  usage: Usage,
  now: Date,
): number {
  const stage = "cost.estimate";
  const inputEv = bus.emit("cost.estimate.input", stage, "input", { model, usage });
  const cause = bus.ref(inputEv);

  // --- resolve tier cliffs to a concrete price-table key ---------------------
  let resolvedKey = model;
  if (model === "claude-sonnet-5") {
    const intro = now.getTime() < SONNET5_STANDARD_FROM_UTC;
    resolvedKey = intro ? "claude-sonnet-5#intro" : "claude-sonnet-5#standard";
    bus.emit("cost.estimate.tierCliff", stage, "decision", {
      cliff: "anthropic.sonnet5.introVsStandard",
      applied: intro ? "intro" : "standard",
      reason: `now=${now.toISOString()} vs cliff 2026-09-01T00:00:00Z — ${intro ? "intro $2/$10 through Aug 31 2026" : "standard $3/$15 from Sep 1 2026"}`,
      branchNotTaken: intro ? "standard" : "intro",
    }, cause);
  } else if (model === "gemini-2.5-pro") {
    const over = usage.inputTokens > GEMINI_25PRO_PROMPT_CLIFF;
    resolvedKey = over ? "gemini-2.5-pro#gt200k" : "gemini-2.5-pro#le200k";
    bus.emit("cost.estimate.tierCliff", stage, "decision", {
      cliff: "gemini.2.5pro.200k",
      applied: over ? "gt200k" : "le200k",
      reason: `promptTokens=${usage.inputTokens} vs cliff ${GEMINI_25PRO_PROMPT_CLIFF} — rate ~doubles above it`,
      branchNotTaken: over ? "le200k" : "gt200k",
    }, cause);
  } else {
    bus.emit("cost.estimate.tierCliff", stage, "decision", {
      cliff: "none",
      applied: "flat",
      reason: "model has no tier cliff in the snapshot table",
    }, cause);
  }

  const row = PRICE_TABLE[resolvedKey];
  if (!row) {
    bus.emit("cost.estimate.unpricedModel", stage, "decision", {
      model,
      reason: "no verified price row in the snapshot table (dossier marks some models '(verify)' — not hardcoded; pull at runtime)",
      estimatedCostUsd: 0,
    }, cause);
    bus.log(`[cost] model "${model}" has no verified price row — estimate is 0 EXPLICITLY (unpricedModel lead fired; no silent guess)`);
    bus.emit("cost.estimate.snapshotWarn", stage, "value",
      { note: "prices/model-IDs rev on the order of weeks; verify at runtime via list-models" }, cause);
    bus.emit("cost.estimate.output", stage, "output", { estimatedCostUsd: 0 }, cause);
    return 0;
  }

  bus.emit("cost.estimate.lookup", stage, "value",
    { model, resolvedKey, table: row }, cause);

  // --- reasoning split -------------------------------------------------------
  const reasoningTokens = usage.reasoningTokens ?? 0;
  const includedInOutputTokens = provider !== "gemini"; // Gemini thoughts are OUTSIDE candidatesTokenCount
  bus.emit("cost.estimate.reasoningSplit", stage, "value", {
    reasoningTokens,
    billedAs: "output",
    includedInOutputTokens,
  }, cause);
  const billedOutputTokens = usage.outputTokens + (includedInOutputTokens ? 0 : reasoningTokens);

  // --- cache-read split ------------------------------------------------------
  // OpenAI prompt_tokens INCLUDES the cached portion (billed at the cache rate);
  // Anthropic input_tokens EXCLUDES cache reads (billed separately).
  const cachedTokens = usage.cachedInputTokens ?? 0;
  const billableInputTokens = provider === "openai"
    ? Math.max(0, usage.inputTokens - cachedTokens)
    : usage.inputTokens;

  const inputCost = (billableInputTokens * row.inputPerM) / 1_000_000;
  const outputCost = (billedOutputTokens * row.outputPerM) / 1_000_000;
  const cacheReadCost = row.cacheReadPerM !== null ? (cachedTokens * row.cacheReadPerM) / 1_000_000 : 0;
  const totalUsd = inputCost + outputCost + cacheReadCost;

  bus.emit("cost.estimate.compute", stage, "value", {
    inputCost, outputCost, cacheReadCost, totalUsd,
    billableInputTokens, billedOutputTokens,
  }, cause);
  bus.emit("cost.estimate.snapshotWarn", stage, "value",
    { note: "prices/model-IDs rev on the order of weeks; verify at runtime via list-models" }, cause);
  bus.emit("cost.estimate.output", stage, "output", { estimatedCostUsd: totalUsd }, cause);
  return totalUsd;
}
