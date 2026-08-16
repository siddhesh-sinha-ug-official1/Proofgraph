// ============================================================================
// Anthropic adapter — the send flows (§6.B validateKey + §6.C/D/E chat) over
// the shared send/retry loop. Auth is x-api-key + anthropic-version (the
// classic dropped-wire killer); max_tokens is REQUIRED here, unlike the
// others — the applied default is always logged, never silent.
// ============================================================================

import type { AdapterError, ChatResult, Msg, ToolDef } from "../../interface.ts";
import { AdapterFailure } from "../../interface.ts";
import { redactKey } from "../../probe/redact.ts";
import type { HttpOk } from "../shared.ts";
import { sendRequest } from "../shared.ts";
import type { AnthropicState } from "./wire.ts";
import { ANTHROPIC_VERSION, BASE, DEFAULT_MAX_TOKENS, buildToolDecl, reshapeMessages } from "./wire.ts";
import { mapAnthropicError } from "./wire.ts";
import { normalizeAnthropic } from "./normalize.ts";

// ---- validateKey (§6.B) -----------------------------------------------------
export async function validateKeyAnthropic(state: AnthropicState, apiKey: string):
  Promise<{ valid: boolean; models: string[]; error?: AdapterError }> {
  const t0 = state.bus.nowNanos();
  const red = redactKey(apiKey, "anthropic");
  try {
    const { ok } = await sendRequest({
      bus: state.bus, provider: "anthropic", stage: "adapter.anthropic.validateKey",
      method: "GET", url: `${BASE}/v1/models`,
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
      redactedHeaders: { "x-api-key": red, "anthropic-version": ANTHROPIC_VERSION },
      probeIds: {
        hostAllowlist: "adapter.anthropic.validateKey.hostAllowlist",
        request: "adapter.anthropic.validateKey.request",
        response: "adapter.anthropic.validateKey.response",
        retryDecision: "adapter.anthropic.error.retryDecision",
        requestId: "adapter.anthropic.error.requestId",
      },
      responsePayload: (r: HttpOk) => ({
        status: r.status,
        models: (r.body?.data ?? []).map((m: any) => ({ id: m.id, capabilities: m.capabilities ?? null })),
        valid: true,
      }),
      mapError: (s, b, h, c) => mapAnthropicError(state, s, b, h, c),
      runtime: state.runtime, causeId: null,
    });
    state.bus.emit("adapter.anthropic.validateKey.honestCeiling", "adapter.anthropic.validateKey", "decision", {
      authenticates: true,
      spendable: "unknown",
      reason: "list-models proves auth, not positive balance — valid ≠ green; only a real spend proves spendability",
    });
    state.bus.emit("adapter.anthropic.validateKey.timing", "adapter.anthropic.validateKey", "timing",
      { stage: "validateKey", wallNanos: Number(state.bus.nowNanos() - t0) });
    return { valid: true, models: (ok.body?.data ?? []).map((m: any) => m.id) };
  } catch (err) {
    if (err instanceof AdapterFailure) {
      state.bus.emit("adapter.anthropic.validateKey.honestCeiling", "adapter.anthropic.validateKey", "decision", {
        authenticates: false,
        spendable: "unknown",
        reason: `validation failed (${err.adapterError.kind}) — key does not authenticate`,
      });
      return { valid: false, models: [], error: err.adapterError };
    }
    throw err;
  }
}

// ---- chat (§6.C/D/E) --------------------------------------------------------
export async function chatAnthropic(state: AnthropicState, req: {
  apiKey: string; model: string; messages: Msg[]; tools?: ToolDef[];
  maxTokens?: number; stream?: boolean; signal?: AbortSignal;
}): Promise<ChatResult> {
  const bus = state.bus;
  const t0 = bus.nowNanos();
  const stage = "adapter.anthropic.chat";
  const inputEv = bus.emit("adapter.anthropic.chat.input", stage, "input", {
    model: req.model, messages: req.messages, tools: req.tools ?? null,
    maxTokens: req.maxTokens ?? null, stream: req.stream ?? false,
  });
  const cause = bus.ref(inputEv);
  const red = redactKey(req.apiKey, "anthropic");

  bus.emit("adapter.anthropic.chat.authHeader", stage, "value", {
    "x-api-key": red,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  }, cause);

  if (req.stream) {
    bus.emit("adapter.anthropic.chat.streamDeferred", stage, "decision", {
      requested: true, applied: false,
      reason: "streaming deferred until the non-stream path is green (§8 bounded scope) — proceeding non-streaming; cap logged, never silent",
    }, cause);
    bus.log("[anthropic] stream requested but deferred this round (§8) — running non-streaming");
  }

  let nativeTools: any[] | undefined;
  if (req.tools && req.tools.length > 0) {
    nativeTools = buildToolDecl(req.tools);
    bus.emit("adapter.anthropic.chat.toolDecl", stage, "value",
      { raw: req.tools, native: nativeTools }, cause);
  }

  const applied = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  bus.emit("adapter.anthropic.chat.maxTokens", stage, "decision", {
    provided: req.maxTokens ?? null,
    applied,
    required: true,
    reason: req.maxTokens !== undefined
      ? "caller provided max_tokens"
      : `Anthropic REQUIRES max_tokens; adapter applied default ${DEFAULT_MAX_TOKENS} (logged — no silent caps)`,
  }, cause);
  if (req.maxTokens === undefined) {
    bus.log(`[anthropic] max_tokens defaulted to ${DEFAULT_MAX_TOKENS} (required by the Messages API; caller omitted it)`);
  }

  const { system, native } = reshapeMessages(req.messages);
  const body: any = {
    model: req.model,
    max_tokens: applied,
    ...(system !== undefined ? { system } : {}),
    messages: native,
    ...(nativeTools ? { tools: nativeTools } : {}),
  };
  bus.emit("adapter.anthropic.chat.msgReshape", stage, "value", { native: body }, cause);

  const { ok } = await sendRequest({
    bus, provider: "anthropic", stage: `${stage}.send`,
    method: "POST", url: `${BASE}/v1/messages`,
    headers: { "x-api-key": req.apiKey, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
    redactedHeaders: { "x-api-key": red, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
    body,
    probeIds: {
      hostAllowlist: "adapter.anthropic.chat.hostAllowlist",
      request: "adapter.anthropic.chat.request",
      response: "adapter.anthropic.chat.response.raw",
      rateLimitHeaders: "adapter.anthropic.chat.rateLimitHeaders",
      retryDecision: "adapter.anthropic.error.retryDecision",
      requestId: "adapter.anthropic.error.requestId",
    },
    mapError: (s, b, h, c) => mapAnthropicError(state, s, b, h, c),
    runtime: state.runtime, causeId: cause, signal: req.signal,
  });

  const result = normalizeAnthropic(state, ok.body, cause);
  bus.emit("adapter.anthropic.chat.timing", stage, "timing",
    { stage: "chat", wallNanos: Number(bus.nowNanos() - t0) }, cause);
  return result;
}
