// ============================================================================
// The one redaction (§3 rule 9). Every API key flows through the single
// redactKey() chokepoint before it can enter ANY probe payload, log line, or
// error object. Redacted form = { present, last4, provider, keyLen } — never
// the plaintext. The secret registry lets the leak scan (§6.J) PROVE rule 9:
// every key that ever passed the chokepoint is searched for in every lead.
// ============================================================================

import type { ProbeBus } from "./bus.ts";

export interface RedactedKey {
  present: boolean;
  last4: string;
  provider: string;
  keyLen: number;
}

// Module-private registry of every raw secret that ever passed the chokepoint.
// Deliberately NOT reachable from dump() — the scan reads it via _secretsForScan()
// and only ever reports counts and redacted sites, never contents.
const SECRET_REGISTRY: Set<string> = new Set();

export function registerSecret(raw: string): void {
  // keys shorter than 8 chars would make last4 leak most of the key; still register
  // so the scan can find them, but redaction always shows at most 4 chars.
  if (raw && raw.length > 0) SECRET_REGISTRY.add(raw);
}

/** THE chokepoint. Also registers the key for the leak scan. */
export function redactKey(key: string, provider: string): RedactedKey {
  registerSecret(key);
  return {
    present: key.length > 0,
    last4: key.slice(-4),
    provider,
    keyLen: key.length,
  };
}

/**
 * Redact and emit the vault.redact.boundary lead — the visible proof that the
 * chokepoint was exercised at this site.
 */
export function emitRedactBoundary(
  bus: ProbeBus,
  site: string,
  provider: string,
  key: string,
  causeId: string | null = null,
): RedactedKey {
  const red = redactKey(key, provider);
  bus.emit("vault.redact.boundary", "vault.redact", "value", { site, provider, key: red }, causeId);
  return red;
}

/** Internal accessor for the leak scan only. Never expose contents in a payload. */
export function _secretsForScan(): string[] {
  return [...SECRET_REGISTRY];
}

export function secretCount(): number {
  return SECRET_REGISTRY.size;
}

/** Test hook — isolates leak-scan tests from each other. */
export function _clearSecretsForTest(): void {
  SECRET_REGISTRY.clear();
}
