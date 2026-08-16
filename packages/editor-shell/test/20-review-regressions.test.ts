/**
 * Regression pins for the adversarial-review findings (24 confirmed, 0 refuted)
 * — HONESTY LENS (part 1 of 3; SUB200 restructure split
 * 20b=span-math/buffer, 20c=protocol/redaction; assertions unchanged).
 * Each test names the failure class the review named; each asserts on probe
 * output. These pin the FIXES so the failure classes cannot silently return.
 */

import test from "node:test";
import assert from "node:assert/strict";
import type { SchemaNode } from "../src/schema/schema.js";
import { openTestCell, nodeByName, loadFixture } from "./stub/harness.js";
import { syntheticNode } from "./helpers/synthetic-node.js";
import { assertFired, eventsOf, lastPayload, payloadsOf } from "./stub/assert-probes.js";

test("upshade violation: a live WARNING can never soften a schema RED verdict (downward-only conflict)", async () => {
  const { nodes } = loadFixture("type-error.py");
  const broken = nodeByName(nodes, "broken");
  // Narrow broken's span to cover ONLY the warning (unused_var, bytes 91..101),
  // not the error at 121; give it a real RED schema verdict.
  const redNode: SchemaNode = {
    ...broken,
    span: { ...broken.span, byteStart: 72, byteEnd: 110 },
    fill: { status: "red", source: "kernel@1.0 proof REJECTED" },
  };
  const h = await openTestCell("type-error.py", {
    schemaNodes: [nodeByName(nodes, "add"), nodeByName(nodes, "double"), redNode],
  });
  const bus = h.cell.probe;

  const paints = payloadsOf<{ nodeId: string; status: string }>(bus, "editor.verdict.gutter.paint");
  const last = paints.filter((p) => p.nodeId === redNode.id).at(-1)!;
  assert.equal(last.status, "red", "schema RED must survive warning-only live diagnostics");

  const conflicts = payloadsOf<{ nodeId: string; winner: string; schemaStatus: string; liveStatus: string }>(
    bus,
    "editor.verdict.conflict",
  ).filter((c) => c.nodeId === redNode.id);
  assert.ok(conflicts.length > 0, "the disagreement must still be a LOGGED conflict");
  assert.equal(conflicts.at(-1)!.winner, "schema-fill", "live may only push DOWN — red keeps");
  await h.cell.dispose();
});

test("faked verdict via tooltip: an UNDECIDED green claim reports unknown, never raw schema green", async () => {
  const h = await openTestCell("clean.py");
  // foreign_fn lives in another file: excluded from this index, never decided.
  const foreign = nodeByName(h.nodes, "foreign_fn");
  const fakeGreenForeign: SchemaNode = {
    ...foreign,
    fill: { status: "green", source: "   " }, // whitespace-only source, too
  };
  const tooltip = h.cell.verdict!.hoverTooltip(fakeGreenForeign);
  assert.equal(tooltip.decided, false);
  assert.equal(tooltip.status, "unknown", "undecided green must render unknown in the tooltip");
  const hover = lastPayload<{ tooltip: { status: string; decided: boolean } }>(
    h.cell.probe,
    "editor.verdict.gutter.hover",
  );
  assert.equal(hover.tooltip.status, "unknown");
  // A DECIDED node still reports its true decided status.
  const add = nodeByName(h.nodes, "add");
  assert.equal(h.cell.verdict!.hoverTooltip(add).status, "green");
  assert.equal(h.cell.verdict!.hoverTooltip(add).decided, true);
  await h.cell.dispose();
});

test("trust-base leak: UNRECOGNIZED outline vocabulary ranks WORST and renders unknown, named in the decision", async () => {
  const h = await openTestCell("clean.py");
  const node = syntheticNode({
    id: "n_unknown_vocab",
    outline: { status: "green", worstOf: ["green", "sorry"] },
  });
  const out = h.cell.verdict!.decideOutline(node, null);
  assert.equal(out.chosen, "sorry", "the unknown token must WIN worst-case-wins, not lose to green");
  assert.equal(out.displayedStatus, "unknown", "unknown vocab renders unknown, never green");
  const decision = lastPayload<{ unrecognizedVocab: string[] }>(
    h.cell.probe,
    "editor.verdict.outline.decision",
  );
  assert.deepEqual(decision.unrecognizedVocab, ["sorry"], "the decision names the unknown tokens");
  await h.cell.dispose();
});

test("faked verdict: provenance.resolved:false blocks green even at tier CT with a named source", async () => {
  const { nodes } = loadFixture("clean.py");
  const add = nodeByName(nodes, "add");
  const unresolved: SchemaNode = {
    ...add,
    provenance: { ...add.provenance, resolved: false },
  };
  const h = await openTestCell("clean.py", {
    schemaNodes: [unresolved],
  });
  const bus = h.cell.probe;
  const guard = payloadsOf<{ nodeId: string; greenAllowed: boolean; reason: string }>(
    bus,
    "editor.verdict.green.guard",
  ).filter((g) => g.nodeId === unresolved.id).at(-1)!;
  assert.equal(guard.greenAllowed, false);
  assert.match(guard.reason, /resolved/);
  assertFired(bus, "editor.verdict.green.blocked");
  const paint = payloadsOf<{ nodeId: string; status: string }>(bus, "editor.verdict.gutter.paint")
    .filter((p) => p.nodeId === unresolved.id).at(-1)!;
  assert.notEqual(paint.status, "green");
  await h.cell.dispose();
});

test("probe-chain integrity: a green gutter paint's causeChain reaches the green-honesty guard", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const add = nodeByName(h.nodes, "add");
  const paintEv = eventsOf(bus, "editor.verdict.gutter.paint").filter(
    (e) => (e.payload as { nodeId: string }).nodeId === add.id,
  ).at(-1)!;
  const chain = bus.causeChain(paintEv).map((e) => e.probeId);
  assert.ok(
    chain.includes("editor.verdict.green.guard"),
    `green paint must chain to the guard; chain was: ${chain.join(" → ")}`,
  );
  assert.ok(chain.includes("editor.verdict.fill.decision"));
  await h.cell.dispose();
});
