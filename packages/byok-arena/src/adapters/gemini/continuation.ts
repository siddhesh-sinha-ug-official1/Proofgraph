// ============================================================================
// Gemini adapter — continuation (§6.F, TRAP 3) + the continuation cache:
// result = functionResponse part; `response` is an OBJECT; the FULL
// conversation contents are re-sent; echo id (Gemini 3) or map by name when
// the id was synthesized (2.5). Guards against stale-cache replay.
// ============================================================================

import type { ChatResult, Msg, ToolDef } from "../../interface.ts";
import { redactKey } from "../../probe/redact.ts";
import { sendRequest } from "../shared.ts";
import type { GeminiState } from "./wire.ts";
import { BASE, DEFAULT_MAX_TOKENS, GEMINI_SYNTH_ID_PREFIX, buildToolDecl, reshapeMessages } from "./wire.ts";
import { mapGeminiError } from "./errors.ts";
import { normalizeGemini } from "./normalize.ts";

export async function submitGeminiToolResults(state: GeminiState, req: {
  apiKey: string; model: string; messages: Msg[];
  results: { toolCallId: string; name: string; output: string; isError?: boolean }[];
  tools?: ToolDef[];
  // Round WC-W4: continuation now honors caller's maxTokens (was silently
  // pinned to DEFAULT_MAX_TOKENS, truncating the user-visible answer).
  maxTokens?: number;
}): Promise<ChatResult> {
  const bus = state.bus;
  const t0 = bus.nowNanos();
  const stage = "adapter.gemini.submit";
  const inputEv = bus.emit("adapter.gemini.submit.input", stage, "input",
    { results: req.results, model: req.model, messages: req.messages });
  const cause = bus.ref(inputEv);
  const red = redactKey(req.apiKey, "gemini");

  const wanted = new Set(req.results.map((r) => r.toolCallId));
  // Guard against stale-cache replay (failure class: a later text-only chat()
  // overwrote lastNativeModelContent while callCache still holds older ids):
  // the cached turn must actually CONTAIN a wanted functionCall — matched by
  // id, or by cached name for synthesized (2.5) ids that never hit the wire.
  const cachedParts: any[] = (state.lastNativeModelContent as any)?.parts ?? [];
  const contentHasWantedCall = cachedParts.some((p: any) => {
    const fc = p?.functionCall;
    if (!fc) return false;
    if (fc.id != null && fc.id !== "" && wanted.has(fc.id)) return true;
    return [...wanted].some((id) =>
      id.startsWith(GEMINI_SYNTH_ID_PREFIX) && state.callCache.get(id)?.name === fc.name);
  });
  const cachedHasAll = state.lastNativeModelContent != null &&
    [...wanted].every((id) => state.callCache.has(id)) &&
    contentHasWantedCall;
  const modelContent = cachedHasAll
    ? state.lastNativeModelContent
    : {
        role: "model",
        parts: req.results.map((r) => ({
          functionCall: {
            name: r.name,
            ...(r.toolCallId.startsWith(GEMINI_SYNTH_ID_PREFIX) ? {} : { id: r.toolCallId }),
            args: state.callCache.get(r.toolCallId)?.args ?? {},
          },
        })),
      };
  bus.emit("adapter.gemini.submit.assistantReconstruction", stage, "value", {
    source: cachedHasAll ? "cache" : "results-only",
    callIds: req.results.map((r) => r.toolCallId),
  }, cause);

  // TRAP 3: functionResponse part; `response` is an OBJECT; echo the real id
  // (Gemini 3) or map by name when the id was synthesized (2.5); the FULL
  // conversation contents are re-sent.
  const responseParts = req.results.map((r) => {
    const synthesized = r.toolCallId.startsWith(GEMINI_SYNTH_ID_PREFIX);
    const part = {
      functionResponse: {
        name: r.name,
        ...(synthesized ? {} : { id: r.toolCallId }),
        response: { output: r.output, ...(r.isError ? { error: true } : {}) },
      },
    };
    bus.emit("adapter.gemini.submit.resultShape", stage, "value",
      { part, responseIsObject: true, fullContentsResent: true }, cause);
    bus.emit("adapter.gemini.submit.idEcho", stage, "value", {
      echoedId: synthesized ? null : r.toolCallId,
      mappedBy: synthesized ? "name" : "id",
      matchesReceived: state.callCache.has(r.toolCallId),
    }, cause);
    return part;
  });

  // Round WC-W4: mirror chat leg's maxTokens decision probe on the submit leg.
  const appliedMaxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  bus.emit("adapter.gemini.submit.maxTokens", stage, "decision", {
    provided: req.maxTokens ?? null,
    applied: appliedMaxTokens,
    required: false,
    reason: req.maxTokens !== undefined
      ? "caller provided maxTokens → generationConfig.maxOutputTokens"
      : `adapter applied default ${DEFAULT_MAX_TOKENS} (logged — no silent caps)`,
  }, cause);
  if (req.maxTokens === undefined) {
    bus.log(`[gemini] submit maxOutputTokens defaulted to ${DEFAULT_MAX_TOKENS} (caller omitted it)`);
  }

  const { systemInstruction, contents } = reshapeMessages(req.messages);
  const body: any = {
    ...(systemInstruction !== undefined ? { systemInstruction } : {}),
    contents: [...contents, modelContent, { role: "user", parts: responseParts }],
    generationConfig: { maxOutputTokens: appliedMaxTokens },
    ...(req.tools && req.tools.length > 0 ? { tools: buildToolDecl(req.tools) } : {}),
  };

  const { ok } = await sendRequest({
    bus, provider: "gemini", stage: `${stage}.send`,
    method: "POST", url: `${BASE}/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
    headers: { "x-goog-api-key": req.apiKey, "Content-Type": "application/json" },
    redactedHeaders: { "x-goog-api-key": red, "Content-Type": "application/json" },
    body,
    probeIds: {
      hostAllowlist: "adapter.gemini.submit.hostAllowlist",
      request: "adapter.gemini.submit.request",
      response: "adapter.gemini.submit.response.raw",
      rateLimitHeaders: "adapter.gemini.chat.rateLimitHeaders",
      retryDecision: "adapter.gemini.error.retryDecision",
      requestId: "adapter.gemini.error.requestId",
    },
    mapError: (s, b, h, c) => mapGeminiError(state, s, b, h, c),
    runtime: state.runtime, causeId: cause,
  });

  const result = normalizeGemini(state, ok.body, cause);
  bus.emit("adapter.gemini.submit.output", stage, "output", result, cause);
  bus.emit("adapter.gemini.submit.timing", stage, "timing",
    { stage: "submit", wallNanos: Number(bus.nowNanos() - t0) }, cause);
  return result;
}
