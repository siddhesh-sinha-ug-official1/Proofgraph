// ============================================================================
// Fake transport — the injectable seam. Implements each provider's native
// contract from golden fixtures so the cell self-tests offline. The routes
// inspect the REQUEST (host, path, body) to decide chat vs continuation, which
// exercises the adapters' real build/normalize paths end to end.
// ============================================================================

import {
  anthropicContinuationResponse, anthropicModelsResponse, anthropicWeatherResponse,
  geminiContinuationResponse, geminiModelsResponse, geminiWeatherResponse, geminiWeatherResponseNoId,
  openaiContinuationResponse, openaiModelsResponse, openaiWeatherResponse,
} from "./goldens.ts";

export interface FakeResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export type FakeRoute = {
  test: (url: URL, init: RequestInit) => boolean;
  respond: (url: URL, init: RequestInit, nthMatch: number) => FakeResponse;
};

function toResponse(r: FakeResponse): Response {
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { "content-type": "application/json", ...(r.headers ?? {}) },
  });
}

export function makeFakeFetch(routes: FakeRoute[]): typeof fetch {
  const counts = new Map<FakeRoute, number>();
  const impl = async (input: any, init?: any): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.url);
    for (const route of routes) {
      if (route.test(url, init ?? {})) {
        const n = counts.get(route) ?? 0;
        counts.set(route, n + 1);
        return toResponse(route.respond(url, init ?? {}, n));
      }
    }
    return toResponse({ status: 404, body: { error: { message: `fake transport: no route for ${url.href}` } } });
  };
  return impl as typeof fetch;
}

function parseBody(init: RequestInit): any {
  if (typeof init.body !== "string") return null;
  try { return JSON.parse(init.body); } catch { return null; }
}

/**
 * Happy-path routes for all three providers:
 *   GET  /models                       → golden model lists
 *   POST chat (first turn)             → golden weather tool-call response
 *   POST chat (contains tool results)  → golden continuation response
 */
export function providerHappyRoutes(opts?: { geminiVariant?: "withId" | "noId" }): FakeRoute[] {
  const geminiFirst = opts?.geminiVariant === "noId" ? geminiWeatherResponseNoId : geminiWeatherResponse;
  return [
    // ---- Anthropic ----
    {
      test: (u, i) => u.hostname === "api.anthropic.com" && u.pathname === "/v1/models" && (i.method ?? "GET") === "GET",
      respond: () => ({
        status: 200, body: anthropicModelsResponse,
        headers: { "anthropic-ratelimit-requests-limit": "4000", "anthropic-ratelimit-requests-remaining": "3999" },
      }),
    },
    {
      test: (u, i) => u.hostname === "api.anthropic.com" && u.pathname === "/v1/messages" && i.method === "POST",
      respond: (_u, i) => {
        const body = parseBody(i);
        const hasToolResult = (body?.messages ?? []).some((m: any) =>
          Array.isArray(m?.content) && m.content.some((b: any) => b?.type === "tool_result"));
        return {
          status: 200,
          body: hasToolResult ? anthropicContinuationResponse : anthropicWeatherResponse,
          headers: {
            "anthropic-ratelimit-input-tokens-limit": "400000",
            "anthropic-ratelimit-input-tokens-remaining": "399580",
            "request-id": "req_fake_ok",
          },
        };
      },
    },
    // ---- OpenAI ----
    {
      test: (u, i) => u.hostname === "api.openai.com" && u.pathname === "/v1/models" && (i.method ?? "GET") === "GET",
      respond: () => ({
        status: 200, body: openaiModelsResponse,
        headers: { "x-ratelimit-limit-requests": "10000", "x-ratelimit-remaining-requests": "9999", "x-request-id": "req_fake_oai" },
      }),
    },
    {
      test: (u, i) => u.hostname === "api.openai.com" && u.pathname === "/v1/chat/completions" && i.method === "POST",
      respond: (_u, i) => {
        const body = parseBody(i);
        const hasToolMsg = (body?.messages ?? []).some((m: any) => m?.role === "tool");
        return {
          status: 200,
          body: hasToolMsg ? openaiContinuationResponse : openaiWeatherResponse,
          headers: {
            "x-ratelimit-limit-tokens": "2000000", "x-ratelimit-remaining-tokens": "1999500",
            "x-request-id": "req_fake_oai2",
          },
        };
      },
    },
    // ---- Gemini ----
    {
      test: (u, i) => u.hostname === "generativelanguage.googleapis.com" && u.pathname === "/v1beta/models" && (i.method ?? "GET") === "GET",
      respond: () => ({ status: 200, body: geminiModelsResponse }),
    },
    {
      test: (u, i) => u.hostname === "generativelanguage.googleapis.com" && u.pathname.endsWith(":generateContent") && i.method === "POST",
      respond: (_u, i) => {
        const body = parseBody(i);
        const hasFunctionResponse = (body?.contents ?? []).some((c: any) =>
          (c?.parts ?? []).some((p: any) => p?.functionResponse != null));
        return { status: 200, body: hasFunctionResponse ? geminiContinuationResponse : geminiFirst };
      },
    },
  ];
}

export function providerHappyFetch(opts?: { geminiVariant?: "withId" | "noId" }): typeof fetch {
  return makeFakeFetch(providerHappyRoutes(opts));
}

/** Replays a fixed sequence of responses for ANY request — for retry/error tests. */
export function sequenceFetch(responses: FakeResponse[]): typeof fetch {
  let n = 0;
  const impl = async (): Promise<Response> => {
    const r = responses[Math.min(n, responses.length - 1)];
    n++;
    return toResponse(r);
  };
  return impl as typeof fetch;
}
