// ============================================================================
// Anthropic adapter — continuation (§6.F, TRAP 3) + the continuation cache:
// result = tool_result blocks in a NEW user message, keyed tool_use_id,
// following the native assistant tool-use turn (from the cache when it still
// matches, else reconstructed from results only).
// ============================================================================

import type { ChatResult, Msg, ToolDef } from "../../interface.ts";
import { redactKey } from "../../probe/redact.ts";
import { sendRequest } from "../shared.ts";
import type { AnthropicState } from "./wire.ts";
import { ANTHROPIC_VERSION, BASE, DEFAULT_MAX_TOKENS, buildToolDecl, reshapeMessages } from "./wire.ts";
import { mapAnthropicError } from "./wire.ts";
import { normalizeAnthropic } from "./normalize.ts";

export async function submitAnthropicToolResults(state: AnthropicState, req: {
  apiKey: string; model: string; messages: Msg[];
  results: { toolCallId: string; name: string; output: string; isError?: boolean }[];
  tools?: ToolDef[];
  // Round WC-W4: continuation now honors caller's maxTokens (was silently
  // pinned to DEFAULT_MAX_TOKENS, truncating the user-visible answer).
  maxTokens?: number;
}): Promise<ChatResult> {
  const bus = state.bus;
  const t0 = bus.nowNanos();
  const stage = "adapter.anthropic.submit";
  const inputEv = bus.emit("adapter.anthropic.submit.input", stage, "input",
    { results: req.results, model: req.model, messages: req.messages });
  const cause = bus.ref(inputEv);
  const red = redactKey(req.apiKey, "anthropic");

  // Rebuild the native assistant tool-use turn. Preferred source: the exact
  // native content from the last chat() (faithful text + tool_use blocks).
  const wanted = new Set(req.results.map((r) => r.toolCallId));
  const cachedHasAll = state.lastNativeAssistantContent != null &&
    [...wanted].every((id) => state.callCache.has(id)) &&
    state.lastNativeAssistantContent.some((b: any) => b?.type === "tool_use" && wanted.has(b.id));
  const assistantContent = cachedHasAll
    ? state.lastNativeAssistantContent
    : req.results.map((r) => ({
        type: "tool_use", id: r.toolCallId, name: r.name,
        input: state.callCache.get(r.toolCallId)?.args ?? {},
      }));
  bus.emit("adapter.anthropic.submit.assistantReconstruction", stage, "value", {
    source: cachedHasAll ? "cache" : "results-only",
    callIds: req.results.map((r) => r.toolCallId),
  }, cause);

  // TRAP 3: tool_result blocks in a NEW user message, keyed tool_use_id
  const resultMessage = {
    role: "user",
    content: req.results.map((r) => ({
      type: "tool_result",
      tool_use_id: r.toolCallId,
      content: r.output,
      ...(r.isError ? { is_error: true } : {}),
    })),
  };
  bus.emit("adapter.anthropic.submit.resultShape", stage, "value", resultMessage, cause);
  for (const r of req.results) {
    bus.emit("adapter.anthropic.submit.idEcho", stage, "value", {
      echoedId: r.toolCallId,
      mappedBy: "id",
      matchesReceived: state.callCache.has(r.toolCallId),
    }, cause);
  }

  // Round WC-W4: mirror chat leg's maxTokens decision probe on the submit leg;
  // the Anthropic Messages API REQUIRES max_tokens, so a default substitution
  // must be logged (no silent caps).
  const appliedMaxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
  bus.emit("adapter.anthropic.submit.maxTokens", stage, "decision", {
    provided: req.maxTokens ?? null,
    applied: appliedMaxTokens,
    required: true,
    reason: req.maxTokens !== undefined
      ? "caller provided max_tokens"
      : `Anthropic REQUIRES max_tokens; adapter applied default ${DEFAULT_MAX_TOKENS} (logged — no silent caps)`,
  }, cause);
  if (req.maxTokens === undefined) {
    bus.log(`[anthropic] submit max_tokens defaulted to ${DEFAULT_MAX_TOKENS} (caller omitted it)`);
  }

  const { system, native } = reshapeMessages(req.messages);
  const body: any = {
    model: req.model,
    max_tokens: appliedMaxTokens,
    ...(system !== undefined ? { system } : {}),
    messages: [...native, { role: "assistant", content: assistantContent }, resultMessage],
    ...(req.tools && req.tools.length > 0 ? { tools: buildToolDecl(req.tools) } : {}),
  };

  const { ok } = await sendRequest({
    bus, provider: "anthropic", stage: `${stage}.send`,
    method: "POST", url: `${BASE}/v1/messages`,
    headers: { "x-api-key": req.apiKey, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
    redactedHeaders: { "x-api-key": red, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
    body,
    probeIds: {
      hostAllowlist: "adapter.anthropic.submit.hostAllowlist",
      request: "adapter.anthropic.submit.request",
      response: "adapter.anthropic.submit.response.raw",
      rateLimitHeaders: "adapter.anthropic.chat.rateLimitHeaders",
      retryDecision: "adapter.anthropic.error.retryDecision",
      requestId: "adapter.anthropic.error.requestId",
    },
    mapError: (s, b, h, c) => mapAnthropicError(state, s, b, h, c),
    runtime: state.runtime, causeId: cause,
  });

  const result = normalizeAnthropic(state, ok.body, cause);
  bus.emit("adapter.anthropic.submit.output", stage, "output", result, cause);
  bus.emit("adapter.anthropic.submit.timing", stage, "timing",
    { stage: "submit", wallNanos: Number(bus.nowNanos() - t0) }, cause);
  return result;
}
