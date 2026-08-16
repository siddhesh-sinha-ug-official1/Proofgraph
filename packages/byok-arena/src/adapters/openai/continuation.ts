// ============================================================================
// OpenAI adapter — continuation (§6.F, TRAP 3) + the continuation cache:
// result = one role:"tool" message PER call, keyed tool_call_id, following the
// native assistant tool-call turn (from the cache when it still matches, else
// reconstructed from results only).
// ============================================================================

import type { ChatResult, Msg, ToolDef } from "../../interface.ts";
import { redactKey } from "../../probe/redact.ts";
import { sendRequest } from "../shared.ts";
import type { OpenAIState } from "./wire.ts";
import { BASE, DEFAULT_MAX_TOKENS, buildToolDecl, reshapeMessages } from "./wire.ts";
import { mapOpenAIError } from "./errors.ts";
import { normalizeOpenAI } from "./normalize.ts";

export async function submitOpenAIToolResults(state: OpenAIState, req: {
  apiKey: string; model: string; messages: Msg[];
  results: { toolCallId: string; name: string; output: string; isError?: boolean }[];
  tools?: ToolDef[];
  // Round WC-W4: continuation now honors caller's maxTokens (was silently
  // pinned to DEFAULT_MAX_TOKENS, truncating the user-visible answer).
  maxTokens?: number;
}): Promise<ChatResult> {
  const bus = state.bus;
  const t0 = bus.nowNanos();
  const stage = "adapter.openai.submit";
  const inputEv = bus.emit("adapter.openai.submit.input", stage, "input",
    { results: req.results, model: req.model, messages: req.messages });
  const cause = bus.ref(inputEv);
  const red = redactKey(req.apiKey, "openai");

  const wanted = new Set(req.results.map((r) => r.toolCallId));
  const cachedHasAll = state.lastNativeAssistantMessage?.tool_calls != null &&
    [...wanted].every((id) => state.callCache.has(id)) &&
    state.lastNativeAssistantMessage.tool_calls.some((tc: any) => wanted.has(tc.id));
  const assistantMessage = cachedHasAll
    ? state.lastNativeAssistantMessage
    : {
        role: "assistant",
        content: null,
        tool_calls: req.results.map((r) => ({
          id: r.toolCallId,
          type: "function",
          function: {
            name: r.name,
            arguments: JSON.stringify(state.callCache.get(r.toolCallId)?.args ?? {}),
          },
        })),
      };
  bus.emit("adapter.openai.submit.assistantReconstruction", stage, "value", {
    source: cachedHasAll ? "cache" : "results-only",
    callIds: req.results.map((r) => r.toolCallId),
  }, cause);

  // TRAP 3: one role:"tool" message PER call, keyed tool_call_id
  const toolMessages = req.results.map((r) => ({
    role: "tool",
    tool_call_id: r.toolCallId,
    content: r.output,
  }));
  for (const [i, tm] of toolMessages.entries()) {
    bus.emit("adapter.openai.submit.resultShape", stage, "value", tm, cause);
    // branch NOT taken, shown for contrast: the Responses input item —
    // note the field is `output`, NOT `content`, and the key is `call_id`
    bus.emit("adapter.openai.submit.resultShape.responses", stage, "value", {
      native: { type: "function_call_output", call_id: req.results[i].toolCallId, output: req.results[i].output },
      note: "Responses-endpoint shape (field OUTPUT not content, key call_id) — branch not taken this round",
    }, cause);
    bus.emit("adapter.openai.submit.idEcho", stage, "value", {
      echoedId: tm.tool_call_id,
      mappedBy: "id",
      matchesReceived: state.callCache.has(tm.tool_call_id),
    }, cause);
  }

  // Round WC-W4: mirror chat leg's maxTokens decision probe on the submit leg.
  const appliedMaxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  bus.emit("adapter.openai.submit.maxTokens", stage, "decision", {
    provided: req.maxTokens ?? null,
    applied: appliedMaxTokens,
    required: false,
    reason: req.maxTokens !== undefined
      ? "caller provided max_completion_tokens"
      : `adapter applied default ${DEFAULT_MAX_TOKENS} (logged — no silent caps)`,
  }, cause);
  if (req.maxTokens === undefined) {
    bus.log(`[openai] submit max_completion_tokens defaulted to ${DEFAULT_MAX_TOKENS} (caller omitted it)`);
  }

  const body: any = {
    model: req.model,
    messages: [...reshapeMessages(req.messages), assistantMessage, ...toolMessages],
    max_completion_tokens: appliedMaxTokens,
    ...(req.tools && req.tools.length > 0 ? { tools: buildToolDecl(req.tools) } : {}),
  };

  const { ok } = await sendRequest({
    bus, provider: "openai", stage: `${stage}.send`,
    method: "POST", url: `${BASE}/v1/chat/completions`,
    headers: { "Authorization": `Bearer ${req.apiKey}`, "Content-Type": "application/json" },
    redactedHeaders: { "Authorization": { scheme: "Bearer", token: red }, "Content-Type": "application/json" },
    body,
    probeIds: {
      hostAllowlist: "adapter.openai.submit.hostAllowlist",
      request: "adapter.openai.submit.request",
      response: "adapter.openai.submit.response.raw",
      rateLimitHeaders: "adapter.openai.chat.rateLimitHeaders",
      retryDecision: "adapter.openai.error.retryDecision",
      requestId: "adapter.openai.error.requestId",
    },
    mapError: (s, b, h, c) => mapOpenAIError(state, s, b, h, c),
    runtime: state.runtime, causeId: cause,
  });

  const result = normalizeOpenAI(state, ok.body, cause);
  bus.emit("adapter.openai.submit.output", stage, "output", result, cause);
  bus.emit("adapter.openai.submit.timing", stage, "timing",
    { stage: "submit", wallNanos: Number(bus.nowNanos() - t0) }, cause);
  return result;
}
