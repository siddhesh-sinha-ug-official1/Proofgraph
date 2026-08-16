// ============================================================================
// OpenAI adapter — wire shapes: endpoint constants, the adapter's mutable
// TRAP-2/3 state (call cache + last native assistant message), and the
// request builders (messages[] reshape + nested function tool decl).
// See ../openai.ts (facade) for the full trap map.
// ============================================================================

import type { ProbeBus } from "../../probe/bus.ts";
import type { Msg, ToolDef } from "../../interface.ts";
import type { AdapterRuntime } from "../shared.ts";

export const BASE = "https://api.openai.com";
export const DEFAULT_MAX_TOKENS = 1024;

export interface CachedCall { name: string; args: Record<string, unknown>; }

/** Mutable adapter state shared across chat/normalize/submit (TRAP 2/3 support). */
export interface OpenAIState {
  bus: ProbeBus;
  runtime: AdapterRuntime;
  callCache: Map<string, CachedCall>;
  lastNativeAssistantMessage: any | null;
}

// ---- request build (§6.C) ---------------------------------------------------
export function reshapeMessages(messages: Msg[]): any[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId ?? "", content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

export function buildToolDecl(tools: ToolDef[]): any[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
