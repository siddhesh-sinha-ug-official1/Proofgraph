# byok-arena/src/adapters

The three provider adapters behind the shared ModelAdapter interface, each a thin class delegating to its per-provider submodule directory; `shared/` (folded into the table) carries the runtime shapes and the allowlist-gated sendRequest retry loop; `openaiResponses.ts` is the explicitly-stubbed OpenAI Responses branch, exercised only by unit tests.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests. Paths are relative to this directory.

| File | Lines | Verified purpose |
|---|---:|---|
| `shared.ts` | 18 | Facade re-exporting the full shared-machinery surface from shared/runtime.ts and shared/send.ts unchanged; the import path every adapter, index.ts, and tests use. |
| `shared/runtime.ts` | 72 | RetryPolicy shape + defaultRetryPolicy() (2 retries, 250ms base, 4000ms cap), AdapterRuntime + defaultRuntime() filling globalThis.fetch/retry/clock, the HttpOk/MappedError/ProviderErrorMapper shapes, and headersToObject/parseRetryAfterSec; consumed by send.ts and every adapter constructor. |
| `shared/send.ts` | 167 | sendRequest() refuses hosts outside the 3-host allowlist before any fetch (bad_request AdapterFailure), then loops attempts: request probe → fetch → on ok rateLimitHeaders+response probes and return; on error the provider mapper classifies, requestId + retryDecision (with caps) are probed and logged, transient kinds back off min(retryAfter*1000 \| exp, maxBackoffMs) and retry, non-retryable or capped throws AdapterFailure. |
| `anthropic.ts` | 68 | AnthropicAdapter implements ModelAdapter by delegating validateKey/chat/submitToolResults/estimateCost to the anthropic/ submodules over a shared AnthropicState (bus, runtime, call cache, last native assistant content); re-exports ANTHROPIC_VERSION; instantiated by createCell. |
| `openai.ts` | 68 | OpenAIAdapter implements ModelAdapter by delegating to the openai/ submodules over a shared OpenAIState (call cache + last native assistant message); Chat Completions endpoint, with the Responses branch stubbed in openaiResponses.ts; instantiated by createCell. |
| `openaiResponses.ts` | 64 | Explicitly-stubbed OpenAI Responses branch: normalizeResponsesToolCall (arguments string parse; echoable id from call_id, not id), normalizeResponsesUsage (input_/output_tokens + details), buildResponsesResultItem ({type:'function_call_output',call_id,output}); exercised only by unit tests so the Responses-side traps are proven against goldens today. |
| `gemini.ts` | 71 | GeminiAdapter implements ModelAdapter by delegating to the gemini/ submodules over a shared GeminiState (call cache + last native model content); native generateContent transport, x-goog-api-key header auth; re-exports GEMINI_SYNTH_ID_PREFIX; instantiated by createCell. |
