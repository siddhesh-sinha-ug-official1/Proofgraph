// ============================================================================
// Anthropic adapter — wire shapes + error contract: endpoint/version
// constants, the adapter's mutable TRAP-2/3 state, the request builders
// (system lifted to top-level; flat input_schema tool decl), and the §6.G
// error mapper (native status/type → AdapterErrorKind, with the spikeGuard
// note on rate limits). See ../anthropic.ts (facade) for the full trap map.
// ============================================================================

import type { ProbeBus } from "../../probe/bus.ts";
import type { AdapterError, Msg, ToolDef } from "../../interface.ts";
import type { AdapterRuntime, MappedError } from "../shared.ts";
import { parseRetryAfterSec } from "../shared.ts";

export const ANTHROPIC_VERSION = "2023-06-01";
export const BASE = "https://api.anthropic.com";
export const DEFAULT_MAX_TOKENS = 1024;

export interface CachedCall { name: string; args: Record<string, unknown>; }

/** TRAP-2/3 support: native assistant content + per-call-id args from the last chat() */
export interface AnthropicState {
  bus: ProbeBus;
  runtime: AdapterRuntime;
  callCache: Map<string, CachedCall>;
  lastNativeAssistantContent: unknown[] | null;
}

// ---- error contract (§6.G) --------------------------------------------------
export function mapAnthropicError(state: AnthropicState, status: number, body: any,
  headers: Record<string, string>,
  ctx: { causeId: string | null }): MappedError {
  const type: string | undefined = body?.error?.type;
  const message: string = body?.error?.message ?? `HTTP ${status}`;
  const requestId: string | undefined = body?.request_id ?? headers["request-id"];
  const retryAfterSec = parseRetryAfterSec(headers);

  let kind: AdapterError["kind"];
  if (status === 401 || type === "authentication_error") kind = "invalid_key";
  else if (status === 429 || type === "rate_limit_error") kind = "rate_limited";
  else if (status === 402 || type === "billing_error") kind = "quota_exhausted";
  else if (status === 529 || type === "overloaded_error") kind = "overloaded";
  else if (status === 400) kind = "bad_request";
  else if (status === 500 || status === 503) kind = "overloaded";
  else kind = "unknown";

  const ev = state.bus.emit("adapter.anthropic.error.map", "adapter.anthropic.error", "error", {
    raw: { status, error: body?.error ?? null, request_id: body?.request_id ?? null },
    mapped: { kind, ...(retryAfterSec !== undefined ? { retryAfterSec } : {}), ...(requestId ? { requestId } : {}) },
  }, ctx.causeId);

  if (kind === "rate_limited") {
    state.bus.emit("adapter.anthropic.error.spikeGuard", "adapter.anthropic.error", "value", {
      note: "sharp usage spikes trip 429 acceleration limits even below ceiling; ramp gradually",
    }, state.bus.ref(ev));
  }
  return { kind, message, retryAfterSec, requestId };
}

// ---- request build (§6.C) ---------------------------------------------------
export function reshapeMessages(messages: Msg[]): { system?: string; native: any[] } {
  const systemParts: string[] = [];
  const native: any[] = [];
  for (const m of messages) {
    if (m.role === "system") { systemParts.push(m.content); continue; }
    if (m.role === "tool") {
      // a neutral tool-result message folded into Anthropic's user/tool_result shape
      native.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content }],
      });
      continue;
    }
    native.push({ role: m.role, content: m.content });
  }
  return { ...(systemParts.length > 0 ? { system: systemParts.join("\n") } : {}), native };
}

export function buildToolDecl(tools: ToolDef[]): any[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}
