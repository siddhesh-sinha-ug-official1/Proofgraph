// ============================================================================
// OpenAI Responses API — the explicitly-stubbed branch (§7.2, §11 layout note
// "Responses branch stubbed"). NOT wire-compatible with Chat Completions:
//   request:  `input` not `messages`
//   tools:    flattened { type:"function", name, ... } (no nested function{})
//   calls:    output[] items with type:"function_call"; id field is `call_id`
//   results:  input item { type:"function_call_output", call_id, output }
//   usage:    input_tokens/output_tokens (+*_tokens_details) — differs from Chat
// These normalizers exist so the §9 gates can prove the Responses-side traps
// (id from `call_id`, usage field names) against golden fixtures TODAY, and so
// wiring a full ResponsesAdapter later is a mechanical pass.
// ============================================================================

import type { ProbeBus } from "../probe/bus.ts";
import type { ToolCall, Usage } from "../interface.ts";

/** TRAP 1 + TRAP 2 for the Responses shape: arguments STRING, id from `call_id`. */
export function normalizeResponsesToolCall(bus: ProbeBus, item: any): ToolCall {
  const stage = "adapter.openai.normalize";
  const rawEv = bus.emit("adapter.openai.normalize.toolCall.args.raw", stage, "value",
    { arguments: item?.arguments }, null);
  const cause = bus.ref(rawEv);
  let args: Record<string, unknown> = {};
  let wasString = false;
  let parsedOk = true;
  if (typeof item?.arguments === "string") {
    wasString = true;
    try { args = JSON.parse(item.arguments); } catch { parsedOk = false; args = {}; }
  }
  bus.emit("adapter.openai.normalize.toolCall.args.normalized", stage, "output",
    { args, wasString, parsedOk }, cause);
  // Responses puts the echoable id in `call_id`, NOT `id` (`id` is the item id)
  bus.emit("adapter.openai.normalize.toolCall.id.raw", stage, "value",
    { from: "call_id", value: item?.call_id }, cause);
  bus.emit("adapter.openai.normalize.toolCall.id.normalized", stage, "output",
    { id: item?.call_id }, cause);
  const call: ToolCall = { id: item?.call_id, name: item?.name ?? "", args };
  bus.emit("adapter.openai.normalize.toolCall", stage, "output", call, cause);
  return call;
}

/** Usage mapping for the Responses field names (differ from Chat within the SAME provider). */
export function normalizeResponsesUsage(bus: ProbeBus, rawUsage: any): Usage {
  const stage = "adapter.openai.normalize";
  bus.emit("adapter.openai.normalize.usage.raw", stage, "value", rawUsage ?? {}, null);
  const usage: Usage = {
    inputTokens: rawUsage?.input_tokens ?? 0,
    outputTokens: rawUsage?.output_tokens ?? 0,
  };
  const reasoning = rawUsage?.output_tokens_details?.reasoning_tokens;
  if (reasoning !== undefined) usage.reasoningTokens = reasoning;
  const cached = rawUsage?.input_tokens_details?.cached_tokens;
  if (cached !== undefined) usage.cachedInputTokens = cached;
  bus.emit("adapter.openai.normalize.usage.normalized", stage, "output", usage, null);
  return usage;
}

/** TRAP 3, Responses side: the result input item — field `output`, NOT `content`. */
export function buildResponsesResultItem(bus: ProbeBus, result: { toolCallId: string; output: string }): any {
  const native = { type: "function_call_output", call_id: result.toolCallId, output: result.output };
  bus.emit("adapter.openai.submit.resultShape.responses", "adapter.openai.submit", "value",
    { native, note: "Responses-endpoint result item built by the stubbed branch" }, null);
  return native;
}
