// Shared catalog-section helpers: the entry constructor and the provider list
// the per-provider sections expand over. Sections live beside this module;
// ../catalog.ts is the aggregator (and the only public buildCatalog surface).

import type { CatalogEntry, ProbeKind } from "../bus.ts";

export const PROVIDERS = ["anthropic", "openai", "gemini"] as const;

export function e(probeId: string, kind: ProbeKind, payloadType: string, description: string): CatalogEntry {
  return { probeId, kind, payloadType, description };
}
