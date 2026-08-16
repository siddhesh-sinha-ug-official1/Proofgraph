// ============================================================================
// Gemini adapter — the send flows (§6.B validateKey + §6.C/D/E chat) over the
// shared send/retry loop. Auth is the x-goog-api-key HEADER (never ?key= —
// keeps the key out of URLs/logs); transportChoice records the native
// generateContent path over the OpenAI-compat base URL.
// ============================================================================

import type { AdapterError, ChatResult, Msg, ToolDef } from "../../interface.ts";
import { AdapterFailure } from "../../interface.ts";
import { redactKey } from "../../probe/redact.ts";
import type { HttpOk } from "../shared.ts";
import { sendRequest } from "../shared.ts";
import type { GeminiState } from "./wire.ts";
import { BASE, DEFAULT_MAX_TOKENS, buildToolDecl, reshapeMessages } from "./wire.ts";
import { mapGeminiError } from "./errors.ts";
import { normalizeGemini } from "./normalize.ts";

// ---- validateKey (§6.B) -----------------------------------------------------
export async function validateKeyGemini(state: GeminiState, apiKey: string):
  Promise<{ valid: boolean; models: string[]; error?: AdapterError }> {
  const t0 = state.bus.nowNanos();
  const red = redactKey(apiKey, "gemini");
  try {
    const { ok } = await sendRequest({
      bus: state.bus, provider: "gemini", stage: "adapter.gemini.validateKey",
      method: "GET", url: `${BASE}/v1beta/models`,
      headers: { "x-goog-api-key": apiKey },
      redactedHeaders: { "x-goog-api-key": red },
      probeIds: {
        hostAllowlist: "adapter.gemini.validateKey.hostAllowlist",
        request: "adapter.gemini.validateKey.request",
        response: "adapter.gemini.validateKey.response",
        retryDecision: "adapter.gemini.error.retryDecision",
        requestId: "adapter.gemini.error.requestId",
      },
      responsePayload: (r: HttpOk) => ({
        status: r.status,
        models: (r.body?.models ?? []).map((m: any) => ({
          name: m.name,
          supportedGenerationMethods: m.supportedGenerationMethods ?? [],
          inputTokenLimit: m.inputTokenLimit ?? null,
          outputTokenLimit: m.outputTokenLimit ?? null,
        })),
        valid: true,
      }),
      mapError: (s, b, h, c) => mapGeminiError(state, s, b, h, c),
      runtime: state.runtime, causeId: null,
    });
    state.bus.emit("adapter.gemini.validateKey.honestCeiling", "adapter.gemini.validateKey", "decision", {
      authenticates: true,
      spendable: "unknown",
      reason: "list-models proves auth, not positive balance — valid ≠ green; a free-tier key also trains Google on prompts (paid tier does not) and the app cannot fully see which this is",
    });
    state.bus.emit("adapter.gemini.validateKey.timing", "adapter.gemini.validateKey", "timing",
      { stage: "validateKey", wallNanos: Number(state.bus.nowNanos() - t0) });
    // filter to models that can actually generateContent (capability probe)
    const models = (ok.body?.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m: any) => String(m.name ?? "").replace(/^models\//, ""));
    return { valid: true, models };
  } catch (err) {
    if (err instanceof AdapterFailure) {
      state.bus.emit("adapter.gemini.validateKey.honestCeiling", "adapter.gemini.validateKey", "decision", {
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
export async function chatGemini(state: GeminiState, req: {
  apiKey: string; model: string; messages: Msg[]; tools?: ToolDef[];
  maxTokens?: number; stream?: boolean; signal?: AbortSignal;
}): Promise<ChatResult> {
  const bus = state.bus;
  const t0 = bus.nowNanos();
  const stage = "adapter.gemini.chat";
  const inputEv = bus.emit("adapter.gemini.chat.input", stage, "input", {
    model: req.model, messages: req.messages, tools: req.tools ?? null,
    maxTokens: req.maxTokens ?? null, stream: req.stream ?? false,
  });
  const cause = bus.ref(inputEv);
  const red = redactKey(req.apiKey, "gemini");

  bus.emit("adapter.gemini.chat.authHeader", stage, "value", {
    "x-goog-api-key": red,
    "Content-Type": "application/json",
    note: "key via header, NOT ?key= query param — keeps the key out of URLs/logs",
  }, cause);

  bus.emit("adapter.gemini.chat.transportChoice", stage, "decision", {
    chosen: "native_generateContent",
    alt: "openai_compat_base_url",
    reason: "compat layer (/v1beta/openai/) occasionally lags native features; native functionCall/functionResponse shapes kept",
  }, cause);

  if (req.stream) {
    bus.emit("adapter.gemini.chat.streamDeferred", stage, "decision", {
      requested: true, applied: false,
      reason: "streaming deferred until the non-stream path is green (§8 bounded scope) — proceeding non-streaming; cap logged, never silent",
    }, cause);
    bus.log("[gemini] stream requested but deferred this round (§8) — running non-streaming");
  }

  let nativeTools: any[] | undefined;
  if (req.tools && req.tools.length > 0) {
    nativeTools = buildToolDecl(req.tools);
    bus.emit("adapter.gemini.chat.toolDecl", stage, "value",
      { raw: req.tools, native: nativeTools }, cause);
  }

  const applied = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  bus.emit("adapter.gemini.chat.maxTokens", stage, "decision", {
    provided: req.maxTokens ?? null,
    applied,
    required: false,
    default: DEFAULT_MAX_TOKENS,
    reason: req.maxTokens !== undefined
      ? "caller provided maxTokens → generationConfig.maxOutputTokens"
      : `not provider-required; sensible default ${DEFAULT_MAX_TOKENS} applied and logged`,
  }, cause);
  if (req.maxTokens === undefined) {
    bus.log(`[gemini] generationConfig.maxOutputTokens defaulted to ${DEFAULT_MAX_TOKENS} (caller omitted it)`);
  }

  const { systemInstruction, contents } = reshapeMessages(req.messages);
  const body: any = {
    ...(systemInstruction !== undefined ? { systemInstruction } : {}),
    contents,
    generationConfig: { maxOutputTokens: applied },
    ...(nativeTools ? { tools: nativeTools } : {}),
  };
  bus.emit("adapter.gemini.chat.msgReshape", stage, "value", { native: body }, cause);

  const { ok } = await sendRequest({
    bus, provider: "gemini", stage: `${stage}.send`,
    method: "POST", url: `${BASE}/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
    headers: { "x-goog-api-key": req.apiKey, "Content-Type": "application/json" },
    redactedHeaders: { "x-goog-api-key": red, "Content-Type": "application/json" },
    body,
    probeIds: {
      hostAllowlist: "adapter.gemini.chat.hostAllowlist",
      request: "adapter.gemini.chat.request",
      response: "adapter.gemini.chat.response.raw",
      rateLimitHeaders: "adapter.gemini.chat.rateLimitHeaders",
      retryDecision: "adapter.gemini.error.retryDecision",
      requestId: "adapter.gemini.error.requestId",
    },
    mapError: (s, b, h, c) => mapGeminiError(state, s, b, h, c),
    runtime: state.runtime, causeId: cause, signal: req.signal,
  });

  const result = normalizeGemini(state, ok.body, cause);
  bus.emit("adapter.gemini.chat.timing", stage, "timing",
    { stage: "chat", wallNanos: Number(bus.nowNanos() - t0) }, cause);
  return result;
}
