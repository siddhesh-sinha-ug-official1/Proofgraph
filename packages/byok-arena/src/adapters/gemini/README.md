# byok-arena/src/adapters/gemini

Gemini generateContent wiring: constants and reshaping (`wire.ts` - carries the one open code finding on role:'tool' history replay); error map (`errors.ts`); header-auth validateKey and chat send (`send.ts`); normalization with the synthesized-id branch for 2.5-style responses, TRAPs 1-2 (`normalize.ts`); functionResponse continuation with the stale-cache guard, TRAP 3 (`continuation.ts`).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `wire.ts` | 53 | Gemini constants (BASE, default 1024, gemini-synth- id prefix), the GeminiState shape, reshapeMessages (system → systemInstruction; assistant → role:'model'; neutral tool msgs → functionResponse parts), and the tools[].functionDeclarations[] builder. |
| `errors.ts` | 65 | mapGeminiError: API_KEY_INVALID reason / 403 / PERMISSION_DENIED→invalid_key; 429/RESOURCE_EXHAUSTED→rate_limited until the final attempt then quota_exhausted (both branches probed on quotaDisambig with branchNotTaken); FAILED_PRECONDITION→quota_exhausted; 400→bad_request; 500/503/INTERNAL/UNAVAILABLE→overloaded. |
| `send.ts` | 161 | validateKeyGemini GETs /v1beta/models with the x-goog-api-key header (never ?key=), filters the returned models to generateContent support and strips the models/ prefix, honest ceiling on both branches; chatGemini probes authHeader/transportChoice (native generateContent over the compat base URL)/streamDeferred/toolDecl/maxTokens → generationConfig.maxOutputTokens (defaulted + logged), then POSTs :generateContent and normalizes. |
| `normalize.ts` | 100 | normalizeGemini maps candidates[0].content.parts to ChatResult: textAndCall lead (a single turn can carry both), functionCall.args passed through as an object (TRAP 1), absent/empty ids synthesized as gemini-synth-<name>-<index> with the branch probed (TRAP 2), cache (with synthesized flag) + lastNativeModelContent updated; usage from usageMetadata (thoughts/cached), stopReason derived from functionCall presence then finishReason. |
| `continuation.ts` | 115 | submitGeminiToolResults guards against stale-cache replay (the cached model turn must contain a wanted functionCall, matched by id or by cached name for synthesized ids) else reconstructs results-only; builds functionResponse parts with an OBJECT response, echoing the real id or omitting it for synthesized ids (mapped by name); re-sends the full conversation contents and normalizes (TRAP 3). |
