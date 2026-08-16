// ============================================================================
// Anthropic adapter — normalize (§6.E): content[] blocks → the neutral
// ChatResult. TRAP 1 (tool_use.input already an object — never double-parse)
// and TRAP 2 (id in `id`, prefixed toolu_ — carried through untouched) are
// held here; the call cache + last native assistant content are updated for
// the continuation (TRAP 3, ./continuation.ts).
// ============================================================================

import type { ChatResult, ToolCall, Usage } from "../../interface.ts";
import type { AnthropicState } from "./wire.ts";

export function normalizeAnthropic(state: AnthropicState, body: any, causeId: string | null): ChatResult {
  const bus = state.bus;
  const stage = "adapter.anthropic.normalize";
  const content: any[] = body?.content ?? [];
  const toolUseBlocks = content.filter((b) => b?.type === "tool_use");
  const textBlocks = content.filter((b) => b?.type === "text");

  bus.emit("adapter.anthropic.normalize.envelopePath", stage, "value", {
    toolCallPath: "content[] where type=='tool_use'",
    stopPath: "stop_reason",
    usagePath: "usage",
    toolCallsFound: toolUseBlocks.length,
    usageFound: body?.usage != null,
    textFound: textBlocks.length,
  }, causeId);

  state.lastNativeAssistantContent = content;
  const toolCalls: ToolCall[] = [];
  for (const block of toolUseBlocks) {
    const rawEv = bus.emit("adapter.anthropic.normalize.toolCall.args.raw", stage, "value",
      { input: block.input }, causeId);
    const cause = bus.ref(rawEv);
    // TRAP 1: input is already an object — pass through, never double-parse
    bus.emit("adapter.anthropic.normalize.toolCall.args.normalized", stage, "output",
      { args: block.input, wasString: false }, cause);
    // TRAP 2: id lives in `id` (toolu_…) — carried through untouched
    bus.emit("adapter.anthropic.normalize.toolCall.id.raw", stage, "value",
      { from: "id", value: block.id }, cause);
    bus.emit("adapter.anthropic.normalize.toolCall.id.normalized", stage, "output",
      { id: block.id }, cause);
    const call: ToolCall = { id: block.id, name: block.name, args: block.input ?? {} };
    state.callCache.set(call.id, { name: call.name, args: call.args });
    bus.emit("adapter.anthropic.normalize.toolCall", stage, "output", call, cause);
    toolCalls.push(call);
  }

  const rawUsage = body?.usage ?? {};
  bus.emit("adapter.anthropic.normalize.usage.raw", stage, "value", rawUsage, causeId);
  const usage: Usage = {
    inputTokens: rawUsage.input_tokens ?? 0,
    outputTokens: rawUsage.output_tokens ?? 0,
  };
  const thinking = rawUsage.output_tokens_details?.thinking_tokens;
  if (thinking !== undefined) usage.reasoningTokens = thinking;
  if (rawUsage.cache_read_input_tokens !== undefined) usage.cachedInputTokens = rawUsage.cache_read_input_tokens;
  bus.emit("adapter.anthropic.normalize.usage.normalized", stage, "output", usage, causeId);

  const rawStop: string | null = body?.stop_reason ?? null;
  const stopReason: ChatResult["stopReason"] =
    rawStop === "tool_use" ? "tool_calls"
      : rawStop === "end_turn" || rawStop === "stop_sequence" ? "stop"
      : rawStop === "max_tokens" ? "length"
      : rawStop === "refusal" ? "content_filter"
      : "other";
  bus.emit("adapter.anthropic.normalize.stopReason", stage, "value",
    { raw: rawStop, normalized: stopReason }, causeId);

  const result: ChatResult = {
    text: textBlocks.map((b) => b.text).join(""),
    toolCalls,
    stopReason,
    usage,
    raw: body,
  };
  bus.emit("adapter.anthropic.normalize.output", stage, "output", result, causeId);
  return result;
}
