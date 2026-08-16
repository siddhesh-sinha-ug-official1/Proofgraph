/**
 * SPEC §9.4 — failure class: FAKED VERDICT / HONEST-CEILING (part 1 of 2;
 * SUB200 restructure split — the per-tier loop + probe-density test live in
 * 04b-green-guard-tiers.test.ts; assertions unchanged).
 *
 * Green may never be faked: a schema fill that CLAIMS green renders green only
 * when it is a real compiler verdict (non-empty source, provenance present) AND
 * the connected server tier is CT. At any lesser tier the claim is blocked
 * LOUDLY (guard + blocked probes), the gutter shows unknown, and unknown always
 * renders as unknown — never up-shaded. Every assertion reads probe output.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, nodeByName } from "./stub/harness.js";
import { assertNeverFired, lastPayload, payloadsOf } from "./stub/assert-probes.js";
import {
  paintsFor,
  type GreenBlockedPayload,
  type GreenGuardPayload,
  type TierGuardPayload,
} from "./helpers/green-guard.js";

test("faked verdict: tier-G schema-claimed green paints UNKNOWN, guard + blocked probes fire loudly (§9.4a)", async () => {
  const h = await openTestCell("tier-g.tex", { tier: "G" });
  const bus = h.cell.probe;
  const node = h.nodes[0]; // the single section node claiming green without a compiler
  assert.equal(node.fill.status, "green", "fixture precondition: schema fill claims green");

  // The honesty guard saw the claim and refused it — probe payload is the proof.
  const guards = payloadsOf<GreenGuardPayload>(bus, "editor.verdict.green.guard").filter(
    (g) => g.nodeId === node.id,
  );
  assert.ok(guards.length > 0, "editor.verdict.green.guard never fired for the tier-G node");
  for (const g of guards) {
    assert.equal(g.wouldBeGreen, true, "guard must see the would-be green claim");
    assert.equal(g.greenAllowed, false, "green must NOT be allowed at tier G");
    assert.equal(g.tier, "G");
  }

  // The block is loud, not silent: green.blocked names the frozen reason.
  const blocked = payloadsOf<GreenBlockedPayload>(bus, "editor.verdict.green.blocked").filter(
    (b) => b.nodeId === node.id,
  );
  assert.ok(blocked.length > 0, "editor.verdict.green.blocked never fired for the tier-G node");
  for (const b of blocked) {
    assert.equal(b.reason, "green-may-never-be-faked");
    assert.equal(b.downgradedTo, "unknown", "checked-origin fake green downgrades to unknown");
    assert.equal(b.tier, "G");
  }

  // The gutter actually painted unknown — and NEVER green, at any repaint.
  const paints = paintsFor(bus, node.id);
  assert.equal(paints.at(-1)!.status, "unknown", "gutter must show unknown, not the faked green");
  assert.ok(
    paints.every((p) => p.status !== "green"),
    `gutter painted green at least once for a faked verdict: ${JSON.stringify(paints)}`,
  );

  await h.cell.dispose();
});

test("faked verdict: unknown honesty — unknown renders AS unknown, never up-shaded (clean.py unused_helper, §9.4b)", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;
  const unused = nodeByName(h.nodes, "unused_helper");
  assert.equal(unused.fill.status, "unknown", "fixture precondition: fill is unknown");

  const renders = payloadsOf<{ nodeId: string; status: string; renderedAs: string }>(
    bus,
    "editor.verdict.unknown.render",
  ).filter((r) => r.nodeId === unused.id);
  assert.ok(renders.length > 0, "editor.verdict.unknown.render never fired for unused_helper");
  for (const r of renders) {
    assert.equal(r.status, "unknown");
    assert.equal(r.renderedAs, "unknown", "unknown must render as unknown — never green");
  }

  const paints = paintsFor(bus, unused.id);
  assert.equal(paints.at(-1)!.status, "unknown");
  assert.ok(
    paints.every((p) => p.status !== "green"),
    "an unknown-verdict node was painted green at least once",
  );

  await h.cell.dispose();
});

test("honest ceiling permits truth: real compiler verdict at tier CT paints green, guard allows it (clean.py add, §9.4c)", async () => {
  const h = await openTestCell("clean.py"); // tier defaults to CT
  const bus = h.cell.probe;
  const add = nodeByName(h.nodes, "add");

  const guards = payloadsOf<GreenGuardPayload>(bus, "editor.verdict.green.guard").filter(
    (g) => g.nodeId === add.id,
  );
  assert.ok(guards.length > 0, "editor.verdict.green.guard never fired for add");
  for (const g of guards) {
    assert.equal(g.wouldBeGreen, true);
    assert.equal(g.greenAllowed, true, "a REAL verdict at tier CT must be permitted");
    assert.equal(g.tier, "CT");
    assert.ok(g.source.trim().length > 0, "permitted green must carry a non-empty source");
  }

  assert.equal(paintsFor(bus, add.id).at(-1)!.status, "green", "real verdicts DO paint green");

  // Nothing in clean.py at CT is a fake — the blocked branch must stay silent.
  assertNeverFired(bus, "editor.verdict.green.blocked", "clean.py at CT has no fakes to block");

  // Upstream half: tier CT declares live green allowed.
  const tierGuard = lastPayload<TierGuardPayload>(bus, "editor.conn.tier.guard");
  assert.equal(tierGuard.tier, "CT");
  assert.equal(tierGuard.liveGreenAllowed, true);

  await h.cell.dispose();
});
