// ============================================================================
// OpenAI adapter — error contract (§6.G): native status/code →
// AdapterErrorKind, including THE critical BYOK subtlety: OpenAI's 429 is
// overloaded — same status, opposite action. rate_limit_exceeded retries;
// insufficient_quota NEVER retries (it's the user's bill).
// ============================================================================

import type { AdapterError } from "../../interface.ts";
import type { MappedError } from "../shared.ts";
import { parseRetryAfterSec } from "../shared.ts";
import type { OpenAIState } from "./wire.ts";

export function mapOpenAIError(state: OpenAIState, status: number, body: any,
  headers: Record<string, string>,
  ctx: { causeId: string | null }): MappedError {
  const code: string | undefined = body?.error?.code;
  const type: string | undefined = body?.error?.type;
  const message: string = body?.error?.message ?? `HTTP ${status}`;
  const requestId: string | undefined = headers["x-request-id"];
  const retryAfterSec = parseRetryAfterSec(headers);

  let kind: AdapterError["kind"];
  if (status === 401 || code === "invalid_api_key") kind = "invalid_key";
  else if (status === 429) {
    // THE critical BYOK subtlety: OpenAI's 429 is overloaded. Same status,
    // opposite action — switch on error.code, never on the status alone.
    kind = code === "insufficient_quota" || type === "insufficient_quota"
      ? "quota_exhausted"
      : "rate_limited";
  }
  else if (status === 400) kind = "bad_request";
  else if (status === 500 || status === 503 || type === "server_error") kind = "overloaded";
  else kind = "unknown";

  const ev = state.bus.emit("adapter.openai.error.map", "adapter.openai.error", "error", {
    raw: { status, error: body?.error ?? null },
    mapped: { kind, ...(retryAfterSec !== undefined ? { retryAfterSec } : {}), ...(requestId ? { requestId } : {}) },
  }, ctx.causeId);

  if (status === 429) {
    state.bus.emit("adapter.openai.error.quotaDisambig", "adapter.openai.error", "decision", {
      status: 429,
      code: code ?? null,
      kind,
      reason: "switch on error.code not status — rate_limit_exceeded retries, insufficient_quota never succeeds (it's the user's bill; surface 'add credit')",
    }, state.bus.ref(ev));
  }
  return { kind, message, retryAfterSec, requestId };
}
