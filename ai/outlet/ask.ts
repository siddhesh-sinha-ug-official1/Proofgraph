// ============================================================================
// V6 outlet — ask(): the single-round tool loop.
// Split out of ai/service.ts (SUB200 restructure). Behavior unchanged.
//
// byokWall.chat(...) → stopReason "tool_calls" → execute the requested tools
// LOCALLY against the provided graph/provenance data →
// byokWall.submitToolResults(...) → final text. A second tool round is refused
// loudly: failure class `tool-loop-exceeded` (maxToolRounds = 1, logged).
//
// SECURITY: the api key travels ONLY as an argument into byokWall.chat /
// submitToolResults. The question is pinned as sha256+length (never text); a
// defensive scrub runs over the final answer surface.
// ============================================================================

import { createHash } from "node:crypto";

import type { Lead } from "../../packages/schema/gen/graph-schema.ts";
import type { ByokWall } from "../../packages/byok-arena/src/wall.ts";
import type { ChatResult, Provider } from "../../packages/byok-arena/src/interface.ts";
import { MAX_TOOL_ROUNDS, TOOL_OUTPUT_MAX_BYTES, OutletFailure } from "./types.ts";
import type { AskOptions, AskResult, OutletGraph, OutletProvenance } from "./types.ts";
import type { OutletPinStream } from "./pins.ts";
import type { OutletTools } from "./tools.ts";

export interface AskDeps {
  byokWall: ByokWall;
  graph: OutletGraph;
  leads: Lead[];
  provenance: OutletProvenance;
  tools: OutletTools;
  pins: OutletPinStream;
}

export function makeAsk(deps: AskDeps): (question: string, opts: AskOptions) => Promise<AskResult> {
  const { byokWall, graph, leads, provenance, tools, pins } = deps;
  const { emit, scrub } = pins;

  return async function ask(question: string, opts: AskOptions): Promise<AskResult> {
    if (typeof question !== "string" || question.length === 0) throw new Error("ask: question required");
    if (!opts || typeof opts.apiKey !== "string" || opts.apiKey.length === 0) throw new Error("ask: opts.apiKey required");
    if (typeof opts.model !== "string" || opts.model.length === 0) throw new Error("ask: opts.model required");
    const provider: Provider = opts.provider ?? "anthropic";

    pins.setActiveSecrets([opts.apiKey]);
    try {
      // question pinned as digest+length ONLY — the outlet pin stream never
      // carries free text that could smuggle key material
      emit("outlet.ask.input", {
        questionSha256: createHash("sha256").update(question, "utf8").digest("hex"),
        questionLength: question.length,
        provider, model: opts.model,
        toolsOffered: tools.defs.map((t) => t.name),
      });

      const messages = [
        {
          role: "system" as const,
          content:
            "You are the AI outlet of a proof-graph assembly. You may ONLY make claims backed by tool outputs. " +
            `Graph snapshot: schemaVersion ${String(graph.schemaVersion)}, ${graph.nodes.length} nodes, ` +
            `${graph.edges.length} resolved edges, ${leads.length} leads (resolved=false — never edges, never followed). ` +
            `Declared roots: ${JSON.stringify(provenance?.roots ?? [])}. ` +
            "When citing declarations, always include their canonical node id verbatim.",
        },
        { role: "user" as const, content: question },
      ];

      const first = await byokWall.chat(provider, {
        apiKey: opts.apiKey, model: opts.model, messages,
        tools: tools.defs,
        ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
      });
      emit("outlet.chat.result", {
        stopReason: first.stopReason,
        toolCallsRequested: first.toolCalls.map((c) => ({ id: c.id, name: c.name })),
      });

      let final: ChatResult = first;
      let toolRounds = 0;
      const executed: { id: string; name: string }[] = [];

      if (first.toolCalls.length > 0) {
        const results = first.toolCalls.map((call) => {
          const bounded = tools.bound(call.name, tools.execute(call.name, call.args));
          emit("outlet.tool.exec", {
            id: call.id, name: call.name, args: call.args,
            output: bounded.output, outputBytes: bounded.bytes,
            isError: bounded.isError, truncated: bounded.truncated,
          });
          executed.push({ id: call.id, name: call.name });
          return { toolCallId: call.id, name: call.name, output: bounded.output, ...(bounded.isError ? { isError: true } : {}) };
        });

        emit("outlet.submit.roundTrip", {
          toolCallIds: results.map((r) => r.toolCallId),
          count: results.length,
          carriedToolsAgain: true,
        });
        final = await byokWall.submitToolResults(provider, {
          apiKey: opts.apiKey, model: opts.model, messages, results, tools: tools.defs,
          // Round WC-W4: thread opts.maxTokens through the continuation too;
          // dropping it silently truncated the user-visible answer.
          ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
        });
        toolRounds = 1;

        const wantsMore = final.toolCalls.length > 0 || final.stopReason === "tool_calls";
        emit("outlet.bound.singleToolRound", {
          maxToolRounds: MAX_TOOL_ROUNDS,
          exceeded: wantsMore,
          ...(wantsMore ? { requested: final.toolCalls.map((c) => c.name) } : {}),
          note: "thin-skeleton bound (V6): exactly one tool round — logged, never silent",
        });
        if (wantsMore) {
          throw new OutletFailure("tool-loop-exceeded",
            `model requested tools again after the single permitted round (maxToolRounds=${MAX_TOOL_ROUNDS}): ${final.toolCalls.map((c) => c.name).join(", ")}`);
        }
      } else {
        emit("outlet.bound.singleToolRound", {
          maxToolRounds: MAX_TOOL_ROUNDS, exceeded: false,
          note: "no tools requested; bound not consumed",
        });
      }

      // defensive scrub of the answer surface (fixture/model could echo a key)
      const text = String(scrub(final.text, "ask.return.text"));
      emit("outlet.ask.output", {
        textSha256: createHash("sha256").update(text, "utf8").digest("hex"),
        textLength: text.length,
        stopReason: final.stopReason, toolRounds,
      });

      return {
        text,
        provider, model: opts.model,
        stopReason: final.stopReason,
        toolRounds,
        toolCallsExecuted: executed,
        usage: { ...final.usage },
        bounds: { maxToolRounds: MAX_TOOL_ROUNDS, toolOutputMaxBytes: TOOL_OUTPUT_MAX_BYTES },
      };
    } finally {
      pins.setActiveSecrets([]);
    }
  };
}
