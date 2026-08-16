// Round W1 (Wave B) regression — Gemini adapter reshapeMessages must produce
// a VALID wire for a multi-round conversation history: functionResponse.name
// must be the function's NAME (Gemini matches by name; id is optional echo),
// and the paired assistant turn that made the tool call must keep its
// functionCall part so the response has a call to match against.
//
// The bugs closed this round (both at packages/byok-arena/src/adapters/gemini/
// wire.ts): toolCallId went into functionResponse.NAME, and the paired
// assistant turn was reshaped to text-only, dropping the functionCall.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Msg } from "../src/interface.ts";
import { reshapeMessages, GEMINI_SYNTH_ID_PREFIX } from "../src/adapters/gemini/wire.ts";

function twoRoundHistory(opts: { synth?: boolean } = {}): Msg[] {
  const id = opts.synth ? `${GEMINI_SYNTH_ID_PREFIX}get_weather-0` : "8f2b1a3c";
  return [
    { role: "user", content: "What's the weather in Paris?" },
    {
      role: "assistant",
      content: "Checking the weather now.",
      toolCalls: [{ id, name: "get_weather", args: { location: "Paris" } }],
    },
    { role: "tool", toolCallId: id, functionName: "get_weather", content: "15°C, sunny" },
    { role: "user", content: "and Rome?" },
  ];
}

test("W1 gemini reshapeMessages: functionResponse.NAME carries the function name (not toolCallId)", () => {
  const { contents } = reshapeMessages(twoRoundHistory());
  // find the functionResponse turn
  const frTurn = contents.find((c: any) =>
    (c.parts ?? []).some((p: any) => p?.functionResponse != null));
  assert.ok(frTurn, "history includes a functionResponse turn");
  const fr = frTurn.parts.find((p: any) => p?.functionResponse != null).functionResponse;
  assert.equal(fr.name, "get_weather", "NAME is the function's name — Gemini matches by name");
  assert.notEqual(fr.name, "8f2b1a3c", "NAME must NOT be the tool call id");
  assert.equal(fr.id, "8f2b1a3c", "id is the optional echo (populated when the id is real, not synth)");
  assert.equal(typeof fr.response, "object");
  assert.equal(fr.response.output, "15°C, sunny");
});

test("W1 gemini reshapeMessages: synthesized (2.5) ids are NOT echoed in the id field", () => {
  const { contents } = reshapeMessages(twoRoundHistory({ synth: true }));
  const frTurn = contents.find((c: any) =>
    (c.parts ?? []).some((p: any) => p?.functionResponse != null));
  const fr = frTurn.parts.find((p: any) => p?.functionResponse != null).functionResponse;
  assert.equal(fr.name, "get_weather", "still matched by name");
  assert.ok(!("id" in fr), "synth ids never hit the wire — mirrors continuation.ts");
});

test("W1 gemini reshapeMessages: the paired assistant turn keeps its functionCall part", () => {
  const { contents } = reshapeMessages(twoRoundHistory());
  const modelTurn = contents.find((c: any) => c.role === "model");
  assert.ok(modelTurn, "assistant turn is reshaped as role:'model'");
  const fcParts = (modelTurn.parts ?? []).filter((p: any) => p?.functionCall != null);
  assert.equal(fcParts.length, 1, "the paired functionCall part is preserved");
  assert.equal(fcParts[0].functionCall.name, "get_weather");
  assert.equal(fcParts[0].functionCall.id, "8f2b1a3c", "real id echoed on the paired call too");
  assert.deepEqual(fcParts[0].functionCall.args, { location: "Paris" });
  // AND the text (assistant thinking-out-loud) survives alongside
  const text = (modelTurn.parts ?? []).find((p: any) => typeof p?.text === "string");
  assert.ok(text, "assistant text part preserved when both text and toolCalls exist");
});

test("W1 gemini reshapeMessages: the functionCall and functionResponse form a NAME-matched pair", () => {
  const { contents } = reshapeMessages(twoRoundHistory());
  const modelTurn = contents.find((c: any) => c.role === "model");
  const fcName = modelTurn.parts.find((p: any) => p?.functionCall != null).functionCall.name;
  const frTurn = contents.find((c: any) =>
    (c.parts ?? []).some((p: any) => p?.functionResponse != null));
  const frName = frTurn.parts.find((p: any) => p?.functionResponse != null).functionResponse.name;
  assert.equal(fcName, frName,
    "wire pair matched by NAME — the second-round contract Gemini expects");
});

test("W1 gemini reshapeMessages: assistant messages WITHOUT toolCalls stay as text-only (backward compatible)", () => {
  const msgs: Msg[] = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello!" },
    { role: "user", content: "how are you?" },
  ];
  const { contents } = reshapeMessages(msgs);
  const modelTurn = contents.find((c: any) => c.role === "model");
  assert.deepEqual(modelTurn.parts, [{ text: "hello!" }],
    "plain assistant messages produce a text part — no regression on single-round chats");
});
