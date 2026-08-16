// ============================================================================
// OpenAI adapter — Chat Completions (§7.2). The Responses endpoint is NOT
// wire-compatible; it is stubbed as an explicit branch (see openaiResponses.ts)
// and the endpointChoice decision probe records why Chat Completions is chosen.
//   auth:     Authorization: Bearer — OpenAI-Organization/Project OMITTED for BYOK
//   tools:    nested { type:"function", function:{ name, description, parameters } }
//   TRAP 1:   tool_calls[].function.arguments is a JSON-encoded STRING — JSON.parse!
//   TRAP 2:   call id in `id` (call_…) on Chat; `call_id` on Responses
//   TRAP 3:   result = one role:"tool" message PER call, keyed tool_call_id
//   429:      switch on error.code — insufficient_quota NEVER retries
//
// FACADE: the implementation is split by cohesion under ./openai/ —
//   wire.ts (shapes+state) / errors.ts (§6.G) / normalize.ts (§6.E) /
//   send.ts (§6.B–E) / continuation.ts (§6.F + continuation cache).
// This module path keeps the adapter's full public surface.
// ============================================================================

import type { ProbeBus } from "../probe/bus.ts";
import type {
  AdapterError, ChatResult, ModelAdapter, Msg, Provider, ToolDef, Usage,
} from "../interface.ts";
import type { AdapterRuntime } from "./shared.ts";
import { defaultRuntime } from "./shared.ts";
import { estimateCostForModel } from "../cost/pricing.ts";
import type { OpenAIState } from "./openai/wire.ts";
import { validateKeyOpenAI, chatOpenAI } from "./openai/send.ts";
import { submitOpenAIToolResults } from "./openai/continuation.ts";

export class OpenAIAdapter implements ModelAdapter {
  readonly provider: Provider = "openai";
  private state: OpenAIState;

  constructor(bus: ProbeBus, runtime?: Partial<AdapterRuntime>) {
    this.state = {
      bus,
      runtime: defaultRuntime(runtime),
      callCache: new Map(),
      lastNativeAssistantMessage: null,
    };
  }

  // ---- validateKey (§6.B) --------------------------------------------------
  async validateKey(apiKey: string): Promise<{ valid: boolean; models: string[]; error?: AdapterError }> {
    return validateKeyOpenAI(this.state, apiKey);
  }

  // ---- chat (§6.C/D/E) -----------------------------------------------------
  async chat(req: {
    apiKey: string; model: string; messages: Msg[]; tools?: ToolDef[];
    maxTokens?: number; stream?: boolean; signal?: AbortSignal;
  }): Promise<ChatResult> {
    return chatOpenAI(this.state, req);
  }

  // ---- submitToolResults (§6.F, TRAP 3) ------------------------------------
  async submitToolResults(req: {
    apiKey: string; model: string; messages: Msg[];
    results: { toolCallId: string; name: string; output: string; isError?: boolean }[];
    tools?: ToolDef[];
  }): Promise<ChatResult> {
    return submitOpenAIToolResults(this.state, req);
  }

  // ---- cost (§6.H) ---------------------------------------------------------
  estimateCost(model: string, usage: Usage): number {
    return estimateCostForModel(this.state.bus, "openai", model, usage, this.state.runtime.now());
  }
}
