// ============================================================================
// Shared adapter machinery — runtime half: retry policy, injectable runtime
// (fetch/clock), HTTP result + error-mapper shapes, and the header helpers.
// The send/receive loop that consumes these lives in ./send.ts; the original
// ../shared.ts facade re-exports both halves unchanged.
// ============================================================================

import type { AdapterErrorKind } from "../../interface.ts";

export interface RetryPolicy {
  maxRetries: number;      // additional attempts after the first (a bound — always logged)
  baseBackoffMs: number;
  maxBackoffMs: number;    // backoff cap (a bound — always logged)
  sleep: (ms: number) => Promise<void>;
}

export function defaultRetryPolicy(): RetryPolicy {
  return {
    maxRetries: 2,
    baseBackoffMs: 250,
    maxBackoffMs: 4000,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export interface AdapterRuntime {
  fetchImpl: typeof fetch;
  retry: RetryPolicy;
  now: () => Date;
}

export function defaultRuntime(overrides?: Partial<AdapterRuntime>): AdapterRuntime {
  return {
    fetchImpl: overrides?.fetchImpl ?? globalThis.fetch,
    retry: overrides?.retry ?? defaultRetryPolicy(),
    now: overrides?.now ?? (() => new Date()),
  };
}

export interface HttpOk {
  status: number;
  headers: Record<string, string>;
  body: any;
}

/** What a provider error mapper returns; the mapper emits its own probes. */
export interface MappedError {
  kind: AdapterErrorKind;
  message: string;
  retryAfterSec?: number;
  requestId?: string;
}

export type ProviderErrorMapper = (
  status: number,
  body: any,
  headers: Record<string, string>,
  ctx: { attempt: number; isFinalAttempt: boolean; causeId: string | null },
) => MappedError;

export function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, name) => { out[name.toLowerCase()] = value; });
  return out;
}

export function parseRetryAfterSec(headers: Record<string, string>): number | undefined {
  const raw = headers["retry-after"];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}
