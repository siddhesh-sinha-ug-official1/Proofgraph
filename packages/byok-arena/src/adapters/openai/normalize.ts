// ============================================================================
// OpenAI adapter — normalize (§6.E): choices[0].message → the neutral
// ChatResult. TRAP 1 (tool_calls[].function.arguments is a JSON-encoded
// STRING — JSON.parse at the boundary; malformed → parsedOk:false lead, not a
// crash) and TRAP 2 (call id in `id`, call_…) are held here; the call cache +
// last native assistant message are updated for the continuation (TRAP 3).
// ============================================================================

import type { ChatResult, ToolCall, Usage } from "../../interface.ts";
import type { OpenAIState } from "./wire.ts";

export function normalizeOpenAI(state: OpenAIState, body: any, causeId: string | null): ChatResult {
  const bus = state.bus;
  const stage = "adapter.openai.normalize";
  const message = body?.choices?.[0]?.message ?? {};
  const rawCalls: any[] = message.tool_calls ?? [];

  bus.emit("adapter.openai.normalize.envelopePath", stage, "value", {
    toolCallPath: "choices[0].message.tool_calls[]",
    stopPath: "choices[0].finish_reason",
    usagePath: "usage",
    toolCallsFound: rawCalls.length,
    usageFound: body?.usage != null,
    textFound: typeof message.content === "string" && message.content.length > 0 ? 1 : 0,
  }, causeId);

  state.lastNativeAssistantMessage = body?.choices?.[0]?.message ?? null;
  const toolCalls: ToolCall[] = [];
  for (const rc of rawCalls) {
    const argStr = rc?.function?.arguments;
    const rawEv = bus.emit("adapter.openai.normalize.toolCall.args.raw", stage, "value",
      { arguments: argStr }, causeId);
    const cause = bus.ref(rawEv);
    // TRAP 1: arguments is a JSON-encoded STRING — JSON.parse at the boundary.
    // A malformed string surfaces as parsedOk:false — a lead, not a crash.
    let args: Record<string, unknown> = {};
    let wasString = false;
    let parsedOk = true;
    if (typeof argStr === "string") {
      wasString = true;
      try {
        args = JSON.parse(argStr);
      } catch {
        parsedOk = false;
        args = {};
      }
    } else if (argStr && typeof argStr === "object") {
      args = argStr; // defensive: some proxies pre-parse — pass through, don't double-parse
    }
    bus.emit("adapter.openai.normalize.toolCall.args.normalized", stage, "output",
      { args, wasString, parsedOk }, cause);
    if (!parsedOk) {
      bus.log(`[openai] tool call ${rc.id}: malformed arguments string failed JSON.parse — surfaced as parsedOk:false lead`);
    }
    // TRAP 2: Chat Completions carries the call id in `id` (call_…)
    bus.emit("adapter.openai.normalize.toolCall.id.raw", stage, "value",
      { from: "id", value: rc.id }, cause);
    bus.emit("adapter.openai.normalize.toolCall.id.normalized", stage, "output",
      { id: rc.id }, cause);
    const call: ToolCall = { id: rc.id, name: rc?.function?.name ?? "", args };
    state.callCache.set(call.id, { name: call.name, args: call.args });
    bus.emit("adapter.openai.normalize.toolCall", stage, "output", call, cause);
    toolCalls.push(call);
  }

  const rawUsage = body?.usage ?? {};
  bus.emit("adapter.openai.normalize.usage.raw", stage, "value", rawUsage, causeId);
  const usage: Usage = {
    inputTokens: rawUsage.prompt_tokens ?? 0,
    outputTokens: rawUsage.completion_tokens ?? 0,
  };
  const reasoning = rawUsage.completion_tokens_details?.reasoning_tokens;
  if (reasoning !== undefined) usage.reasoningTokens = reasoning;
  const cached = rawUsage.prompt_tokens_details?.cached_tokens;
  if (cached !== undefined) usage.cachedInputTokens = cached;
  bus.emit("adapter.openai.normalize.usage.normalized", stage, "output", usage, causeId);

  const rawStop: string | null = body?.choices?.[0]?.finish_reason ?? null;
  const stopReason: ChatResult["stopReason"] =
    rawStop === "tool_calls" ? "tool_calls"
      : rawStop === "stop" ? "stop"
      : rawStop === "length" ? "length"
      : rawStop === "content_filter" ? "content_filter"
      : "other";
  bus.emit("adapter.openai.normalize.stopReason", stage, "value",
    { raw: rawStop, normalized: stopReason }, causeId);

  const result: ChatResult = {
    text: typeof message.content === "string" ? message.content : "",
    toolCalls,
    stopReason,
    usage,
    raw: body,
  };
  bus.emit("adapter.openai.normalize.output", stage, "output", result, causeId);
  return result;
}
