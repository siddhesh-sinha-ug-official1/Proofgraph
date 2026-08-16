// ============================================================================
// Phase-1 WALL CONFORMANCE — pins-vs-face half. Drives the wall with
// representative calls, then reads the cell's PINS and asserts the pin-level
// truth equals what the wall returned. Declared behavior may never diverge
// from probed behavior. Also: the leak scan live through wall.pins (with a
// negative control planted THROUGH the face) and plaintext-free dump().
// Construction gates + pins/catalog assertions live in
// wall-conformance.test.ts; shared setup in wall-helpers.ts.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { WallRefusal } from "../src/wall.ts";
import { executeWeatherTool, weatherTask } from "../src/testkit/goldens.ts";
import { _clearSecretsForTest } from "../src/probe/redact.ts";
import { TEST_KEYS } from "./helpers.ts";
import { GOOD_SECRET, ROUND_MODELS, lastPayload, makeTestWall } from "./wall-helpers.ts";
import type { Provider } from "../src/interface.ts";

// ---------------------------------------------------------------------------
// pins vs face: chat + submitToolResults round on the fake transport
// ---------------------------------------------------------------------------

for (const provider of ["anthropic", "openai"] as Provider[]) {
  test(`conformance (${provider}): wall.chat + wall.submitToolResults results EQUAL the adapter.* pin truths`, async () => {
    _clearSecretsForTest();
    const wall = makeTestWall();
    const model = ROUND_MODELS[provider];
    const apiKey = TEST_KEYS[provider as keyof typeof TEST_KEYS];

    const chatRes = await wall.chat(provider, {
      apiKey, model, messages: weatherTask.messages, tools: weatherTask.tools,
    });

    // face == pin: the fully-normalized ChatResult the wall declared is
    // byte-for-byte the one the normalize stage probed.
    const chatPin = lastPayload(wall, `adapter.${provider}.normalize.output`);
    assert.deepEqual(chatRes, chatPin,
      "wall.chat result diverged from the adapter.*.normalize.output pin");

    // TRAP 1+2 pins agree with the face
    const idPin = lastPayload(wall, `adapter.${provider}.normalize.toolCall.id.normalized`);
    assert.equal(chatRes.toolCalls[0].id, idPin.id);
    const argsPin = lastPayload(wall, `adapter.${provider}.normalize.toolCall.args.normalized`);
    assert.deepEqual(chatRes.toolCalls[0].args, argsPin.args);
    assert.equal(typeof chatRes.toolCalls[0].args, "object");
    if (provider === "openai") assert.equal(argsPin.wasString, true, "OpenAI args arrive as a JSON string — pin must show the parse");

    const subRes = await wall.submitToolResults(provider, {
      apiKey, model, messages: weatherTask.messages,
      results: [{
        toolCallId: chatRes.toolCalls[0].id,
        name: chatRes.toolCalls[0].name,
        output: executeWeatherTool(),
      }],
      tools: weatherTask.tools,
    });

    const submitPin = lastPayload(wall, `adapter.${provider}.submit.output`);
    assert.deepEqual(subRes, submitPin,
      "wall.submitToolResults result diverged from the adapter.*.submit.output pin");
    assert.equal(subRes.text, "It's 15°C and sunny in Paris.");

    // TRAP 2 held end-to-end through the wall: the opaque id echoed verbatim
    const echoPin = lastPayload(wall, `adapter.${provider}.submit.idEcho`);
    assert.equal(echoPin.echoedId, chatRes.toolCalls[0].id);
    assert.equal(echoPin.matchesReceived, true);

    // the wall's own dispatch is on the pin stream too
    const calls = wall.pins.history()
      .filter((e) => e.probeId === "wall.call")
      .map((e) => (e.payload as { method: string }).method);
    assert.deepEqual(calls, ["chat", "submitToolResults"]);
  });
}

// ---------------------------------------------------------------------------
// pins vs face: estimateCost + validateKey (honest ceiling propagates)
// ---------------------------------------------------------------------------

test("conformance: wall.estimateCost equals the cost.estimate.output pin; unpriced models stay an EXPLICIT 0", () => {
  const wall = makeTestWall();

  const priced = wall.estimateCost("anthropic", "claude-sonnet-5", { inputTokens: 420, outputTokens: 58 });
  assert.ok(priced > 0);
  assert.equal(priced, lastPayload(wall, "cost.estimate.output").estimatedCostUsd,
    "wall.estimateCost diverged from the cost.estimate.output pin");

  // honest ceiling: no price row → 0 EXPLICITLY via the unpricedModel decision,
  // never a fabricated number
  const unpriced = wall.estimateCost("openai", "gpt-4.1", { inputTokens: 1000, outputTokens: 100 });
  assert.equal(unpriced, 0);
  const decision = lastPayload(wall, "cost.estimate.unpricedModel");
  assert.equal(decision.model, "gpt-4.1");
  assert.equal(decision.estimatedCostUsd, 0);
  assert.equal(unpriced, lastPayload(wall, "cost.estimate.output").estimatedCostUsd);
});

