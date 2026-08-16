/**
 * SPEC §9.4 — failure class: FAKED VERDICT / HONEST-CEILING (part 2 of 2;
 * SUB200 restructure split from 04-green-guard.test.ts, assertions
 * unchanged): every non-CT tier blocks schema-claimed green, and the guard
 * probes are cataloged + causally present in the paint run.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import type { DepthTier } from "../src/seams/capability.js";
import { assertFired, eventsOf, payloadsOf } from "./stub/assert-probes.js";
import {
  paintsFor,
  type GreenBlockedPayload,
  type GreenGuardPayload,
  type TierGuardPayload,
} from "./helpers/green-guard.js";

for (const tier of ["G", "S", "P"] as DepthTier[]) {
  test(`faked verdict: tier ${tier} blocks schema-claimed green — unknown painted, tier guard forbids live green (§9.4d/e)`, async () => {
    const h = await openTestCell("tier-g.tex", { tier });
    const bus = h.cell.probe;
    const node = h.nodes[0];

    // (e) Upstream half of the honesty guard: recorded at connect time.
    const tierGuards = payloadsOf<TierGuardPayload>(bus, "editor.conn.tier.guard");
    assert.ok(tierGuards.length > 0, "editor.conn.tier.guard never fired");
    for (const t of tierGuards) {
      assert.equal(t.tier, tier);
      assert.equal(t.liveGreenAllowed, false, `live green must be forbidden at tier ${tier}`);
    }

    // (d) Downstream: the would-be green is refused and painted unknown.
    const guard = payloadsOf<GreenGuardPayload>(bus, "editor.verdict.green.guard")
      .filter((g) => g.nodeId === node.id)
      .at(-1);
    assert.ok(guard, "editor.verdict.green.guard never fired for the tier-g node");
    assert.equal(guard!.wouldBeGreen, true);
    assert.equal(guard!.greenAllowed, false, `green must not be allowed at tier ${tier}`);
    assert.equal(guard!.tier, tier);

    const blocked = eventsOf(bus, "editor.verdict.green.blocked").filter(
      (e) => (e.payload as GreenBlockedPayload).nodeId === node.id,
    );
    assert.ok(blocked.length > 0, `green.blocked did not fire at tier ${tier}`);
    assert.equal((blocked.at(-1)!.payload as GreenBlockedPayload).reason, "green-may-never-be-faked");

    const paints = paintsFor(bus, node.id);
    assert.equal(paints.at(-1)!.status, "unknown");
    assert.ok(paints.every((p) => p.status !== "green"), `tier ${tier} painted a faked green`);

    await h.cell.dispose();
  });
}

test("faked verdict: guard probes are cataloged and causally present in the paint run (§9.4 probe density)", async () => {
  const h = await openTestCell("tier-g.tex", { tier: "G" });
  const bus = h.cell.probe;
  // Both halves of the guard fired in this run and are in the fired-probe set.
  assertFired(bus, "editor.conn.tier.guard");
  assertFired(bus, "editor.verdict.green.guard");
  assertFired(bus, "editor.verdict.green.blocked");
  const fired = new Set(bus.firedProbeIds());
  for (const id of [
    "editor.conn.tier.guard",
    "editor.verdict.green.guard",
    "editor.verdict.green.blocked",
    "editor.verdict.gutter.paint",
  ]) {
    assert.ok(fired.has(id), `${id} missing from firedProbeIds()`);
  }
  await h.cell.dispose();
});
