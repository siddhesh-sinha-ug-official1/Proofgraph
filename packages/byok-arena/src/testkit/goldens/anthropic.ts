// ============================================================================
// Golden native fixtures — ANTHROPIC: dossier-exact wire shapes (§6.C.1,
// §6.E.1, §6.F.1, §6.G.1). Data is byte-identical to the single-file goldens
// it was split from; ../goldens.ts re-exports everything.
// ============================================================================

// ---- happy-path chat responses ---------------------------------------------

/** Anthropic: tool_use block; input is an OBJECT; stop_reason "tool_use". */
export const anthropicWeatherResponse = {
  id: "msg_01GOLD",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5",
  content: [
    { type: "text", text: "I'll check the weather in Paris." },
    { type: "tool_use", id: "toolu_01A8fGx", name: "get_weather", input: { location: "Paris" } },
  ],
  stop_reason: "tool_use",
  stop_sequence: null,
  usage: {
    input_tokens: 420,
    output_tokens: 58,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    service_tier: "standard",
  },
};

export const anthropicContinuationResponse = {
  id: "msg_02GOLD",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5",
  content: [{ type: "text", text: "It's 15°C and sunny in Paris." }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 502, output_tokens: 21, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
};

// ---- list-models response (validateKey wire) --------------------------------

export const anthropicModelsResponse = {
  data: [
    { id: "claude-fable-5", type: "model", display_name: "Claude Fable 5", capabilities: ["messages", "tools"] },
    { id: "claude-opus-4-8", type: "model", display_name: "Claude Opus 4.8", capabilities: ["messages", "tools"] },
    { id: "claude-sonnet-5", type: "model", display_name: "Claude Sonnet 5", capabilities: ["messages", "tools"] },
    { id: "claude-haiku-4-5", type: "model", display_name: "Claude Haiku 4.5", capabilities: ["messages", "tools"] },
  ],
  has_more: false,
};

// ---- error bodies (§6.G.1) --------------------------------------------------

export const anthropicAuthErrorBody = {
  type: "error",
  error: { type: "authentication_error", message: "invalid x-api-key" },
  request_id: "req_011GOLDERR",
};

export const anthropicBillingErrorBody = {
  type: "error",
  error: { type: "billing_error", message: "Your credit balance is too low to access the Anthropic API." },
  request_id: "req_012GOLDERR",
};

export const anthropicOverloadedBody = {
  type: "error",
  error: { type: "overloaded_error", message: "Overloaded" },
  request_id: "req_013GOLDERR",
};

export const anthropicRateLimitBody = {
  type: "error",
  error: { type: "rate_limit_error", message: "Number of request tokens has exceeded your per-minute rate limit." },
  request_id: "req_014GOLDERR",
};
