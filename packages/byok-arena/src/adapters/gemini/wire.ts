// ============================================================================
// Gemini adapter — wire shapes: endpoint constants, the adapter's mutable
// TRAP-2/3 state (call cache + last native model content), and the request
// builders (contents[].parts[] reshape + functionDeclarations tool decl).
// See ../gemini.ts (facade) for the full trap map.
// ============================================================================

import type { ProbeBus } from "../../probe/bus.ts";
import type { Msg, ToolDef } from "../../interface.ts";
import type { AdapterRuntime } from "../shared.ts";

export const BASE = "https://generativelanguage.googleapis.com";
export const DEFAULT_MAX_TOKENS = 1024;
export const GEMINI_SYNTH_ID_PREFIX = "gemini-synth-";

export interface CachedCall { name: string; args: Record<string, unknown>; synthesized: boolean; }

/** Mutable adapter state shared across chat/normalize/submit (TRAP 2/3 support). */
export interface GeminiState {
  bus: ProbeBus;
  runtime: AdapterRuntime;
  callCache: Map<string, CachedCall>;
  lastNativeModelContent: any | null;
}

// ---- request build (§6.C) ---------------------------------------------------
// Round W1 (Wave B) — two bugs previously here:
//   (a) toolCallId was written into functionResponse.NAME; Gemini matches
//       responses to calls by function NAME (id is optional echo — see
//       continuation.ts:65-71 for the correct shape used on the freshly-arrived
//       results). name ← m.functionName, id ← m.toolCallId (when not synth).
//   (b) the paired assistant turn was reshaped to a text-only part, dropping
//       the functionCall; with no functionCall in contents[], Gemini has no
//       call to match the functionResponse against. Preserve toolCalls when
//       the neutral Msg carries them (interface.ts extension in the same round).
export function reshapeMessages(messages: Msg[]): { systemInstruction?: any; contents: any[] } {
  const systemParts: string[] = [];
  const contents: any[] = [];
  for (const m of messages) {
    if (m.role === "system") { systemParts.push(m.content); continue; }
    if (m.role === "tool") {
      const synth = (m.toolCallId ?? "").startsWith(GEMINI_SYNTH_ID_PREFIX);
      const name = m.functionName ?? m.toolCallId ?? "";
      const echoId = m.toolCallId && !synth ? { id: m.toolCallId } : {};
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name, ...echoId, response: { output: m.content } } }],
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      const parts: any[] = [];
      if (m.content && m.content.length > 0) parts.push({ text: m.content });
      for (const c of m.toolCalls) {
        const synth = c.id.startsWith(GEMINI_SYNTH_ID_PREFIX);
        parts.push({
          functionCall: { name: c.name, ...(synth ? {} : { id: c.id }), args: c.args ?? {} },
        });
      }
      contents.push({ role: "model", parts });
      continue;
    }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  return {
    ...(systemParts.length > 0 ? { systemInstruction: { parts: [{ text: systemParts.join("\n") }] } } : {}),
    contents,
  };
}

export function buildToolDecl(tools: ToolDef[]): any[] {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name, description: t.description, parameters: t.parameters,
    })),
  }];
}
