// ============================================================================
// Google Gemini adapter — Generative Language API, native generateContent
// (NOT Vertex; NOT the /v1beta/interactions API; NOT the OpenAI-compat path —
// the transportChoice probe records that branch).
//   auth:     x-goog-api-key HEADER (never ?key= — keeps the key out of URLs/logs)
//   body:     contents[].parts[]; tools[].functionDeclarations[]
//   TRAP 1:   functionCall.args is ALREADY an object — do not parse again
//   TRAP 2:   id present on Gemini 3, MAY BE ABSENT on 2.5 → synthesize by name/order
//   TRAP 3:   result = functionResponse part; `response` is an OBJECT; full
//             contents re-sent; echo id (Gemini 3) or map by name (2.5)
//   quirk:    a single turn may contain BOTH a text part and a functionCall part
//
// FACADE: the implementation is split by cohesion under ./gemini/ —
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
import type { GeminiState } from "./gemini/wire.ts";
import { validateKeyGemini, chatGemini } from "./gemini/send.ts";
import { submitGeminiToolResults } from "./gemini/continuation.ts";

export { GEMINI_SYNTH_ID_PREFIX } from "./gemini/wire.ts";

export class GeminiAdapter implements ModelAdapter {
  readonly provider: Provider = "gemini";
  private state: GeminiState;

  constructor(bus: ProbeBus, runtime?: Partial<AdapterRuntime>) {
    this.state = {
      bus,
      runtime: defaultRuntime(runtime),
      callCache: new Map(),
      lastNativeModelContent: null,
    };
  }

  // ---- validateKey (§6.B) --------------------------------------------------
  async validateKey(apiKey: string): Promise<{ valid: boolean; models: string[]; error?: AdapterError }> {
    return validateKeyGemini(this.state, apiKey);
  }

  // ---- chat (§6.C/D/E) -----------------------------------------------------
  async chat(req: {
    apiKey: string; model: string; messages: Msg[]; tools?: ToolDef[];
    maxTokens?: number; stream?: boolean; signal?: AbortSignal;
  }): Promise<ChatResult> {
    return chatGemini(this.state, req);
  }

  // ---- submitToolResults (§6.F, TRAP 3) ------------------------------------
  async submitToolResults(req: {
    apiKey: string; model: string; messages: Msg[];
    results: { toolCallId: string; name: string; output: string; isError?: boolean }[];
    tools?: ToolDef[];
  }): Promise<ChatResult> {
    return submitGeminiToolResults(this.state, req);
  }

  // ---- cost (§6.H) ---------------------------------------------------------
  estimateCost(model: string, usage: Usage): number {
    return estimateCostForModel(this.state.bus, "gemini", model, usage, this.state.runtime.now());
  }
}
