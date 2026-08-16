# byok-arena/src/adapters/openai

OpenAI Chat-Completions wiring: constants and reshaping (`wire.ts`); the 429 quota disambiguation error map (`errors.ts`); validateKey and chat send (`send.ts`); normalization with boundary JSON-parsing of tool arguments, TRAPs 1-2 (`normalize.ts`); role:'tool' continuation, TRAP 3 (`continuation.ts`).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `wire.ts` | 40 | OpenAI constants (BASE, default 1024), the OpenAIState shape, reshapeMessages (neutral tool msgs → role:'tool' with tool_call_id), and the nested {type:'function',function:{...}} tool declaration builder. |
| `errors.ts` | 49 | mapOpenAIError: 401/invalid_api_key→invalid_key; 429 switched on error.code/type (insufficient_quota→quota_exhausted, else rate_limited) with the quotaDisambig decision probed; 400→bad_request; 500/503/server_error→overloaded; captures x-request-id and Retry-After. |
| `send.ts` | 166 | validateKeyOpenAI GETs /v1/models with Bearer auth (honest ceiling on both branches); chatOpenAI probes authHeader with OpenAI-Organization/Project omitted for BYOK, endpointChoice (chat_completions, not wire-compatible with Responses), streamDeferred + normalize.usage.streamGuard when stream requested, max_completion_tokens defaulted and logged, then POSTs /v1/chat/completions and normalizes. |
| `normalize.ts` | 97 | normalizeOpenAI maps choices[0].message to ChatResult: tool_calls[].function.arguments JSON.parsed at the boundary (malformed → parsedOk:false lead + log, args {}, no crash; pre-parsed objects passed through), id from `id` (TRAP 2), cache + lastNativeAssistantMessage updated; usage prompt_/completion_tokens (+reasoning/cached details), finish_reason mapped. |
| `continuation.ts` | 103 | submitOpenAIToolResults sends one role:'tool' message per call keyed tool_call_id after the assistant tool_calls turn (cache when it matches, else reconstructed with re-serialized cached args), probes resultShape + the Responses branch-not-taken shape + idEcho, POSTs the continuation and normalizes (TRAP 3). |
