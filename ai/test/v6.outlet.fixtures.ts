// ============================================================================
// V6 connector tests — shared fixtures + helpers (SUB200 restructure: split
// out of the former test/v6.outlet.test.ts; the tests themselves now live in
// v6.outlet.golden.test.ts / v6.outlet.gates.test.ts /
// v6.outlet.security.test.ts — same 8 tests, same assertions).
//
// Uses cell 6's OWN testkit fake transport (packages/byok-arena/src/testkit —
// explicitly reusable by other suites) with V6-crafted golden wire fixtures:
// the model requests listUnused, the outlet executes it LOCALLY against the
// composed-graph DATA, submits the tool result through the wall, and the
// final answer must reference the REAL unused node id from the graph.
// ============================================================================

import assert from "node:assert/strict";

import type { OutletGraph, OutletProvenance } from "../service.ts";
import { createByokWall } from "../../packages/byok-arena/src/wall.ts";
import type { ByokWall } from "../../packages/byok-arena/src/wall.ts";
import type { FakeRoute } from "../../packages/byok-arena/src/testkit/fakefetch.ts";

// ---- V6 test secrets (never allowed to serialize anywhere) ------------------
export const MASTER_SECRET = "v6-assembled-master-secret-strong-4242";
export const API_KEY = "sk-ant-api03-v6-outlet-alpha-9911";
export const MODEL = "claude-sonnet-5";
export const TOOLU_ID = "toolu_v6outlet_0001";

// ---- the composed graph as DATA (canonical envelope; ids match ^n_/e_ hex16)
export const MOD_ID = "n_a0a0a0a0a0a0a0a0";
export const MAIN_ID = "n_1111111111111111";
export const USED_ID = "n_2222222222222222";
export const UNUSED_ID = "n_3333333333333333";

function mkNode(id: string, kind: "module" | "function", name: string, byteStart: number) {
  return {
    id, kind, lang: "python" as const, name,
    signature: kind === "function" ? `def ${name}()` : null,
    span: { file: "pkg/mod.py", byteStart, byteEnd: byteStart + 40 },
    fill: { status: "unknown" as const, source: "" },
    outline: null,
    origin: "checked" as const,
    provenance: { tier: "T1" as const, extractor: "structure-extractor@v6-fixture", resolved: true },
  };
}

export function makeGraph(): OutletGraph {
  return {
    schemaVersion: "v0",
    nodes: [
      mkNode(MOD_ID, "module", "pkg.mod", 0),
      mkNode(MAIN_ID, "function", "main", 100),
      mkNode(USED_ID, "function", "helper_used", 200),
      mkNode(UNUSED_ID, "function", "helper_unused", 300),
    ],
    edges: [{
      id: "e_4444444444444444", kind: "calls", srcId: MAIN_ID, dstId: USED_ID,
      resolved: true, resolver: "pyright",
      provenance: { tier: "T2", extractor: "structure-extractor@v6-fixture" },
    }],
    leads: [{
      id: "e_5555555555555555", kind: "calls", srcId: USED_ID, dstId: "unresolved:mystery_helper",
      resolved: false, resolver: "",
      provenance: { tier: "T1", extractor: "structure-extractor@v6-fixture" },
    }],
  } as OutletGraph;
}

export function makeProvenance(): OutletProvenance {
  return {
    roots: [MAIN_ID],
    unused: [UNUSED_ID],
    source: "graph-model-wall.query(unused)",
    generatedAt: "2026-07-20T00:00:00Z",
  };
}

// ---- V6 golden wire fixtures (Anthropic-native shapes, testkit-replayed) ----
export const FINAL_ANSWER =
  `Exactly one declaration in this graph is unused: ${UNUSED_ID} ("helper_unused"). ` +
  `Nothing reaches it from the declared root ${MAIN_ID} ("main").`;

export const chatToolRequestBody = {
  id: "msg_v6_01", type: "message", role: "assistant", model: MODEL,
  content: [
    { type: "text", text: "Let me check the composed graph for unused declarations." },
    { type: "tool_use", id: TOOLU_ID, name: "listUnused", input: {} },
  ],
  stop_reason: "tool_use", stop_sequence: null,
  usage: { input_tokens: 350, output_tokens: 40 },
};

export const continuationBody = {
  id: "msg_v6_02", type: "message", role: "assistant", model: MODEL,
  content: [{ type: "text", text: FINAL_ANSWER }],
  stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 420, output_tokens: 55 },
};

export interface WireCapture { chatBodies: any[]; submitBodies: any[]; }

function hasToolResult(body: any): boolean {
  return (body?.messages ?? []).some((m: any) =>
    Array.isArray(m?.content) && m.content.some((b: any) => b?.type === "tool_result"));
}

/** happy path: first POST → listUnused tool_use; continuation → final answer */
export function v6Routes(wire: WireCapture): FakeRoute[] {
  return [{
    test: (u, i) => u.hostname === "api.anthropic.com" && u.pathname === "/v1/messages" && i.method === "POST",
    respond: (_u, i) => {
      const body = typeof i.body === "string" ? JSON.parse(i.body) : null;
      if (hasToolResult(body)) { wire.submitBodies.push(body); return { status: 200, body: continuationBody }; }
      wire.chatBodies.push(body);
      return { status: 200, body: chatToolRequestBody };
    },
  }];
}

/** adversarial: the model asks for tools AGAIN after the tool round */
export function loopingRoutes(): FakeRoute[] {
  return [{
    test: (u, i) => u.hostname === "api.anthropic.com" && u.pathname === "/v1/messages" && i.method === "POST",
    respond: () => ({ status: 200, body: chatToolRequestBody }),
  }];
}

function counterClock(): () => bigint {
  let n = 0n;
  return () => (n += 1000n);
}

export function makeWall(fetchImpl: typeof fetch): ByokWall {
  return createByokWall({
    masterSecret: MASTER_SECRET,
    fetchImpl,
    retry: { maxRetries: 2, baseBackoffMs: 1, maxBackoffMs: 4, sleep: async () => {} },
    now: () => new Date("2026-07-20T00:00:00Z"),
    nanoClock: counterClock(),
  });
}

export function lastWallPayload<T = any>(wall: ByokWall, probeId: string): T {
  const events = wall.pins.history().filter((e) => e.probeId === probeId);
  assert.ok(events.length > 0, `expected at least one wall pin event for ${probeId}`);
  return events[events.length - 1].payload as T;
}

export function outletPayloads<T = any>(outlet: { pins: { history(): { probeId: string; payload: unknown }[] } }, probeId: string): T[] {
  return outlet.pins.history().filter((e) => e.probeId === probeId).map((e) => e.payload as T);
}

export const QUESTION = "Which declarations in this graph are unused, and what is their trust status?";
