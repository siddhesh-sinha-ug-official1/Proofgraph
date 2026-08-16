// ============================================================================
// Shared adapter machinery — send half: host allowlist and the send/receive
// loop with the retry/stop branch, plus probe emission for every hop. Each
// provider adapter plugs in its own error mapper (native status/code →
// AdapterErrorKind) — the mapper itself emits the provider's error.map /
// disambig probes. Runtime shapes live in ./runtime.ts; the original
// ../shared.ts facade re-exports both halves unchanged.
// ============================================================================

import type { ProbeBus, ProbeEvent } from "../../probe/bus.ts";
import type { AdapterErrorKind, Provider } from "../../interface.ts";
import { AdapterFailure } from "../../interface.ts";
import type { AdapterRuntime, HttpOk, ProviderErrorMapper } from "./runtime.ts";
import { headersToObject } from "./runtime.ts";

export const HOST_ALLOWLIST = [
  "api.anthropic.com",
  "api.openai.com",
  "generativelanguage.googleapis.com",
] as const;

const RETRYABLE: AdapterErrorKind[] = ["rate_limited", "overloaded"];

export interface SendSpec {
  bus: ProbeBus;
  provider: Provider;
  stage: string;                       // e.g. "adapter.anthropic.chat.send"
  method: string;
  url: string;
  headers: Record<string, string>;               // real headers (carry the key)
  redactedHeaders: Record<string, unknown>;      // probe-safe headers (RedactedKey in place of the key)
  body?: unknown;
  probeIds: {
    hostAllowlist: string;
    request: string;
    response: string;
    rateLimitHeaders?: string;
    retryDecision: string;
    requestId: string;
  };
  /** Optional transform of the raw HTTP result into the response-probe payload. */
  responsePayload?: (r: HttpOk) => unknown;
  mapError: ProviderErrorMapper;
  runtime: AdapterRuntime;
  causeId: string | null;
  signal?: AbortSignal;
}

/**
 * One provider send with the full probe surface:
 *   hostAllowlist decision → request call → (response output + rateLimitHeaders)
 *   or (error.map [via mapper] → requestId → retryDecision → backoff/stop).
 * Throws AdapterFailure when the retry/stop branch says stop.
 */
export async function sendRequest(spec: SendSpec): Promise<{ ok: HttpOk; requestEvent: ProbeEvent }> {
  const { bus, probeIds, runtime } = spec;
  const url = new URL(spec.url);
  const allowed = (HOST_ALLOWLIST as readonly string[]).includes(url.hostname);
  bus.emit(probeIds.hostAllowlist, spec.stage, "decision", {
    host: url.hostname,
    allowed,
    allowlist: [...HOST_ALLOWLIST],
  }, spec.causeId);
  if (!allowed) {
    const err = new AdapterFailure({
      kind: "bad_request", status: 0,
      message: `host "${url.hostname}" is not on the provider allowlist — the key is only ever sent to the provider's own host`,
    });
    bus.recordError(err);
    throw err;
  }

  const { retry } = runtime;
  let lastFailure: AdapterFailure | null = null;

  for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
    const isFinalAttempt = attempt === retry.maxRetries;
    const requestEvent = bus.emit(probeIds.request, spec.stage, "call", {
      method: spec.method,
      host: url.hostname,
      path: url.pathname,
      url: spec.url,
      attempt,
      headers: spec.redactedHeaders,
      body: spec.body ?? null,
    }, spec.causeId);
    const cause = bus.ref(requestEvent);

    const res = await runtime.fetchImpl(spec.url, {
      method: spec.method,
      headers: spec.headers,
      body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined,
      signal: spec.signal,
    });
    const headers = headersToObject(res.headers);
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = { parseError: "response body was not valid JSON" };
    }

    if (res.ok) {
      const ok: HttpOk = { status: res.status, headers, body };
      if (probeIds.rateLimitHeaders) {
        const rl: Record<string, string> = {};
        for (const [name, value] of Object.entries(headers)) {
          if (name.includes("ratelimit") || name === "retry-after") rl[name] = value;
        }
        bus.emit(probeIds.rateLimitHeaders, spec.stage, "value", {
          headers: rl,
          ...(spec.provider === "gemini"
            ? { note: "served dynamically; lean on 429+backoff" }
            : {}),
        }, cause);
      }
      bus.emit(probeIds.response, spec.stage, "output",
        spec.responsePayload ? spec.responsePayload(ok) : { status: ok.status, headers: ok.headers, body: ok.body },
        cause);
      return { ok, requestEvent };
    }

    // ---- error path: mapper emits error.map (+ provider disambig probes) ----
    const mapped = spec.mapError(res.status, body, headers, { attempt, isFinalAttempt, causeId: cause });
    bus.emit(probeIds.requestId, spec.stage, "value",
      { requestId: mapped.requestId ?? null }, cause);

    const retryable = RETRYABLE.includes(mapped.kind);
    const willRetry = retryable && !isFinalAttempt;
    const expBackoff = Math.min(retry.baseBackoffMs * 2 ** attempt, retry.maxBackoffMs);
    const backoffMs = mapped.retryAfterSec !== undefined
      ? Math.min(mapped.retryAfterSec * 1000, retry.maxBackoffMs)
      : expBackoff;
    bus.emit(probeIds.retryDecision, spec.stage, "decision", {
      kind: mapped.kind,
      willRetry,
      ...(willRetry ? { backoffMs } : {}),
      ...(mapped.retryAfterSec !== undefined ? { retryAfterSec: mapped.retryAfterSec } : {}),
      cap: { maxRetries: retry.maxRetries, maxBackoffMs: retry.maxBackoffMs },
      reason: willRetry
        ? `${mapped.kind} is transient — attempt ${attempt + 1}/${retry.maxRetries + 1}, backing off ${backoffMs}ms (caps logged, never silent)`
        : retryable
          ? `${mapped.kind} but retry cap reached (maxRetries=${retry.maxRetries}) — stopping`
          : `${mapped.kind} is non-retryable — stopping (invalid_key→re-paste; quota_exhausted→user must add credit, it's their bill; bad_request→fix the request)`,
    }, cause);
    // No silent caps (Operating Contract rule 8): the bound is also on the log stream.
    bus.log(`[${spec.provider}] ${mapped.kind} HTTP ${res.status} attempt ${attempt + 1}/${retry.maxRetries + 1}; retry cap maxRetries=${retry.maxRetries}, backoff cap ${retry.maxBackoffMs}ms; willRetry=${willRetry}`);

    lastFailure = new AdapterFailure({
      kind: mapped.kind,
      status: res.status,
      message: mapped.message,
      ...(mapped.retryAfterSec !== undefined ? { retryAfterSec: mapped.retryAfterSec } : {}),
      ...(mapped.requestId !== undefined ? { requestId: mapped.requestId } : {}),
    });

    if (!willRetry) {
      bus.recordError(lastFailure);
      throw lastFailure;
    }
    await retry.sleep(backoffMs);
  }

  // unreachable — loop either returns or throws — but keep the honest fallback
  /* c8 ignore next */
  throw lastFailure ?? new AdapterFailure({ kind: "unknown", status: 0, message: "send loop exited without result" });
}
