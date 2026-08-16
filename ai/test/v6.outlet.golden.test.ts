// ============================================================================
// V6 connector test — the golden round (split from test/v6.outlet.test.ts,
// SUB200 restructure; fixtures in v6.outlet.fixtures.ts, assertions verbatim).
//
// Per the Phase-2 binding rules, every assertion block reads BOTH sides of
// the boundary: cell 6's adapter.*/wall.* pin stream AND the outlet's own
// assembly-side pin stream — never a return value alone.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { createAiOutlet, MAX_TOOL_ROUNDS } from "../service.ts";
import { makeFakeFetch } from "../../packages/byok-arena/src/testkit/fakefetch.ts";
import {
  API_KEY, FINAL_ANSWER, MASTER_SECRET, MODEL, QUESTION, TOOLU_ID, UNUSED_ID,
  lastWallPayload, makeGraph, makeProvenance, makeWall, outletPayloads, v6Routes,
} from "./v6.outlet.fixtures.ts";
import type { WireCapture } from "./v6.outlet.fixtures.ts";

// ---------------------------------------------------------------------------
// 1. the golden round — answer references the REAL unused node id; BOTH pin
//    streams agree across the boundary
// ---------------------------------------------------------------------------

test("V6 golden round: ask() answers with the real unused node id; outlet pins × wall pins agree across the seam", async () => {
  const wire: WireCapture = { chatBodies: [], submitBodies: [] };
  const wall = makeWall(makeFakeFetch(v6Routes(wire)));
  const graph = makeGraph();
  const graphSnapshot = structuredClone(graph);
  const outlet = createAiOutlet({ byokWall: wall, graph, provenance: makeProvenance() });

  const res = await outlet.ask(QUESTION, { apiKey: API_KEY, model: MODEL });

  // ---- (a) the FACE: final answer carries the REAL unused node id ----------
  assert.ok(res.text.includes(UNUSED_ID), `answer must reference the real unused node id ${UNUSED_ID}: ${res.text}`);
  assert.equal(res.text, FINAL_ANSWER);
  assert.equal(res.stopReason, "stop");
  assert.equal(res.toolRounds, 1);
  assert.deepEqual(res.toolCallsExecuted, [{ id: TOOLU_ID, name: "listUnused" }]);
  assert.deepEqual(res.bounds, { maxToolRounds: 1, toolOutputMaxBytes: 16384 });

  // ---- (b) CELL-6 side pins: normalized request carried the tools ----------
  const toolDecl = lastWallPayload(wall, "adapter.anthropic.chat.toolDecl");
  assert.deepEqual(toolDecl.raw, outlet.tools.defs,
    "the adapter's toolDecl pin must carry EXACTLY the outlet's declared tools");
  const chatInput = lastWallPayload(wall, "adapter.anthropic.chat.input");
  assert.deepEqual(chatInput.tools.map((t: any) => t.name),
    ["listUnused", "trustBase", "nodeInfo", "listLeads"]);
  assert.ok(chatInput.messages.some((m: any) => m.role === "user" && m.content === QUESTION));

  const normalized = lastWallPayload(wall, "adapter.anthropic.normalize.output");
  // (normalize.output fires for chat AND submit; the last one is the submit
  // continuation — read the chat one from the dedicated toolCall pins instead)
  const idPin = lastWallPayload(wall, "adapter.anthropic.normalize.toolCall.id.normalized");
  assert.equal(idPin.id, TOOLU_ID);

  // submitToolResults round-tripped the call id: cell-6 pin says so
  const idEcho = lastWallPayload(wall, "adapter.anthropic.submit.idEcho");
  assert.equal(idEcho.echoedId, TOOLU_ID);
  assert.equal(idEcho.matchesReceived, true);
  const submitInput = lastWallPayload(wall, "adapter.anthropic.submit.input");
  assert.equal(submitInput.results[0].toolCallId, TOOLU_ID);
  assert.ok(submitInput.results[0].output.includes(UNUSED_ID),
    "the tool result submitted through the wall must carry the real unused id");
  const submitOutput = lastWallPayload(wall, "adapter.anthropic.submit.output");
  assert.equal(submitOutput.text, res.text, "face text must equal the cell's submit.output pin");
  assert.deepEqual(res.usage, submitOutput.usage);

  // the wall's own dispatch pins saw exactly one chat + one submit
  const wallCalls = wall.pins.history()
    .filter((e) => e.probeId === "wall.call")
    .map((e) => (e.payload as { method: string }).method);
  assert.deepEqual(wallCalls, ["chat", "submitToolResults"]);

  // ---- (b) OUTLET side pins: same truths from the assembly side ------------
  const [askInput] = outletPayloads(outlet, "outlet.ask.input");
  assert.deepEqual(askInput.toolsOffered, ["listUnused", "trustBase", "nodeInfo", "listLeads"]);
  assert.equal(askInput.questionSha256, createHash("sha256").update(QUESTION, "utf8").digest("hex"));
  assert.equal(askInput.questionLength, QUESTION.length);

  const [chatResult] = outletPayloads(outlet, "outlet.chat.result");
  assert.deepEqual(chatResult.toolCallsRequested, [{ id: TOOLU_ID, name: "listUnused" }],
    "outlet pin and wall normalize pin must agree on the requested tool call");
  assert.equal(chatResult.toolCallsRequested[0].id, idPin.id, "SAME call id on both sides of the seam");

  const [toolExec] = outletPayloads(outlet, "outlet.tool.exec");
  assert.equal(toolExec.name, "listUnused");
  assert.equal(toolExec.id, TOOLU_ID);
  assert.equal(toolExec.isError, false);
  assert.equal(toolExec.truncated, false);
  assert.ok(toolExec.output.includes(UNUSED_ID), "locally-executed tool output answers FROM the graph data");
  assert.equal(toolExec.output, submitInput.results[0].output,
    "outlet tool.exec pin output === cell-6 submit.input pin output (byte-identical across the seam)");

  const [roundTrip] = outletPayloads(outlet, "outlet.submit.roundTrip");
  assert.deepEqual(roundTrip.toolCallIds, [TOOLU_ID]);
  assert.equal(roundTrip.toolCallIds[0], idEcho.echoedId, "round-tripped id matches the cell's idEcho pin");

  const [bound] = outletPayloads(outlet, "outlet.bound.singleToolRound");
  assert.equal(bound.exceeded, false);
  assert.equal(bound.maxToolRounds, MAX_TOOL_ROUNDS);

  const [askOutput] = outletPayloads(outlet, "outlet.ask.output");
  assert.equal(askOutput.stopReason, "stop");
  assert.equal(askOutput.toolRounds, 1);

  // ---- wire-level fixture capture (golden shapes actually traveled) --------
  assert.equal(wire.chatBodies.length, 1);
  assert.deepEqual(wire.chatBodies[0].tools.map((t: any) => t.name),
    ["listUnused", "trustBase", "nodeInfo", "listLeads"], "native wire request carried the four tools");
  assert.equal(wire.submitBodies.length, 1);
  const lastMsg = wire.submitBodies[0].messages.at(-1);
  assert.equal(lastMsg.content[0].type, "tool_result");
  assert.equal(lastMsg.content[0].tool_use_id, TOOLU_ID, "TRAP 3 held: tool_result keyed by the verbatim call id");
  assert.ok(lastMsg.content[0].content.includes(UNUSED_ID));
  assert.ok(Array.isArray(wire.submitBodies[0].tools), "tools re-declared on the continuation");

  // ---- (c) SECURITY: no key material anywhere ------------------------------
  const resJson = JSON.stringify(res);
  assert.ok(!resJson.includes(API_KEY), "ask() return must not contain the api key");
  assert.ok(!resJson.includes(MASTER_SECRET), "ask() return must not contain the master secret");
  const outletPinsJson = JSON.stringify(outlet.pins.history());
  assert.ok(!outletPinsJson.includes(API_KEY), "outlet pins must not contain the api key");
  assert.ok(!outletPinsJson.includes(MASTER_SECRET), "outlet pins must not contain the master secret");
  for (const b of [...wire.chatBodies, ...wire.submitBodies]) {
    assert.ok(!JSON.stringify(b).includes(MASTER_SECRET), "master secret must never reach the wire");
  }
  // tools payloads are graph-data only
  assert.ok(!toolExec.output.includes(API_KEY));
  // the graph object after the run: unmutated, and key-free
  assert.deepEqual(graph, graphSnapshot, "the outlet must never mutate the composed graph");
  assert.ok(!JSON.stringify(graph).includes(API_KEY), "no key material in the graph object after the run");

  // wall-side leak scan through the outlet path: clean
  const scan = wall.pins.runSecretLeakScan();
  assert.equal(scan.rawKeyFound, false, `leak sites: ${JSON.stringify(scan.leakSites)}`);
  assert.equal(scan.keyInUrl, false);
  assert.ok(scan.secretsSearched >= 1, "the key passed the redaction chokepoint and was searched for");
  const dumped = JSON.stringify(wall.pins.dump());
  assert.ok(!dumped.includes(API_KEY), "wall.pins.dump() contains the raw api key");
  assert.ok(!dumped.includes(MASTER_SECRET), "wall.pins.dump() contains the master secret");

  assert.equal(normalized.text, FINAL_ANSWER, "last normalize.output (the continuation) equals the final answer");
});
