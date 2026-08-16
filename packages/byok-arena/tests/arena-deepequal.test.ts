// ============================================================================
// Round WC-W3: arena/compare.ts deepEqual was JSON.stringify(a) ===
// JSON.stringify(b), which is sensitive to object-key enumeration order. Two
// providers that parsed the SAME tool-call args to {a:1,b:2} vs {b:2,a:1}
// produced identical semantics but the arena flagged
// argsEquivalent → false and mislabeled it as "normalization DIVERGES".
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { deepEqual } from "../src/arena/compare.ts";
import { runArena } from "../src/arena/arena.ts";
import { ProbeBus } from "../src/probe/bus.ts";
import { buildCatalog } from "../src/probe/catalog.ts";
import type { ChatResult, ToolCall } from "../src/interface.ts";

test("Round WC-W3: deepEqual is order-insensitive on plain objects", () => {
  assert.equal(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 }), false);
  assert.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), false);
});

test("Round WC-W3: deepEqual recurses into nested objects and arrays", () => {
  assert.equal(
    deepEqual({ outer: { a: 1, b: [1, 2, 3] } }, { outer: { b: [1, 2, 3], a: 1 } }),
    true);
  assert.equal(
    deepEqual({ outer: { a: 1, b: [1, 2, 3] } }, { outer: { b: [1, 2], a: 1 } }),
    false);
  // Arrays are order-SENSITIVE (position matters); only object-key order is
  // normalized.
  assert.equal(deepEqual([1, 2, 3], [3, 2, 1]), false);
  assert.equal(deepEqual([1, 2, 3], [1, 2, 3]), true);
});

test("Round WC-W3: null / primitive / mixed-type comparisons match ===", () => {
  assert.equal(deepEqual(null, null), true);
  assert.equal(deepEqual(null, {}), false);
  assert.equal(deepEqual(0, 0), true);
  assert.equal(deepEqual(0, -0), true);        // === treats these as equal
  assert.equal(deepEqual("x", "x"), true);
  assert.equal(deepEqual("x", "y"), false);
  // NaN stays unequal — consistent with === and with the previous
  // JSON.stringify behavior (both stringify to "null" but this fix keeps the
  // === floor).
  assert.equal(deepEqual(NaN, NaN), false);
});

test("Round WC-W3: arena reports normalizationHolds when both providers parsed args in different key orders", async () => {
  const bus = new ProbeBus(buildCatalog());
  // Two adapters that agree on tool NAME and (semantically) on args but
  // enumerate the object keys in opposite orders. Everything else agrees so
  // the ONLY comparison the round exercises for this regression is argsEquivalent.
  const call = (args: Record<string, unknown>): ToolCall =>
    ({ id: "toolu_wc_w3", name: "get_weather", args });
  const chatResult = (args: Record<string, unknown>): ChatResult => ({
    text: "",
    toolCalls: [call(args)],
    stopReason: "tool_calls",
    usage: { inputTokens: 10, outputTokens: 1 },
    raw: {},
  });
  const submitResult: ChatResult = {
    text: "done", toolCalls: [], stopReason: "stop",
    usage: { inputTokens: 12, outputTokens: 3 }, raw: {},
  };

  const makeAdapter = (provider: "anthropic" | "openai", args: Record<string, unknown>) => ({
    provider,
    validateKey: async () => ({ valid: true, models: [] }),
    chat: async () => {
      // Both sides emit the leads the arena reads on echo/shape so those
      // comparisons pass unchanged.
      bus.emit(`adapter.${provider}.submit.idEcho`, `adapter.${provider}.submit`, "value",
        { echoedId: "toolu_wc_w3", mappedBy: "id", matchesReceived: true });
      bus.emit(`adapter.${provider}.submit.request`, `adapter.${provider}.submit`, "call", {
        method: "POST", host: "x", path: "/y", url: "http://x/y",
        headers: {},
        body: provider === "anthropic"
          ? { messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_wc_w3", content: "ok" }] }] }
          : { messages: [{ role: "tool", tool_call_id: "toolu_wc_w3", content: "ok" }] },
      });
      return chatResult(args);
    },
    submitToolResults: async () => submitResult,
    estimateCost: () => 0.0001,
  });

  const sideA = { adapter: makeAdapter("anthropic", { a: 1, b: 2 }), model: "m", apiKey: "k" };
  const sideB = { adapter: makeAdapter("openai", { b: 2, a: 1 }), model: "m", apiKey: "k" };

  const report = await runArena(bus, {
    task: { messages: [], tools: [] },
    sideA, sideB,
    executeTool: () => "ok",
  });

  assert.equal(report.normalizationHolds, true,
    `arena flagged divergence: ${report.reason} (divergedAt=${report.divergedAt.join(",")})`);
  assert.deepEqual(report.divergedAt, []);
});
