// ============================================================================
// Anthropic adapter — Messages API (§7.2).
//   auth:     x-api-key + anthropic-version: 2023-06-01 (dropped-wire killer)
//   body:     model + max_tokens (REQUIRED here, unlike the others) + messages
//   tools:    flat { name, description, input_schema }
//   TRAP 1:   tool_use.input is ALREADY an object — do not parse again
//   TRAP 2:   call id in `id`, prefixed toolu_ — echo back verbatim
//   TRAP 3:   result = tool_result block in a NEW user message, keyed tool_use_id
//
// FACADE: the implementation is split by cohesion under ./anthropic/ —
//   wire.ts (shapes+state+§6.G errors) / normalize.ts (§6.E) /
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
import type { AnthropicState } from "./anthropic/wire.ts";
import { validateKeyAnthropic, chatAnthropic } from "./anthropic/send.ts";
import { submitAnthropicToolResults } from "./anthropic/continuation.ts";

export { ANTHROPIC_VERSION } from "./anthropic/wire.ts";

export class AnthropicAdapter implements ModelAdapter {
  readonly provider: Provider = "anthropic";
  private state: AnthropicState;

  constructor(bus: ProbeBus, runtime?: Partial<AdapterRuntime>) {
    this.state = {
      bus,
      runtime: defaultRuntime(runtime),
      callCache: new Map(),
      lastNativeAssistantContent: null,
    };
  }

  // ---- validateKey (§6.B) --------------------------------------------------
  async validateKey(apiKey: string): Promise<{ valid: boolean; models: string[]; error?: AdapterError }> {
    return validateKeyAnthropic(this.state, apiKey);
  }

  // ---- chat (§6.C/D/E) -----------------------------------------------------
  async chat(req: {
    apiKey: string; model: string; messages: Msg[]; tools?: ToolDef[];
    maxTokens?: number; stream?: boolean; signal?: AbortSignal;
  }): Promise<ChatResult> {
    return chatAnthropic(this.state, req);
  }

  // ---- submitToolResults (§6.F, TRAP 3) ------------------------------------
  async submitToolResults(req: {
    apiKey: string; model: string; messages: Msg[];
    results: { toolCallId: string; name: string; output: string; isError?: boolean }[];
    tools?: ToolDef[];
  }): Promise<ChatResult> {
    return submitAnthropicToolResults(this.state, req);
  }

  // ---- cost (§6.H) ---------------------------------------------------------
  estimateCost(model: string, usage: Usage): number {
    return estimateCostForModel(this.state.bus, "anthropic", model, usage, this.state.runtime.now());
  }
}
