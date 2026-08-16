// Catalog section — the per-provider adapter leads (§6.B–§6.G expanded over
// every provider) followed by the provider-specific leads. Assembled (in this
// exact order) by ../catalog.ts; element-for-element what it always was.

import type { CatalogEntry } from "../bus.ts";
import { e, PROVIDERS } from "./entry.ts";

export function adapterEntries(): CatalogEntry[] {
  const c: CatalogEntry[] = [];

  for (const p of PROVIDERS) {
    const A = `adapter.${p}`;

    // 6.B validateKey
    c.push(
      e(`${A}.validateKey.request`, "call", "{method,host,path,url,headers:redacted}",
        `exact validation wire for ${p} (free, no-token GET /models — validity + capability probe)`),
      e(`${A}.validateKey.response`, "output", "{status,models,valid}",
        `which models this key reaches on ${p}`),
      e(`${A}.validateKey.honestCeiling`, "decision", "{authenticates,spendable,reason}",
        "valid ≠ spendable — list-models proves auth, not positive balance; the cell's unknown≠green"),
      e(`${A}.validateKey.hostAllowlist`, "decision", "{host,allowed,allowlist}",
        "[addition] host allowlist check on the validation wire"),
      e(`${A}.validateKey.timing`, "timing", "{stage,wallNanos}",
        "[addition] validateKey round-trip timing (never ordering)"),

      // 6.C chat: request build
      e(`${A}.chat.input`, "input", "{model,messages,tools?,maxTokens?,stream?}",
        "the neutral request the app handed the adapter"),
      e(`${A}.chat.authHeader`, "value", "{header names → redacted values}",
        p === "anthropic" ? "x-api-key + anthropic-version (the classic dropped-wire killer) + content-type"
          : p === "openai" ? "Authorization: Bearer; OpenAI-Organization/OpenAI-Project OMITTED for BYOK unless user supplies"
          : "x-goog-api-key header (NOT ?key= — keeps key out of URLs/logs)"),
      e(`${A}.chat.toolDecl`, "value", "{raw:ToolDef[],native}",
        p === "anthropic" ? "flat JSON-Schema tool declaration {name,description,input_schema}"
          : p === "openai" ? "nested (Chat Completions) declaration {type:'function',function:{...}}"
          : "Gemini nests under tools[].functionDeclarations[]"),
      e(`${A}.chat.msgReshape`, "value", "{native}",
        p === "anthropic" ? "Anthropic body: max_tokens REQUIRED; system lifted to top-level"
          : p === "openai" ? "OpenAI Chat body: messages[]"
          : "Gemini body: contents[].parts[] (+systemInstruction)"),
      e(`${A}.chat.maxTokens`, "decision", "{provided,applied,required,default?,reason}",
        p === "anthropic" ? "Anthropic REQUIRES max_tokens; if the app omitted it, the applied default is logged (no silent cap)"
          : "sensible default applied and logged (not provider-required)"),
      e(`${A}.chat.streamDeferred`, "decision", "{requested,applied,reason}",
        "[addition] streaming deferred until the non-stream path is green (§8) — the cap is logged, never silent"),

      // 6.D chat: send + receive
      e(`${A}.chat.hostAllowlist`, "decision", "{host,allowed,allowlist}",
        "TLS-only, key only ever sent to the provider's own host — the branch that blocks exfil (also used on submit sends)"),
      e(`${A}.chat.request`, "call", "{method,host,path,url,headers:redacted,body}",
        `the exact chat wire to ${p}`),
      e(`${A}.chat.response.raw`, "output", "{status,headers,body}",
        "the untouched provider response — the raw side of every normalize"),
      e(`${A}.chat.rateLimitHeaders`, "value", "{headers,note?}",
        p === "gemini" ? "Gemini serves limits dynamically; lean on 429+backoff (note carried)"
          : "per-key rate-limit headers (each user's key carries that user's own tier)"),
      e(`${A}.chat.timing`, "timing", "{stage,wallNanos}",
        "chat round-trip latency (never ordering)"),

      // 6.E normalize
      e(`${A}.normalize.envelopePath`, "value", "{toolCallPath,stopPath,usagePath,toolCallsFound,usageFound,textFound}",
        "the exact tree path the normalizer walked — a wrong path silently yields zero tool calls (§6.D.1)"),
      e(`${A}.normalize.toolCall.args.raw`, "value", "{...native args container}",
        p === "openai" ? "OpenAI arguments is a JSON-encoded STRING — the biggest silent bug"
          : `${p} hands you a parsed object — do NOT parse again`),
      e(`${A}.normalize.toolCall.args.normalized`, "output", "{args,wasString,parsedOk?}",
        "TRAP 1 held: args ALWAYS a parsed object in the neutral shape; parsedOk:false is a real failure lead"),
      e(`${A}.normalize.toolCall.id.raw`, "value", "{from,value}",
        p === "anthropic" ? "call-id sits in `id`, prefixed toolu_"
          : p === "openai" ? "Chat uses `id` (call_…); Responses uses `call_id` — from names the field"
          : "Gemini `id`: present on Gemini 3, may be absent on 2.5"),
      e(`${A}.normalize.toolCall.id.normalized`, "output", "{id}",
        "TRAP 2: the opaque id carried through untouched — echoed back verbatim later"),
      e(`${A}.normalize.toolCall`, "output", "ToolCall{id,name,args:object}",
        "one fully-normalized tool call"),
      e(`${A}.normalize.usage.raw`, "value", "native usage object",
        p === "anthropic" ? "input_tokens/output_tokens/cache_*/output_tokens_details.thinking_tokens/service_tier"
          : p === "openai" ? "Chat: prompt_/completion_tokens(+details); Responses: input_/output_tokens(+details) — OpenAI differs between its own two APIs"
          : "usageMetadata: promptTokenCount/candidatesTokenCount/thoughtsTokenCount/cachedContentTokenCount"),
      e(`${A}.normalize.usage.normalized`, "output", "Usage{inputTokens,outputTokens,reasoningTokens?,cachedInputTokens?}",
        "the neutral usage mapping the cost meter prices"),
      e(`${A}.normalize.stopReason`, "value", "{raw,normalized}",
        "native stop signal → neutral enum. ⚠ only the tool-use mapping is dossier-explicit; the rest follows provider docs"),
      e(`${A}.normalize.output`, "output", "ChatResult",
        "the fully-normalized result; text:'' if it only made tool calls; raw keeps the native response"),

      // 6.F submitToolResults
      e(`${A}.submit.input`, "input", "{results,model,messages}",
        "the neutral tool outputs to send back"),
      e(`${A}.submit.assistantReconstruction`, "value", "{source,callIds}",
        "[addition] how the native assistant tool-call turn was rebuilt for the continuation: from the adapter's call cache or synthesized from results only"),
      e(`${A}.submit.resultShape`, "value", "native result message",
        p === "anthropic" ? "tool_result block in a NEW user message, keyed tool_use_id, optional is_error"
          : p === "openai" ? "one role:'tool' message PER call, keyed tool_call_id"
          : "functionResponse part; response is an OBJECT; echo id (Gemini 3) or map by name (2.5); full contents re-sent"),
      e(`${A}.submit.idEcho`, "value", "{echoedId,mappedBy,matchesReceived}",
        "proves TRAP 2 held end-to-end — the exact opaque id came back"),
      e(`${A}.submit.maxTokens`, "decision", "{provided,applied,required,reason}",
        // Round WC-W4: extended catalog (never shrunk). Mirrors chat.maxTokens
        // on the continuation leg — a caller's maxTokens is now honored on
        // submitToolResults; a default substitution is logged (no silent cap).
        p === "anthropic" ? "Anthropic REQUIRES max_tokens on the continuation too; default substitution is logged"
          : "sensible default applied and logged when caller omits maxTokens on the continuation"),
      e(`${A}.submit.request`, "call", "{method,host,path,url,headers:redacted,body}",
        "the continuation wire"),
      e(`${A}.submit.response.raw`, "output", "{status,headers,body}",
        "[addition] the untouched continuation response"),
      e(`${A}.submit.hostAllowlist`, "decision", "{host,allowed,allowlist}",
        "[addition] host allowlist check on the continuation wire"),
      e(`${A}.submit.output`, "output", "ChatResult",
        "the normalized continuation result"),
      e(`${A}.submit.timing`, "timing", "{stage,wallNanos}",
        "[addition] submitToolResults round-trip timing"),

      // 6.G error mapping
      e(`${A}.error.map`, "error", "{raw:{status,error,...},mapped:{kind,retryAfterSec?,requestId?}}",
        "native status/code → AdapterErrorKind; drive retry logic off the kind, not raw status"),
      e(`${A}.error.retryDecision`, "decision", "{kind,willRetry,backoffMs?,retryAfterSec?,cap,reason}",
        "the retry/stop branch; ANY retry cap is logged (no silent cap). invalid_key/quota_exhausted/bad_request→stop; rate_limited/overloaded→retry"),
      e(`${A}.error.requestId`, "value", "{requestId}",
        "request_id / x-request-id captured on EVERY error for support"),
    );
  }

  // provider-specific leads
  c.push(
    // Anthropic
    e("adapter.anthropic.error.spikeGuard", "value", "{note}",
      "sharp usage spikes trip 429 acceleration limits even below ceiling; ramp gradually"),
    // OpenAI
    e("adapter.openai.chat.toolDecl.responses", "value", "{native,note}",
      "flattened (Responses) declaration {type:'function',name,...} — differs from Chat; emitted as the branch NOT taken (Responses endpoint stubbed this round)"),
    e("adapter.openai.chat.endpointChoice", "decision", "{chosen,alt,reason,wireCompatible}",
      "Chat Completions vs Responses are NOT wire-compatible — the branch and why"),
    e("adapter.openai.normalize.usage.streamGuard", "decision", "{stream,includeUsage,reason}",
      "OpenAI streaming omits usage unless stream_options.include_usage:true — why usage is present/absent on a stream"),
    e("adapter.openai.submit.resultShape.responses", "value", "{native,note}",
      "OpenAI Responses result item {type:'function_call_output',call_id,output} (field OUTPUT not content) — branch not taken this round"),
    e("adapter.openai.error.quotaDisambig", "decision", "{status,code,kind,reason}",
      "THE critical BYOK subtlety — OpenAI's 429 is overloaded: rate_limit_exceeded retries, insufficient_quota never succeeds; switch on error.code not status"),
    // Gemini
    e("adapter.gemini.chat.transportChoice", "decision", "{chosen,alt,reason}",
      "native generateContent vs the OpenAI-compat base URL (compat layer occasionally lags features)"),
    e("adapter.gemini.normalize.toolCall.id.synthesized", "branch", "{reason,mappedBy,synthId}",
      "the branch taken when Gemini 2.5 omits the call id — map by name/order"),
    e("adapter.gemini.normalize.textAndCall", "value", "{hasText,hasFunctionCall}",
      "Gemini can emit BOTH a text part and a functionCall part in one turn"),
    e("adapter.gemini.error.quotaDisambig", "decision", "{status,reason,kind,branchNotTaken}",
      "Gemini RESOURCE_EXHAUSTED is ambiguous (rate vs spend cap): backoff, but persistent → quota_exhausted"),
  );

  return c;
}
