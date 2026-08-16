// ============================================================================
// Round WC-W4: submitToolResults continuation used to hardcode
// DEFAULT_MAX_TOKENS on all three adapters — a caller's maxTokens honored on
// the chat leg was DROPPED on the continuation, silently truncating the
// user-visible answer. This test drives the FAKE-wire path for each adapter
// and asserts:
//   (a) providing maxTokens on submitToolResults carries it into the native
//       request body (max_tokens / max_completion_tokens / generationConfig
//       .maxOutputTokens);
//   (b) omitting maxTokens still uses DEFAULT_MAX_TOKENS AND emits a
//       submit.maxTokens decision probe naming the default substitution.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestCell, payloadOf, TEST_KEYS } from "./helpers.ts";
import { providerHappyFetch } from "../src/testkit/fakefetch.ts";
import { executeWeatherTool, weatherTask } from "../src/testkit/goldens.ts";
import { DEFAULT_MAX_TOKENS as ANTHROPIC_DEFAULT } from "../src/adapters/anthropic/wire.ts";
import { DEFAULT_MAX_TOKENS as OPENAI_DEFAULT } from "../src/adapters/openai/wire.ts";
import { DEFAULT_MAX_TOKENS as GEMINI_DEFAULT } from "../src/adapters/gemini/wire.ts";

async function chatThenSubmit(cell: any, provider: "anthropic" | "openai" | "gemini",
                              model: string, maxTokens?: number) {
  const adapter = cell.adapters[provider];
  const key = TEST_KEYS[provider];
  const first = await adapter.chat({
    apiKey: key, model, messages: weatherTask.messages, tools: weatherTask.tools,
  });
  const call = first.toolCalls[0];
  await adapter.submitToolResults({
    apiKey: key, model, messages: weatherTask.messages,
    results: [{ toolCallId: call.id, name: call.name, output: executeWeatherTool() }],
    tools: weatherTask.tools,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
  });
}

const CASES = [
  {
    provider: "anthropic" as const, model: "claude-sonnet-5",
    default: ANTHROPIC_DEFAULT,
    bodyField: (body: any) => body.max_tokens,
    required: true,
  },
  {
    provider: "openai" as const, model: "gpt-5.6",
    default: OPENAI_DEFAULT,
    bodyField: (body: any) => body.max_completion_tokens,
    required: false,
  },
  {
    provider: "gemini" as const, model: "gemini-3.5-flash",
    default: GEMINI_DEFAULT,
    bodyField: (body: any) => body.generationConfig?.maxOutputTokens,
    required: false,
  },
];

for (const c of CASES) {
  test(`Round WC-W4 (${c.provider}): submit carries caller maxTokens into the wire body`, async () => {
    const cell = makeTestCell({ fetchImpl: providerHappyFetch() });
    await chatThenSubmit(cell, c.provider, c.model, 4096);

    const submitReq = payloadOf(cell, `adapter.${c.provider}.submit.request`);
    assert.equal(c.bodyField(submitReq.body), 4096,
      `${c.provider} submit body must carry maxTokens=4096 (was hardcoded to ${c.default})`);

    const decision = payloadOf(cell, `adapter.${c.provider}.submit.maxTokens`);
    assert.equal(decision.provided, 4096);
    assert.equal(decision.applied, 4096);
    assert.equal(decision.required, c.required);
  });

  test(`Round WC-W4 (${c.provider}): submit defaults to DEFAULT_MAX_TOKENS AND logs the substitution when caller omits maxTokens`, async () => {
    const cell = makeTestCell({ fetchImpl: providerHappyFetch() });
    await chatThenSubmit(cell, c.provider, c.model);

    const submitReq = payloadOf(cell, `adapter.${c.provider}.submit.request`);
    assert.equal(c.bodyField(submitReq.body), c.default,
      `${c.provider} submit body must fall back to ${c.default} when caller omits maxTokens`);

    const decision = payloadOf(cell, `adapter.${c.provider}.submit.maxTokens`);
    assert.equal(decision.provided, null,
      "submit.maxTokens.provided must be null on the default-substitution branch");
    assert.equal(decision.applied, c.default);
    assert.equal(decision.required, c.required);
    assert.match(String(decision.reason), /default/,
      "reason must name the default substitution (no silent caps)");
  });
}