test("conformance: wall.validateKey equals the validateKey.response pin; honest ceiling stays 'unknown', never green", async () => {
  const wall = makeTestWall();
  const res = await wall.validateKey("anthropic", TEST_KEYS.anthropic);
  assert.equal(res.valid, true);

  const responsePin = lastPayload(wall, "adapter.anthropic.validateKey.response");
  assert.deepEqual(res.models, responsePin.models.map((m: { id: string }) => m.id),
    "wall.validateKey model list diverged from the validateKey.response pin");

  // valid ≠ spendable: the pin says spendable:'unknown' and the wall's face
  // carries NO extra spendability/green claim (same normalized shape only)
  const ceiling = lastPayload(wall, "adapter.anthropic.validateKey.honestCeiling");
  assert.equal(ceiling.authenticates, true);
  assert.equal(ceiling.spendable, "unknown");
  assert.deepEqual(Object.keys(res).sort(), ["models", "valid"],
    "the wall must not add fields the cell's honest ceiling cannot back");
});

test("wall failure class: unknown-provider rejected loudly, probed on wall.reject", async () => {
  const wall = makeTestWall();
  await assert.rejects(
    wall.validateKey("mistral" as Provider, "some-key"),
    (err: unknown) => err instanceof WallRefusal && err.failureClass === "unknown-provider",
  );
  assert.throws(
    () => wall.estimateCost("grok" as Provider, "m", { inputTokens: 1, outputTokens: 1 }),
    (err: unknown) => err instanceof WallRefusal && err.failureClass === "unknown-provider",
  );
  const reject = lastPayload(wall, "wall.reject");
  assert.equal(reject.failureClass, "unknown-provider");
  // the refusal is also on the cell's caught-error surface
  assert.ok(wall.pins.dump().bus.errors.some((e) => /unknown-provider/.test(e.message)));
});

// ---------------------------------------------------------------------------
// leak scan through wall.pins — live scanner, negative control, clean dump
// ---------------------------------------------------------------------------

test("conformance: full three-provider round through the wall → runSecretLeakScan() via wall.pins: rawKeyFound:false, no key in dump()", async () => {
  _clearSecretsForTest();
  const wall = makeTestWall();

  for (const provider of ["anthropic", "openai", "gemini"] as Provider[]) {
    const apiKey = TEST_KEYS[provider as keyof typeof TEST_KEYS];
    const model = ROUND_MODELS[provider];
    await wall.validateKey(provider, apiKey);
    const r = await wall.chat(provider, {
      apiKey, model, messages: weatherTask.messages, tools: weatherTask.tools,
    });
    await wall.submitToolResults(provider, {
      apiKey, model, messages: weatherTask.messages,
      results: [{ toolCallId: r.toolCalls[0].id, name: r.toolCalls[0].name, output: executeWeatherTool() }],
    });
  }

  const scan = wall.pins.runSecretLeakScan();
  assert.equal(scan.rawKeyFound, false, `leak sites: ${JSON.stringify(scan.leakSites)}`);
  assert.equal(scan.keyInUrl, false);
  assert.ok(scan.secretsSearched >= 3, "all three keys passed the chokepoint and were searched for");
  assert.ok(scan.scannedEvents > 100, `probe-dense wall round scanned (${scan.scannedEvents} events)`);

  // dump() through the wall never exposes plaintext keys (or the master secret)
  const dumped = JSON.stringify(wall.pins.dump());
  for (const key of Object.values(TEST_KEYS)) {
    assert.ok(!dumped.includes(key), `wall.pins.dump() contains raw key ending ${key.slice(-4)}`);
  }
  assert.ok(!dumped.includes(GOOD_SECRET), "wall.pins.dump() contains the master secret");
});

test("NEGATIVE CONTROL through the face: a key planted in message content IS caught by the scan via wall.pins", async () => {
  _clearSecretsForTest();
  const wall = makeTestWall();
  const apiKey = TEST_KEYS.anthropic;
  // the plant: the raw key travels as ordinary message text, so it lands in
  // non-redacted probe payloads (chat.input / msgReshape / request body) —
  // exactly the bug class the scanner must catch, driven ONLY via the face
  await wall.chat("anthropic", {
    apiKey, model: "claude-sonnet-5",
    messages: [{ role: "user", content: `please echo my key ${apiKey}` }],
  });
  const scan = wall.pins.runSecretLeakScan();
  assert.equal(scan.rawKeyFound, true, "a scanner that cannot find a plant proves nothing through the wall either");
  assert.ok(
    scan.leakSites.some((s) => s.where === "probe" && s.secretLast4 === apiKey.slice(-4)),
    `expected a probe-site leak ending ${apiKey.slice(-4)}: ${JSON.stringify(scan.leakSites)}`,
  );
});
