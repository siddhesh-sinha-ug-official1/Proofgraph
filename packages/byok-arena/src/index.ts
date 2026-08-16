// ============================================================================
// Cell entry point — the AI outlet, fully instrumented, no membrane (Prime
// Directive). createCell() wires the probe bus, vault, three adapters, cost
// meter, arena, and leak scan behind the four introspection entry points:
//   probeCatalog() · dump() · tap(probeId) · history()
// Everything internal is exported on purpose. The Phase-1 wall (wall.ts) has
// since been carved OVER these pins — additive only; this entry point and its
// exports are unchanged by it. [doc updated: "later round" already happened]
// ============================================================================

import { ProbeBus } from "./probe/bus.ts";
import type { CatalogEntry, ProbeEvent } from "./probe/bus.ts";
import { buildCatalog } from "./probe/catalog.ts";
import { runSecretLeakScan } from "./probe/leakscan.ts";
import type { LeakScanReport } from "./probe/leakscan.ts";
import { KeyVault } from "./vault/vault.ts";
import { AnthropicAdapter } from "./adapters/anthropic.ts";
import { OpenAIAdapter } from "./adapters/openai.ts";
import { GeminiAdapter } from "./adapters/gemini.ts";
import type { AdapterRuntime, RetryPolicy } from "./adapters/shared.ts";
import { defaultRetryPolicy } from "./adapters/shared.ts";
import { runArena } from "./arena/arena.ts";
import type { ArenaConfig, ArenaReport } from "./arena/arena.ts";
import { estimateCostForModel } from "./cost/pricing.ts";
import type { ModelAdapter, Provider, Usage } from "./interface.ts";

export interface CellOptions {
  fetchImpl?: typeof fetch;
  masterSecret?: string | Buffer;
  retry?: Partial<RetryPolicy>;
  now?: () => Date;
  nanoClock?: () => bigint;
}

export interface Cell {
  bus: ProbeBus;
  vault: KeyVault;
  adapters: Record<Provider, ModelAdapter>;
  probeCatalog(): CatalogEntry[];
  dump(): { bus: ReturnType<ProbeBus["dump"]>; vault: ReturnType<KeyVault["dumpState"]> };
  tap(probeId: string, fn: (e: ProbeEvent) => void): () => void;
  history(): ProbeEvent[];
  runArena(cfg: ArenaConfig): Promise<ArenaReport>;
  runSecretLeakScan(): LeakScanReport;
  estimateCost(provider: Provider, model: string, usage: Usage): number;
}

export function createCell(opts: CellOptions = {}): Cell {
  const bus = new ProbeBus(buildCatalog(), opts.nanoClock);
  const vault = new KeyVault(bus, opts.masterSecret ?? "byok-arena-dev-master-secret-CHANGE-ME");
  const retry: RetryPolicy = { ...defaultRetryPolicy(), ...(opts.retry ?? {}) };
  const runtime: Partial<AdapterRuntime> = {
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    retry,
    ...(opts.now ? { now: opts.now } : {}),
  };
  const adapters: Record<Provider, ModelAdapter> = {
    anthropic: new AnthropicAdapter(bus, runtime),
    openai: new OpenAIAdapter(bus, runtime),
    gemini: new GeminiAdapter(bus, runtime),
  };
  return {
    bus,
    vault,
    adapters,
    probeCatalog: () => bus.probeCatalog(),
    dump: () => ({ bus: bus.dump(), vault: vault.dumpState() }),
    tap: (probeId, fn) => bus.tap(probeId, fn),
    history: () => bus.history(),
    runArena: (cfg) => runArena(bus, cfg),
    runSecretLeakScan: () => runSecretLeakScan(bus),
    estimateCost: (provider, model, usage) =>
      estimateCostForModel(bus, provider, model, usage, (opts.now ?? (() => new Date()))()),
  };
}

// full diagnostic surface — everything exported on purpose (the wall wraps these pins, never hides them)
export * from "./interface.ts";
export { ProbeBus } from "./probe/bus.ts";
export type { CatalogEntry, ProbeEvent, ProbeKind } from "./probe/bus.ts";
export { buildCatalog } from "./probe/catalog.ts";
export { redactKey, registerSecret, secretCount } from "./probe/redact.ts";
export type { RedactedKey } from "./probe/redact.ts";
export { runSecretLeakScan } from "./probe/leakscan.ts";
export type { LeakScanReport } from "./probe/leakscan.ts";
export { KeyVault } from "./vault/vault.ts";
export { AnthropicAdapter, ANTHROPIC_VERSION } from "./adapters/anthropic.ts";
export { OpenAIAdapter } from "./adapters/openai.ts";
export { GeminiAdapter, GEMINI_SYNTH_ID_PREFIX } from "./adapters/gemini.ts";
export * as openaiResponsesStub from "./adapters/openaiResponses.ts";
export { HOST_ALLOWLIST, defaultRetryPolicy } from "./adapters/shared.ts";
export type { RetryPolicy, AdapterRuntime } from "./adapters/shared.ts";
export { estimateCostForModel, PRICE_TABLE, SONNET5_STANDARD_FROM_UTC, GEMINI_25PRO_PROMPT_CLIFF } from "./cost/pricing.ts";
export type { PriceRow } from "./cost/pricing.ts";
export { runArena } from "./arena/arena.ts";
export type { ArenaConfig, ArenaReport, ArenaSide } from "./arena/arena.ts";
