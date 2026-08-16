// ============================================================================
// Golden fixtures — the shared arena task + the deterministic local tool
// stub. Data is byte-identical to the single-file goldens it was split from;
// ../goldens.ts re-exports everything.
// ============================================================================

export const weatherTask = {
  messages: [{ role: "user" as const, content: "What's the weather in Paris?" }],
  tools: [{
    name: "get_weather",
    description: "Get current weather",
    parameters: {
      type: "object",
      properties: { location: { type: "string" } },
      required: ["location"],
    },
  }],
};

/** deterministic local tool stub */
export function executeWeatherTool(): string {
  return "15°C, sunny";
}
