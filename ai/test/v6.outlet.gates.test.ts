// ============================================================================
// V6 connector test — bounds + integrity gates + the local tool executor
// (split from test/v6.outlet.test.ts, SUB200 restructure; fixtures in
// v6.outlet.fixtures.ts, assertions verbatim).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { createAiOutlet, OutletFailure } from "../service.ts";
import { makeFakeFetch } from "../../packages/byok-arena/src/testkit/fakefetch.ts";
import {
  API_KEY, MAIN_ID, MODEL, QUESTION, UNUSED_ID, USED_ID,
  loopingRoutes, makeGraph, makeProvenance, makeWall, outletPayloads,
} from "./v6.outlet.fixtures.ts";

// ---------------------------------------------------------------------------
// 4. the single-round bound: tool-loop-exceeded is loud, logged on both sides
// ---------------------------------------------------------------------------

test("V6 bound: a second tool round is refused — failure class tool-loop-exceeded, bound pinned", async () => {
  const wall = makeWall(makeFakeFetch(loopingRoutes()));
  const outlet = createAiOutlet({ byokWall: wall, graph: makeGraph(), provenance: makeProvenance() });

  await assert.rejects(
    outlet.ask(QUESTION, { apiKey: API_KEY, model: MODEL }),
    (err: unknown) => err instanceof OutletFailure && err.failureClass === "tool-loop-exceeded",
  );

  const bounds = outletPayloads(outlet, "outlet.bound.singleToolRound");
  assert.equal(bounds.length, 1);
  assert.equal(bounds[0].exceeded, true);
  assert.equal(bounds[0].maxToolRounds, 1);
  assert.deepEqual(bounds[0].requested, ["listUnused"]);

  // both wall calls happened before the refusal — the bound fired AFTER the
  // round-trip, on the continuation's renewed tool request
  const wallCalls = wall.pins.history()
    .filter((e) => e.probeId === "wall.call")
    .map((e) => (e.payload as { method: string }).method);
  assert.deepEqual(wallCalls, ["chat", "submitToolResults"]);
});

// ---------------------------------------------------------------------------
// 5. graph-data-stale + lead-in-edges: envelope/provenance integrity gates
// ---------------------------------------------------------------------------

test("V6 failure class graph-data-stale: provenance minted from a different snapshot is refused at construction", () => {
  const staleId = "n_deaddeaddeaddead";
  assert.throws(
    () => createAiOutlet({
      byokWall: makeWall(makeFakeFetch([])),
      graph: makeGraph(),
      provenance: { roots: [MAIN_ID], unused: [staleId] },
    }),
    (err: unknown) =>
      err instanceof OutletFailure && err.failureClass === "graph-data-stale" && err.message.includes(staleId),
  );
});

test("V6 failure class lead-in-edges: a resolved=false record inside edges[] is refused", () => {
  const graph = makeGraph();
  (graph.edges as any[]).push({
    id: "e_6666666666666666", kind: "calls", srcId: MAIN_ID, dstId: "unresolved:smuggled",
    resolved: false, resolver: "",
    provenance: { tier: "T1", extractor: "structure-extractor@v6-fixture" },
  });
  assert.throws(
    () => createAiOutlet({ byokWall: makeWall(makeFakeFetch([])), graph, provenance: makeProvenance() }),
    (err: unknown) => err instanceof OutletFailure && err.failureClass === "lead-in-edges",
  );
});

// ---------------------------------------------------------------------------
// 6. the tools answer FROM the data (local executor, no transport involved)
// ---------------------------------------------------------------------------

test("V6 tools: listUnused/trustBase/nodeInfo/listLeads answer from the graph/provenance data; unknown tool is a named error", () => {
  const outlet = createAiOutlet({
    byokWall: makeWall(makeFakeFetch([])), graph: makeGraph(), provenance: makeProvenance(),
  });

  const unused = JSON.parse(outlet.tools.execute("listUnused", {}).output);
  assert.deepEqual(unused.unused, [{ id: UNUSED_ID, name: "helper_unused", kind: "function", lang: "python" }]);
  assert.deepEqual(unused.roots, [MAIN_ID]);

  const tb = JSON.parse(outlet.tools.execute("trustBase", { nodeId: MAIN_ID }).output);
  assert.equal(tb.size, 1);
  assert.deepEqual(tb.base, [{ id: USED_ID, name: "helper_used", fill: "unknown", tier: "T1" }]);
  assert.equal(tb.leadsNotFollowed, 1, "the lead out of helper_used is counted, never followed");

  const ni = outlet.tools.execute("nodeInfo", { nodeId: UNUSED_ID });
  assert.equal(ni.isError, false);
  assert.equal(JSON.parse(ni.output).node.name, "helper_unused");
  const bad = outlet.tools.execute("nodeInfo", { nodeId: "n_ffffffffffffffff" });
  assert.equal(bad.isError, true);
  assert.equal(JSON.parse(bad.output).error, "unknown-node");

  const ll = JSON.parse(outlet.tools.execute("listLeads", {}).output);
  assert.equal(ll.count, 1);
  assert.equal(ll.leads[0].dstId, "unresolved:mystery_helper");
  assert.equal(ll.leads[0].resolved, false);

  const unk = outlet.tools.execute("summonDragons", {});
  assert.equal(unk.isError, true);
  assert.equal(JSON.parse(unk.output).failureClass, "unknown-tool");

  // honest no-claim: without a provided unused set, the tool fabricates nothing
  const bare = createAiOutlet({
    byokWall: makeWall(makeFakeFetch([])), graph: makeGraph(), provenance: {},
  });
  const noClaim = JSON.parse(bare.tools.execute("listUnused", {}).output);
  assert.equal(noClaim.claim, "none");
});
