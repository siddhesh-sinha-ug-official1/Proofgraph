// ============================================================================
// Golden native fixtures — OPENAI: dossier-exact wire shapes (§6.C.1, §6.E.1,
// §6.F.1, §6.G.1), Chat Completions + the stubbed Responses branch. Data is
// byte-identical to the single-file goldens it was split from; ../goldens.ts
// re-exports everything.
// ============================================================================

// ---- happy-path chat responses ---------------------------------------------

/** OpenAI Chat Completions: arguments is a JSON-encoded STRING; id "call_…". */
export const openaiWeatherResponse = {
  id: "chatcmpl-GOLD1",
  object: "chat.completion",
  model: "gpt-5.6",
  choices: [{
    index: 0,
    message: {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: "call_9f2GOLD",
        type: "function",
        function: { name: "get_weather", arguments: "{\"location\":\"Paris\"}" },
      }],
    },
    finish_reason: "tool_calls",
  }],
  usage: {
    prompt_tokens: 410,
    completion_tokens: 51,
    total_tokens: 461,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 0 },
  },
};

export const openaiContinuationResponse = {
  id: "chatcmpl-GOLD2",
  object: "chat.completion",
  model: "gpt-5.6",
  choices: [{
    index: 0,
    message: { role: "assistant", content: "It's 15°C and sunny in Paris." },
    finish_reason: "stop",
  }],
  usage: {
    prompt_tokens: 489,
    completion_tokens: 19,
    total_tokens: 508,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 0 },
  },
};

/** OpenAI Responses API (the stubbed branch): id field is `call_id`, not `id`. */
export const openaiResponsesFunctionCallItem = {
  type: "function_call",
  id: "fc_item_GOLD",
  call_id: "call_resp_GOLD",
  name: "get_weather",
  arguments: "{\"location\":\"Paris\"}",
  status: "completed",
};

export const openaiResponsesUsage = {
  input_tokens: 400,
  output_tokens: 60,
  total_tokens: 460,
  input_tokens_details: { cached_tokens: 32 },
  output_tokens_details: { reasoning_tokens: 12 },
};

// ---- list-models response (validateKey wire) --------------------------------

export const openaiModelsResponse = {
  object: "list",
  data: [
    { id: "gpt-5.6", object: "model", owned_by: "openai" },
    { id: "gpt-5.6-terra", object: "model", owned_by: "openai" },
    { id: "gpt-5.6-luna", object: "model", owned_by: "openai" },
    { id: "gpt-4.1", object: "model", owned_by: "openai" },
  ],
};

// ---- error bodies (§6.G.1) --------------------------------------------------

export const openaiInvalidKeyBody = {
  error: {
    message: "Incorrect API key provided: sk-oai-***. You can find your API key at https://platform.openai.com.",
    type: "invalid_request_error",
    param: null,
    code: "invalid_api_key",
  },
};

/** 429 that must NEVER retry — same status as rate limit, opposite action. */
export const openaiInsufficientQuotaBody = {
  error: {
    message: "You exceeded your current quota, please check your plan and billing details.",
    type: "insufficient_quota",
    param: null,
    code: "insufficient_quota",
  },
};

/** 429 that SHOULD retry. */
export const openaiRateLimitBody = {
  error: {
    message: "Rate limit reached for gpt-5.6 in organization org-GOLD on tokens per min.",
    type: "rate_limit_exceeded",
    param: null,
    code: "rate_limit_exceeded",
  },
};

export const openaiServerErrorBody = {
  error: { message: "The server had an error while processing your request.", type: "server_error", param: null, code: null },
};
