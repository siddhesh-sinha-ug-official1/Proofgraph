# byok-arena/src/testkit/goldens

Frozen golden fixtures per provider - responses, continuations, model lists and the four error bodies each - plus the shared get_weather task and its deterministic local tool stub.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `anthropic.ts` | 77 | Anthropic golden fixtures: weather tool_use response (object input, toolu_ id, stop_reason tool_use), continuation, /v1/models list, and the four §6.G error bodies (auth/billing/overloaded/rate-limit). |
| `openai.ts` | 118 | OpenAI golden fixtures: Chat weather response (arguments as a JSON STRING, call_ id), continuation, the Responses function_call item (call_id ≠ item id) and Responses usage, /v1/models list, and the four error bodies incl. the 429 pair (insufficient_quota vs rate_limit_exceeded). |
| `gemini.ts` | 109 | Gemini golden fixtures: Gemini-3-style weather response (functionCall WITH id + text part in one turn), the 2.5-style no-id variant that forces the synthesize branch, continuation, models list (incl. an embedContent-only model that must be filtered), and the four error bodies. |
| `task.ts` | 23 | The shared get_weather arena task (one user message + one JSON-Schema tool) and the deterministic local tool stub returning '15°C, sunny'. |
