# byok-arena/src/adapters/anthropic

Anthropic Messages-API wiring: constants, error map and message reshaping (`wire.ts`); validateKey and chat send (`send.ts`); response normalization covering TRAPs 1-2 (`normalize.ts`); tool-result continuation, TRAP 3 (`continuation.ts`).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `wire.ts` | 80 | Anthropic constants (version 2023-06-01, BASE, default max_tokens 1024), the AnthropicState shape, mapAnthropicError (401/authentication_error→invalid_key, 429→rate_limited + spikeGuard probe, 402/billing_error→quota_exhausted, 529/500/503→overloaded, 400→bad_request), reshapeMessages (system lifted to top level; neutral tool msgs → tool_result user messages), and the flat input_schema tool declaration builder. |
| `send.ts` | 146 | validateKeyAnthropic GETs /v1/models with redacted-header probes and emits honestCeiling spendable:'unknown' on success AND failure (returns {valid:false,error} instead of throwing on AdapterFailure); chatAnthropic probes input/authHeader/streamDeferred/toolDecl/maxTokens (required; default logged)/msgReshape then POSTs /v1/messages via sendRequest and normalizes. |
| `normalize.ts` | 78 | normalizeAnthropic maps content[] blocks to ChatResult: tool_use input passed through as the already-parsed object (TRAP 1), id carried verbatim (TRAP 2), call cache + lastNativeAssistantContent updated for the continuation; usage from input_tokens/output_tokens (+thinking/cache_read), stop_reason mapped to the neutral enum. |
| `continuation.ts` | 97 | submitAnthropicToolResults rebuilds the assistant tool_use turn from the cache when it still contains a wanted call (else results-only reconstruction), appends tool_result blocks in a NEW user message keyed tool_use_id (is_error carried), probes resultShape/idEcho/assistantReconstruction, POSTs the continuation and normalizes (TRAP 3). |
