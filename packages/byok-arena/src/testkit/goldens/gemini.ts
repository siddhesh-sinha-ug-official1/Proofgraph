// ============================================================================
// Golden native fixtures — GEMINI: dossier-exact wire shapes (§6.C.1, §6.E.1,
// §6.F.1, §6.G.1), including the 2.5-style no-id functionCall that forces the
// synthesize branch. Data is byte-identical to the single-file goldens it was
// split from; ../goldens.ts re-exports everything.
// ============================================================================

// ---- happy-path chat responses ---------------------------------------------

/** Gemini 3-style: functionCall part WITH id; both a text part and a functionCall part. */
export const geminiWeatherResponse = {
  candidates: [{
    content: {
      role: "model",
      parts: [
        { text: "Checking the weather now." },
        { functionCall: { name: "get_weather", id: "8f2b1a3c", args: { location: "Paris" } } },
      ],
    },
    finishReason: "STOP",
    index: 0,
  }],
  usageMetadata: {
    promptTokenCount: 400,
    candidatesTokenCount: 40,
    totalTokenCount: 452,
    thoughtsTokenCount: 12,
  },
  modelVersion: "gemini-3.5-flash",
};

/** Gemini 2.5-style: functionCall part WITHOUT id — forces the synthesize branch. */
export const geminiWeatherResponseNoId = {
  candidates: [{
    content: {
      role: "model",
      parts: [{ functionCall: { name: "get_weather", args: { location: "Paris" } } }],
    },
    finishReason: "STOP",
    index: 0,
  }],
  usageMetadata: { promptTokenCount: 380, candidatesTokenCount: 30, totalTokenCount: 410 },
  modelVersion: "gemini-2.5-pro",
};

export const geminiContinuationResponse = {
  candidates: [{
    content: { role: "model", parts: [{ text: "It's 15°C and sunny in Paris." }] },
    finishReason: "STOP",
    index: 0,
  }],
  usageMetadata: { promptTokenCount: 470, candidatesTokenCount: 18, totalTokenCount: 492, thoughtsTokenCount: 4 },
  modelVersion: "gemini-3.5-flash",
};

// ---- list-models response (validateKey wire) --------------------------------

export const geminiModelsResponse = {
  models: [
    {
      name: "models/gemini-2.5-pro",
      supportedGenerationMethods: ["generateContent", "countTokens"],
      inputTokenLimit: 1048576, outputTokenLimit: 65536,
    },
    {
      name: "models/gemini-3.5-flash",
      supportedGenerationMethods: ["generateContent", "countTokens"],
      inputTokenLimit: 1048576, outputTokenLimit: 65536,
    },
    {
      name: "models/text-embedding-004",
      supportedGenerationMethods: ["embedContent"],
      inputTokenLimit: 2048, outputTokenLimit: 1,
    },
  ],
};

// ---- error bodies (§6.G.1) --------------------------------------------------

export const geminiKeyInvalidBody = {
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    status: "INVALID_ARGUMENT",
    details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID", domain: "googleapis.com" }],
  },
};

export const geminiResourceExhaustedBody = {
  error: {
    code: 429,
    message: "Resource has been exhausted (e.g. check quota).",
    status: "RESOURCE_EXHAUSTED",
    details: [],
  },
};

export const geminiFailedPreconditionBody = {
  error: {
    code: 400,
    message: "Gemini API free tier is not available in your country. Please enable billing on your project.",
    status: "FAILED_PRECONDITION",
    details: [],
  },
};

export const geminiUnavailableBody = {
  error: { code: 503, message: "The service is currently unavailable.", status: "UNAVAILABLE", details: [] },
};
