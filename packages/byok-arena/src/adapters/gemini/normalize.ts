// ============================================================================
// Gemini adapter — normalize (§6.E): candidates[0].content.parts[] → the
// neutral ChatResult. TRAP 1 (args already an object — never re-parse) and
// TRAP 2 (id present on Gemini 3, MAY BE ABSENT on 2.5 → synthesize by
// name/order) are held here; the call cache + last native model content are
// updated for the continuation (TRAP 3, ./continuation.ts).
// ============================================================================

import type { ChatResult, ToolCall, Usage } from "../../interface.ts";
import type { GeminiState } from "./wire.ts";
import { GEMINI_SYNTH_ID_PREFIX } from "./wire.ts";

export function normalizeGemini(state: GeminiState, body: any, causeId: string | null): ChatResult {
  const bus = state.bus;
  const stage = "adapter.gemini.normalize";
  const candidate = body?.candidates?.[0] ?? {};
  const parts: any[] = candidate?.content?.parts ?? [];
  const fnParts = parts.filter((p) => p?.functionCall != null);
  const textParts = parts.filter((p) => typeof p?.text === "string");

  bus.emit("adapter.gemini.normalize.envelopePath", stage, "value", {
    toolCallPath: "candidates[0].content.parts[] where has functionCall",
    stopPath: "candidates[0].finishReason (+ presence of a functionCall part)",
    usagePath: "usageMetadata",
    toolCallsFound: fnParts.length,
    usageFound: body?.usageMetadata != null,
    textFound: textParts.length,
  }, causeId);

  // Gemini can emit BOTH a text part and a functionCall part in one turn
  bus.emit("adapter.gemini.normalize.textAndCall", stage, "value", {
    hasText: textParts.length > 0,
    hasFunctionCall: fnParts.length > 0,
  }, causeId);

  state.lastNativeModelContent = candidate?.content ?? null;
  const toolCalls: ToolCall[] = [];
  fnParts.forEach((part, index) => {
    const fc = part.functionCall;
    const rawEv = bus.emit("adapter.gemini.normalize.toolCall.args.raw", stage, "value",
      { args: fc.args }, causeId);
    const cause = bus.ref(rawEv);
    // TRAP 1: args is already an object (like Anthropic) — don't double-parse
    bus.emit("adapter.gemini.normalize.toolCall.args.normalized", stage, "output",
      { args: fc.args, wasString: false }, cause);
    // TRAP 2: id present on Gemini 3; MAY BE ABSENT on 2.5
    bus.emit("adapter.gemini.normalize.toolCall.id.raw", stage, "value",
      { from: "id", value: fc.id ?? null }, cause);
    let id: string;
    let synthesized = false;
    if (fc.id != null && fc.id !== "") {
      id = fc.id;
    } else {
      synthesized = true;
      id = `${GEMINI_SYNTH_ID_PREFIX}${fc.name}-${index}`;
      bus.emit("adapter.gemini.normalize.toolCall.id.synthesized", stage, "branch", {
        reason: "id absent on 2.5",
        mappedBy: "name/order",
        synthId: id,
      }, cause);
    }
    bus.emit("adapter.gemini.normalize.toolCall.id.normalized", stage, "output", { id }, cause);
    const call: ToolCall = { id, name: fc.name, args: fc.args ?? {} };
    state.callCache.set(id, { name: call.name, args: call.args, synthesized });
    bus.emit("adapter.gemini.normalize.toolCall", stage, "output", call, cause);
    toolCalls.push(call);
  });

  const rawUsage = body?.usageMetadata ?? {};
  bus.emit("adapter.gemini.normalize.usage.raw", stage, "value", rawUsage, causeId);
  const usage: Usage = {
    inputTokens: rawUsage.promptTokenCount ?? 0,
    outputTokens: rawUsage.candidatesTokenCount ?? 0,
  };
  if (rawUsage.thoughtsTokenCount !== undefined) usage.reasoningTokens = rawUsage.thoughtsTokenCount;
  if (rawUsage.cachedContentTokenCount !== undefined) usage.cachedInputTokens = rawUsage.cachedContentTokenCount;
  bus.emit("adapter.gemini.normalize.usage.normalized", stage, "output", usage, causeId);

  // stop signal: derived from finishReason + presence of a functionCall part
  // (only the tool-use mapping is dossier-explicit — the rest per provider docs)
  const rawStop: string | null = candidate?.finishReason ?? null;
  const stopReason: ChatResult["stopReason"] =
    fnParts.length > 0 ? "tool_calls"
      : rawStop === "STOP" ? "stop"
      : rawStop === "MAX_TOKENS" ? "length"
      : rawStop === "SAFETY" || rawStop === "RECITATION" || rawStop === "PROHIBITED_CONTENT" ? "content_filter"
      : "other";
  bus.emit("adapter.gemini.normalize.stopReason", stage, "value",
    { raw: rawStop, normalized: stopReason, derivedFromFunctionCallPresence: fnParts.length > 0 }, causeId);

  const result: ChatResult = {
    text: textParts.map((p) => p.text).join(""),
    toolCalls,
    stopReason,
    usage,
    raw: body,
  };
  bus.emit("adapter.gemini.normalize.output", stage, "output", result, causeId);
  return result;
}
