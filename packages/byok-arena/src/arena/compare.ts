// ============================================================================
// Arena — comparison support: the arena's config/report types and the TRAP-3
// result-shape validators + equality helpers runArena's comparisons use.
// See ./arena.ts for the round-trip gate itself (which re-exports the types).
// ============================================================================

import type { ChatResult, ModelAdapter, Msg, ToolCall, ToolDef } from "../interface.ts";

export interface ArenaSide {
  adapter: ModelAdapter;
  model: string;
  apiKey: string;
}

export interface ArenaConfig {
  task: { messages: Msg[]; tools: ToolDef[] };
  sideA: ArenaSide;
  sideB: ArenaSide;
  /** local tool executor — deterministic stub in the skeleton */
  executeTool: (call: ToolCall) => string;
  maxTokens?: number;
}

export interface ArenaReport {
  normalizationHolds: boolean;
  divergedAt: string[];
  reason: string;
  resultA: ChatResult;
  resultB: ChatResult;
  continuationA: ChatResult | null;
  continuationB: ChatResult | null;
  costA: number;
  costB: number;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  // Round WC-W3: structural, key-order-insensitive equality. Prior code was
  // JSON.stringify(a) === JSON.stringify(b), which is sensitive to object-key
  // enumeration order — two providers that parsed the SAME tool-call args to
  // {a:1,b:2} vs {b:2,a:1} produced identical semantics but diverged the
  // arena's argsEquivalent check, mislabeling it as "normalization DIVERGES".
  return _deepEq(a, b);
}

function _deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!_deepEq(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
      if (!_deepEq(ao[k], bo[k])) return false;
    }
    return true;
  }
  // typeof matches, both primitives, not === (covers NaN — treat as unequal,
  // consistent with the previous JSON.stringify behavior which also failed).
  return false;
}

export function isPlainObject(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** TRAP 3 validators — run against the native continuation body captured on the submit.request probe. */
export function validateResultShape(provider: string, body: any): { shape: string; correct: boolean } {
  if (provider === "anthropic") {
    const msgs: any[] = body?.messages ?? [];
    const last = msgs[msgs.length - 1];
    const correct = last?.role === "user" && Array.isArray(last?.content) &&
      last.content.every((b: any) => b?.type === "tool_result" && typeof b?.tool_use_id === "string");
    return { shape: "tool_result-in-user-msg", correct };
  }
  if (provider === "openai") {
    const msgs: any[] = body?.messages ?? [];
    const toolMsgs = msgs.filter((m: any) => m?.role === "tool");
    const correct = toolMsgs.length > 0 && toolMsgs.every((m: any) =>
      typeof m?.tool_call_id === "string" && typeof m?.content === "string");
    return { shape: "role:tool-msg", correct };
  }
  if (provider === "gemini") {
    const contents: any[] = body?.contents ?? [];
    const last = contents[contents.length - 1];
    const fr = (last?.parts ?? []).filter((p: any) => p?.functionResponse != null);
    const correct = fr.length > 0 && fr.every((p: any) =>
      typeof p.functionResponse?.name === "string" && isPlainObject(p.functionResponse?.response));
    return { shape: "functionResponse-part", correct };
  }
  return { shape: "unknown-provider", correct: false };
}
