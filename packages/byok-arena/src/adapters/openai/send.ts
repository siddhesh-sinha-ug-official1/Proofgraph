// ============================================================================
// OpenAI adapter — the send flows (§6.B validateKey + §6.C/D/E chat) over the
// shared send/retry loop. Auth is Authorization: Bearer with
// OpenAI-Organization/Project deliberately OMITTED for BYOK; endpointChoice
// records Chat Completions over the (not wire-compatible) Responses endpoint.
// ============================================================================

import type { AdapterError, ChatResult, Msg, ToolDef } from "../../interface.ts";
import { AdapterFailure } from "../../interface.ts";
import { redactKey } from "../../probe/redact.ts";
import type { HttpOk } from "../shared.ts";
import { sendRequest } from "../shared.ts";
import type { OpenAIState } from "./wire.ts";
import { BASE, DEFAULT_MAX_TOKENS, buildToolDecl, reshapeMessages } from "./wire.ts";
import { mapOpenAIError } from "./errors.ts";
import { normalizeOpenAI } from "./normalize.ts";

// ---- validateKey (§6.B) -----------------------------------------------------
export async function validateKeyOpenAI(state: OpenAIState, apiKey: string):
  Promise<{ valid: boolean; models: string[]; error?: AdapterError }> {
  const t0 = state.bus.nowNanos();
  const red = redactKey(apiKey, "openai");
  try {
    const { ok } = await sendRequest({
      bus: state.bus, provider: "openai", stage: "adapter.openai.validateKey",
      method: "GET", url: `${BASE}/v1/models`,
      headers: { "Authorization": `Bearer ${apiKey}` },
      redactedHeaders: { "Authorization": { scheme: "Bearer", token: red } },
      probeIds: {
        hostAllowlist: "adapter.openai.validateKey.hostAllowlist",
        request: "adapter.openai.validateKey.request",
        response: "adapter.openai.validateKey.response",
        retryDecision: "adapter.openai.error.retryDecision",
        requestId: "adapter.openai.error.requestId",
      },
      responsePayload: (r: HttpOk) => ({
        status: r.status,
        models: (r.body?.data ?? []).map((m: any) => m.id),
        valid: true,
      }),
      mapError: (s, b, h, c) => mapOpenAIError(state, s, b, h, c),
      runtime: state.runtime, causeId: null,
    });
    state.bus.emit("adapter.openai.validateKey.honestCeiling", "adapter.openai.validateKey", "decision", {
      authenticates: true,
      spendable: "unknown",
      reason: "list-models proves auth, not positive balance — a valid key can still fail its first real call with insufficient_quota",
    });
    state.bus.emit("adapter.openai.validateKey.timing", "adapter.openai.validateKey", "timing",
      { stage: "validateKey", wallNanos: Number(state.bus.nowNanos() - t0) });
    return { valid: true, models: (ok.body?.data ?? []).map((m: any) => m.id) };
  } catch (err) {
    if (err instanceof AdapterFailure) {
      state.bus.emit("adapter.openai.validateKey.honestCeiling", "adapter.openai.validateKey", "decision", {
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
export async function chatOpenAI(state: OpenAIState, req: {
  apiKey: string; model: string; messages: Msg[]; tools?: ToolDef[];
  maxTokens?: number; stream?: boolean; signal?: AbortSignal;
}): Promise<ChatResult> {
  const bus = state.bus;
  const t0 = bus.nowNanos();
  const stage = "adapter.openai.chat";
  const inputEv = bus.emit("adapter.openai.chat.input", stage, "input", {
    model: req.model, messages: req.messages, tools: req.tools ?? null,
    maxTokens: req.maxTokens ?? null, stream: req.stream ?? false,
  });
  const cause = bus.ref(inputEv);
  const red = redactKey(req.apiKey, "openai");

  // OpenAI-Organization / OpenAI-Project deliberately OMITTED for BYOK —
  // the user's key alone names the billed customer.
  bus.emit("adapter.openai.chat.authHeader", stage, "value", {
    "Authorization": { scheme: "Bearer", token: red },
    "Content-Type": "application/json",
    omittedForByok: ["OpenAI-Organization", "OpenAI-Project"],
  }, cause);

  bus.emit("adapter.openai.chat.endpointChoice", stage, "decision", {
    chosen: "chat_completions",
    alt: "responses",
    reason: "mature, universally supported",
    wireCompatible: false,
  }, cause);

  if (req.stream) {
    bus.emit("adapter.openai.chat.streamDeferred", stage, "decision", {
      requested: true, applied: false,
      reason: "streaming deferred until the non-stream path is green (§8 bounded scope) — proceeding non-streaming; cap logged, never silent",
    }, cause);
    bus.log("[openai] stream requested but deferred this round (§8) — running non-streaming");
    // the streaming-usage guard is still surfaced so the app knows why usage
    // would be absent on a real stream without stream_options.include_usage
    bus.emit("adapter.openai.normalize.usage.streamGuard", "adapter.openai.normalize", "decision", {
      stream: true,
      includeUsage: false,
      reason: "OpenAI streaming omits usage unless stream_options.include_usage:true — this adapter will set it when the stream path lands",
    }, cause);
  }

  let nativeTools: any[] | undefined;
  if (req.tools && req.tools.length > 0) {
    nativeTools = buildToolDecl(req.tools);
    bus.emit("adapter.openai.chat.toolDecl", stage, "value",
      { raw: req.tools, native: nativeTools }, cause);
    // branch NOT taken, shown for contrast: the flattened Responses declaration
    bus.emit("adapter.openai.chat.toolDecl.responses", stage, "value", {
      native: req.tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters })),
      note: "Responses-endpoint shape — branch not taken (endpoint stubbed this round)",
    }, cause);
  }

  const applied = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  bus.emit("adapter.openai.chat.maxTokens", stage, "decision", {
    provided: req.maxTokens ?? null,
    applied,
    required: false,
    default: DEFAULT_MAX_TOKENS,
    reason: req.maxTokens !== undefined
      ? "caller provided max_tokens → max_completion_tokens"
      : `not provider-required; sensible default ${DEFAULT_MAX_TOKENS} applied and logged`,
  }, cause);
  if (req.maxTokens === undefined) {
    bus.log(`[openai] max_completion_tokens defaulted to ${DEFAULT_MAX_TOKENS} (caller omitted it)`);
  }

  const body: any = {
    model: req.model,
    messages: reshapeMessages(req.messages),
    max_completion_tokens: applied,
    ...(nativeTools ? { tools: nativeTools } : {}),
  };
  bus.emit("adapter.openai.chat.msgReshape", stage, "value", { native: body }, cause);

  const { ok } = await sendRequest({
    bus, provider: "openai", stage: `${stage}.send`,
    method: "POST", url: `${BASE}/v1/chat/completions`,
    headers: { "Authorization": `Bearer ${req.apiKey}`, "Content-Type": "application/json" },
    redactedHeaders: { "Authorization": { scheme: "Bearer", token: red }, "Content-Type": "application/json" },
    body,
    probeIds: {
      hostAllowlist: "adapter.openai.chat.hostAllowlist",
      request: "adapter.openai.chat.request",
      response: "adapter.openai.chat.response.raw",
      rateLimitHeaders: "adapter.openai.chat.rateLimitHeaders",
      retryDecision: "adapter.openai.error.retryDecision",
      requestId: "adapter.openai.error.requestId",
    },
    mapError: (s, b, h, c) => mapOpenAIError(state, s, b, h, c),
    runtime: state.runtime, causeId: cause, signal: req.signal,
  });

  const result = normalizeOpenAI(state, ok.body, cause);
  bus.emit("adapter.openai.chat.timing", stage, "timing",
    { stage: "chat", wallNanos: Number(bus.nowNanos() - t0) }, cause);
  return result;
}
