// ============================================================================
// Gemini adapter — error contract (§6.G): native status/googleStatus/reasons →
// AdapterErrorKind, including THE Gemini ambiguity: RESOURCE_EXHAUSTED is a
// transient rate limit OR a spend cap. Strategy (dossier §6.G): backoff;
// PERSISTENT through the retry cap → quota_exhausted (a spend cap never
// clears by waiting).
// ============================================================================

import type { AdapterError } from "../../interface.ts";
import type { MappedError } from "../shared.ts";
import { parseRetryAfterSec } from "../shared.ts";
import type { GeminiState } from "./wire.ts";

export function mapGeminiError(state: GeminiState, status: number, body: any,
  headers: Record<string, string>,
  ctx: { isFinalAttempt: boolean; causeId: string | null }): MappedError {
  const err = body?.error ?? {};
  const googleStatus: string | undefined = err.status;
  const reasons: string[] = (err.details ?? [])
    .map((d: any) => d?.reason)
    .filter((r: any) => typeof r === "string");
  const message: string = err.message ?? `HTTP ${status}`;
  const requestId: string | undefined = headers["x-request-id"];
  const retryAfterSec = parseRetryAfterSec(headers);

  let kind: AdapterError["kind"];
  let disambigReason: string | null = null;
  if (reasons.includes("API_KEY_INVALID") || status === 403 || googleStatus === "PERMISSION_DENIED") {
    kind = "invalid_key";
  } else if (status === 429 || googleStatus === "RESOURCE_EXHAUSTED") {
    // RESOURCE_EXHAUSTED is ambiguous: transient rate limit vs spend cap.
    // Strategy (dossier §6.G): backoff; PERSISTENT through the retry cap →
    // treat as quota_exhausted (a spend cap never clears by waiting).
    if (ctx.isFinalAttempt) {
      kind = "quota_exhausted";
      disambigReason = "RESOURCE_EXHAUSTED persisted through the whole backoff cap — treating as spend cap (quota_exhausted), not transient rate limit";
    } else {
      kind = "rate_limited";
      disambigReason = "RESOURCE_EXHAUSTED treated as transient rate limit — backoff and retry; will flip to quota_exhausted if it persists";
    }
  } else if (googleStatus === "FAILED_PRECONDITION") {
    kind = "quota_exhausted"; // typically: billing not enabled for this key
  } else if (status === 400) {
    kind = "bad_request";
  } else if (status === 500 || status === 503 || googleStatus === "INTERNAL" || googleStatus === "UNAVAILABLE") {
    kind = "overloaded";
  } else {
    kind = "unknown";
  }

  const ev = state.bus.emit("adapter.gemini.error.map", "adapter.gemini.error", "error", {
    raw: { error: { code: err.code ?? status, message: err.message ?? null, status: googleStatus ?? null, reasons } },
    mapped: { kind, ...(retryAfterSec !== undefined ? { retryAfterSec } : {}), ...(requestId ? { requestId } : {}) },
  }, ctx.causeId);

  if (disambigReason !== null) {
    state.bus.emit("adapter.gemini.error.quotaDisambig", "adapter.gemini.error", "decision", {
      status: 429,
      reason: disambigReason,
      kind,
      branchNotTaken: kind === "rate_limited" ? "quota_exhausted" : "rate_limited",
    }, state.bus.ref(ev));
  }
  return { kind, message, retryAfterSec, requestId };
}
