/**
 * SPEC §9.5 — failure class: TRUST-BASE LEAK.
 *
 * OUTLINE is the transitive trust base and must be worst-case-wins over
 * outline.worstOf in the frozen order red>amber>blue>definition>lemma>none/green.
 * A null outline renders "not-yet-computed" — NEVER green (an uncomputed trust
 * base shown green is a leak). Every case from outline-fixture.json is driven
 * through the pure decideOutline, then the same property is proven end-to-end
 * on clean.py paints. All assertions read probe output.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, loadOutlineFixture, nodeByName } from "./stub/harness.js";
import type { FillStatus, SchemaNode } from "../src/schema/schema.js";
import { eventsOf, payloadsOf } from "./stub/assert-probes.js";

const FROZEN_ORDER = "red>amber>blue>definition>lemma>none/green";

interface OutlineDecisionPayload {
  nodeId: string;
  worstOf: string[];
  chosen: string;
  order: string;
  displayedStatus: string;
  schemaStatus: string;
  recomputedMatchesSchema: boolean;
}

interface OutlineNullPayload {
  nodeId: string;
  reason: string;
}

interface OutlinePaintPayload {
  nodeId: string;
  ringColor: string;
  status: string;
}

function syntheticNode(caseName: string, worstOf: string[] | null, expectedStatus: string): SchemaNode {
  return {
    id: `syn_outline_${caseName}`,
    kind: "function",
    lang: "python",
    name: caseName,
    signature: null,
    span: { file: "file:///fixtures/synthetic.py", byteStart: 0, byteEnd: 1 },
    fill: { status: "unknown", source: "" },
    outline:
      worstOf === null
        ? null
        : { status: expectedStatus as FillStatus, worstOf: [...worstOf] },
    origin: "checked",
    provenance: { tier: "T1", extractor: "synthetic-outline-case", resolved: true },
  };
}

test("trust-base leak: decideOutline is worst-case-wins in the frozen order for every outline-fixture case (§9.5)", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const cases = loadOutlineFixture();
  assert.ok(cases.length >= 8, `outline fixture unexpectedly small: ${cases.length} cases`);

  for (const c of cases) {
    const node = syntheticNode(c.caseName, c.worstOf, c.expectedStatus);
    const returned = h.cell.verdict!.decideOutline(node, null);

    if (c.worstOf === null) {
      // Null ⇒ the null branch probe fires; NO decision probe; never green.
      const nulls = payloadsOf<OutlineNullPayload>(bus, "editor.verdict.outline.null").filter(
        (p) => p.nodeId === node.id,
      );
      assert.ok(nulls.length > 0, `outline.null did not fire for case ${c.caseName}`);
      assert.equal(nulls.at(-1)!.reason, "outline-not-computed-yet");
      const decisions = payloadsOf<OutlineDecisionPayload>(
        bus,
        "editor.verdict.outline.decision",
      ).filter((p) => p.nodeId === node.id);
      assert.equal(decisions.length, 0, "a null outline must not produce a decision probe");
      assert.equal(returned.displayedStatus, c.expectedStatus); // "not-yet-computed"
      assert.equal(returned.chosen, c.expectedChosen); // "(null)"
      assert.notEqual(returned.displayedStatus, "green", "null outline leaked as green");
      continue;
    }

    const dec = payloadsOf<OutlineDecisionPayload>(bus, "editor.verdict.outline.decision")
      .filter((p) => p.nodeId === node.id)
      .at(-1);
    assert.ok(dec, `outline.decision did not fire for case ${c.caseName}`);
    assert.equal(
      dec!.chosen,
      c.expectedChosen,
      `case ${c.caseName}: worstOf ${JSON.stringify(c.worstOf)} chose ${dec!.chosen}, expected ${c.expectedChosen}`,
    );
    assert.equal(
      dec!.displayedStatus,
      c.expectedStatus,
      `case ${c.caseName}: displayed ${dec!.displayedStatus}, expected ${c.expectedStatus}`,
    );
    assert.equal(dec!.order, FROZEN_ORDER, "decision must carry the frozen order string");
    assert.deepEqual(dec!.worstOf, c.worstOf, "decision must echo the exact worstOf input");
    assert.equal(
      dec!.recomputedMatchesSchema,
      true,
      `case ${c.caseName}: recomputed status must match the schema outline status`,
    );
    // Return value agrees with the probe (asserted additionally, never instead).
    assert.equal(returned.chosen, dec!.chosen);
    assert.equal(returned.displayedStatus, dec!.displayedStatus);
  }

  await h.cell.dispose();
});

test("trust-base leak: end-to-end clean.py — worst ring paints red for double; null outline rings not-yet-computed, never green (§9.5)", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const dbl = nodeByName(h.nodes, "double");
  const unused = nodeByName(h.nodes, "unused_helper");
  assert.deepEqual(dbl.outline?.worstOf, ["green", "amber", "red"], "fixture precondition");
  assert.equal(unused.outline, null, "fixture precondition: unused_helper outline is null");

  // double: worstOf [green,amber,red] ⇒ chosen red ⇒ ring painted red.
  const dblDecision = payloadsOf<OutlineDecisionPayload>(bus, "editor.verdict.outline.decision")
    .filter((p) => p.nodeId === dbl.id)
    .at(-1);
  assert.ok(dblDecision, "no outline.decision for double");
  assert.equal(dblDecision!.chosen, "red");
  assert.equal(dblDecision!.displayedStatus, "red");
  assert.equal(dblDecision!.order, FROZEN_ORDER);

  const dblPaints = payloadsOf<OutlinePaintPayload>(bus, "editor.verdict.outline.paint").filter(
    (p) => p.nodeId === dbl.id,
  );
  assert.ok(dblPaints.length > 0, "no outline.paint for double");
  assert.equal(dblPaints.at(-1)!.status, "red", "the worst of the trust base must win the ring");
  assert.equal(dblPaints.at(-1)!.ringColor, "red");

  // unused_helper: null outline ⇒ outline.null + a not-yet-computed ring; never green.
  const nulls = payloadsOf<OutlineNullPayload>(bus, "editor.verdict.outline.null").filter(
    (p) => p.nodeId === unused.id,
  );
  assert.ok(nulls.length > 0, "outline.null did not fire for unused_helper");
  assert.equal(nulls.at(-1)!.reason, "outline-not-computed-yet");

  const unusedPaints = payloadsOf<OutlinePaintPayload>(bus, "editor.verdict.outline.paint").filter(
    (p) => p.nodeId === unused.id,
  );
  assert.ok(unusedPaints.length > 0, "no outline.paint for unused_helper");
  assert.equal(unusedPaints.at(-1)!.status, "not-yet-computed");
  assert.equal(unusedPaints.at(-1)!.ringColor, "grey");
  assert.ok(
    unusedPaints.every((p) => p.status !== "green" && p.ringColor !== "green"),
    "an uncomputed outline was painted green — trust-base leak",
  );
  // And no decision probe was fabricated for a null outline.
  const unusedDecisions = eventsOf(bus, "editor.verdict.outline.decision").filter(
    (e) => (e.payload as OutlineDecisionPayload).nodeId === unused.id,
  );
  assert.equal(unusedDecisions.length, 0, "null outline must not fabricate a decision");

  // Every fixture-node decision recomputes to exactly the schema's stored status.
  const fixtureIds = new Set(h.nodes.map((n) => n.id));
  const fixtureDecisions = payloadsOf<OutlineDecisionPayload>(
    bus,
    "editor.verdict.outline.decision",
  ).filter((p) => fixtureIds.has(p.nodeId));
  assert.ok(fixtureDecisions.length > 0, "no outline decisions for fixture nodes at all");
  for (const d of fixtureDecisions) {
    assert.equal(
      d.recomputedMatchesSchema,
      true,
      `node ${d.nodeId}: recomputed ${d.displayedStatus} != schema ${d.schemaStatus}`,
    );
  }

  await h.cell.dispose();
});
