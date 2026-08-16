// ============================================================================
// P3 ai server — the FAKE stand-in model (deterministic, wire-honest).
// Split out of ai/server.ts (SUB200 restructure). Behavior unchanged.
//
// FAKE transport (default, the demo path): cell 6's OWN testkit makeFakeFetch
// (explicitly reusable) with a DYNAMIC route pair — a deterministic stand-in
// model that (a) always asks for one graph tool and (b) composes its final
// text ONLY from the tool_result bytes it is handed back on the wire. The tool
// itself executes in the outlet against the REAL hub-served graph, so the
// answer's node ids are real graph facts; the text is honestly labelled
// FAKE-transport. No key ever leaves the process either way — the fake
// transport never reaches the network at all.
// ============================================================================

import type { FakeRoute } from "../../packages/byok-arena/src/testkit/fakefetch.ts";
import { DEFAULT_MODEL } from "./config.ts";

// It reads the user question from the request body, picks ONE graph tool, and
// composes the continuation text ONLY from the tool_result bytes on the wire.

function pickTool(question: string): string {
  if (/lead|unresolved/i.test(question)) return "listLeads";
  return "listUnused";
}

function extractUserQuestion(body: any): string {
  const msgs: any[] = body?.messages ?? [];
  const user = msgs.filter((m) => m?.role === "user").at(-1);
  return typeof user?.content === "string" ? user.content : "";
}

function extractToolResultText(body: any): string {
  for (const m of body?.messages ?? []) {
    if (!Array.isArray(m?.content)) continue;
    for (const block of m.content) {
      if (block?.type !== "tool_result") continue;
      if (typeof block.content === "string") return block.content;
      if (Array.isArray(block.content)) {
        return block.content
          .filter((c: any) => c?.type === "text")
          .map((c: any) => c.text)
          .join("");
      }
    }
  }
  return "";
}

/** Compose the FAKE model's final text from the tool result it was handed —
 *  claims-from-tools-only, enforced structurally (there is nothing else to
 *  read: the fake model has no imagination). */
function composeFakeAnswer(toolResultText: string): string {
  let parsed: any = null;
  try { parsed = JSON.parse(toolResultText); } catch { /* non-JSON stays raw */ }
  const tag = "[FAKE-transport deterministic reader — claims come from the tool result below]";
  if (parsed && Array.isArray(parsed.unused)) {
    if (parsed.unused.length === 0) {
      return `${tag} The graph analysis reports NO unused declarations from the declared roots ${JSON.stringify(parsed.roots ?? [])}.`;
    }
    const items = parsed.unused
      .map((u: any) => `${u.id} ("${u.name}", ${u.kind})`)
      .join("; ");
    return `${tag} The graph analysis reports ${parsed.unused.length} unused declaration(s): ${items}. ` +
      `Unused = not reachable from the DECLARED roots ${JSON.stringify(parsed.roots ?? [])} over resolved edges; leads were not followed. ` +
      `Source: ${parsed.source ?? "(none)"}.`;
  }
  if (parsed && parsed.claim === "none") {
    return `${tag} No unused-set provenance was provided — the outlet makes no reachability claim (roots are declared, never inferred).`;
  }
  if (parsed && Array.isArray(parsed.leads)) {
    const items = parsed.leads.map((l: any) => `${l.id} (${l.srcId} -> ${l.dstId})`).join("; ");
    return `${tag} The graph carries ${parsed.count} unresolved lead(s): ${items || "(none)"}. resolved=false stays a lead — never an edge, never followed.`;
  }
  const short = toolResultText.length > 600 ? toolResultText.slice(0, 600) + "…" : toolResultText;
  return `${tag} Tool result verbatim: ${short}`;
}

export function fakeAnthropicRoutes(): FakeRoute[] {
  let calls = 0;
  return [{
    test: (u, i) => u.hostname === "api.anthropic.com" && u.pathname === "/v1/messages" && i.method === "POST",
    respond: (_u, i) => {
      const body = typeof i.body === "string" ? JSON.parse(i.body) : null;
      const hasToolResult = (body?.messages ?? []).some((m: any) =>
        Array.isArray(m?.content) && m.content.some((b: any) => b?.type === "tool_result"));
      calls += 1;
      if (!hasToolResult) {
        const tool = pickTool(extractUserQuestion(body));
        return {
          status: 200,
          body: {
            id: `msg_p3_fake_${calls}`, type: "message", role: "assistant",
            model: body?.model ?? DEFAULT_MODEL,
            content: [
              { type: "text", text: `Reading the composed graph via the ${tool} tool.` },
              { type: "tool_use", id: `toolu_p3_${calls}`, name: tool, input: {} },
            ],
            stop_reason: "tool_use", stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        };
      }
      return {
        status: 200,
        body: {
          id: `msg_p3_fake_${calls}`, type: "message", role: "assistant",
          model: body?.model ?? DEFAULT_MODEL,
          content: [{ type: "text", text: composeFakeAnswer(extractToolResultText(body)) }],
          stop_reason: "end_turn", stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      };
    },
  }];
}
