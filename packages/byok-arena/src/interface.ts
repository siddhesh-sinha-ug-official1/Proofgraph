// ============================================================================
// Tree 6 — BYOK Multi-Model Arena: the neutral shapes the whole app speaks.
// Reproduced verbatim from the build dossier §7.1. This is the cell's frozen
// contract: every adapter translates to/from its native API behind this shape.
// ============================================================================

// ---- Neutral types the whole app speaks ----
export type Provider = "anthropic" | "openai" | "gemini";

export interface Msg {
  role: "system" | "user" | "assistant" | "tool";
  content: string;                     // plain text; extend with parts if you need multimodal
  toolCallId?: string;                 // for role:"tool" results
  functionName?: string;               // for role:"tool" round-trip — the CALLED function's
                                       // name; Gemini matches functionResponse to functionCall
                                       // by NAME (id is only optional echo). Round W1 (Wave B):
                                       // reshapeMessages reads this so a multi-round history
                                       // survives the wire; callers that reinject a prior tool
                                       // result MUST populate it (== ToolCall.name).
  toolCalls?: ToolCall[];              // for role:"assistant" round-trip — the tool calls the
                                       // model produced this turn (preserve alongside `content`
                                       // text). Round W1: Gemini needs the paired functionCall
                                       // to keep in the second-round contents[] so the
                                       // functionResponse has a call to match against.
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: object;                  // JSON Schema — adapter reshapes per provider
}

export interface ToolCall {
  id: string;                          // provider's opaque call id — echo back verbatim
  name: string;
  args: Record<string, unknown>;       // ALWAYS parsed object (adapter JSON.parses OpenAI's string)
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;            // OpenAI reasoning_tokens / Gemini thoughtsTokenCount
  cachedInputTokens?: number;
  estimatedCostUsd?: number;           // computed from a per-model price table
}

export interface ChatResult {
  text: string;                        // assistant text ("" if it only made tool calls)
  toolCalls: ToolCall[];               // normalized from tool_use / tool_calls / functionCall
  stopReason: "stop" | "tool_calls" | "length" | "content_filter" | "other";
  usage: Usage;
  raw: unknown;                        // keep the native response for debugging
}

// ---- Uniform error taxonomy (the 3 states that drive retry logic) ----
// Naming note (dossier ⚠︎, carried not silently fixed): the dossier calls this a
// "5-state taxonomy" (the five named kinds before the `unknown` catch-all) and
// elsewhere "the 3 states that drive retry logic" (bad-key / rate-limit / quota).
// The enum itself has SIX members. All three framings are carried here on purpose.
export type AdapterErrorKind =
  | "invalid_key"      // 401/400 bad key            → stop, ask user to re-paste
  | "rate_limited"     // 429 transient              → retry w/ backoff, honor retryAfter
  | "quota_exhausted"  // insufficient_quota/billing → stop, surface "add credit" (user's bill)
  | "overloaded"       // 500/503/529               → retry w/ backoff
  | "bad_request"      // 400 malformed             → stop, log
  | "unknown";

export interface AdapterError {
  kind: AdapterErrorKind;
  status: number;
  message: string;
  retryAfterSec?: number;
  requestId?: string;
}

// Runtime carrier for AdapterError (interface §7.1 says "Throws/returns AdapterError
// on failure" — chat/submit throw this; validateKey returns the error field instead).
export class AdapterFailure extends Error {
  adapterError: AdapterError;
  constructor(adapterError: AdapterError) {
    super(`${adapterError.kind} (HTTP ${adapterError.status}): ${adapterError.message}`);
    this.name = "AdapterFailure";
    this.adapterError = adapterError;
  }
}

// ---- The interface every provider adapter implements ----
export interface ModelAdapter {
  readonly provider: Provider;

  // Cheap paste-time check: valid key? which models? (uses the GET /models call)
  validateKey(apiKey: string): Promise<{ valid: boolean; models: string[]; error?: AdapterError }>;

  // One-shot / multi-turn chat with optional tools. Throws/returns AdapterError on failure.
  chat(req: {
    apiKey: string;                    // the USER's key — never persisted by the adapter
    model: string;
    messages: Msg[];
    tools?: ToolDef[];
    maxTokens?: number;                // required for Anthropic; sensible default elsewhere
    stream?: boolean;
    signal?: AbortSignal;
  }): Promise<ChatResult>;

  // Feed tool outputs back in provider-correct shape, continue the turn.
  submitToolResults(req: {
    apiKey: string; model: string; messages: Msg[];
    results: { toolCallId: string; name: string; output: string; isError?: boolean }[];
    tools?: ToolDef[];
    // Round WC-W4: honor caller's maxTokens on the continuation leg (was
    // silently pinned to DEFAULT_MAX_TOKENS across all three adapters).
    maxTokens?: number;
  }): Promise<ChatResult>;

  // Price a Usage object from a per-model table (handle tier cliffs & intro pricing).
  estimateCost(model: string, usage: Usage): number;
}
