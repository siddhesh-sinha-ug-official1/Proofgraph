/**
 * SPEC §9.6 — failure class: stale squiggle.
 *
 * A slow checker that publishes against a superseded document snapshot must be
 * dropped LOUDLY by the version guard (editor.diag.version.guard action:"drop")
 * and must leave no trace on the markers — only the fresh batch may paint.
 * serverCfg.behaviors.staleOnNextChange makes the stub replay the previous
 * snapshot's diagnostics (version 1) right before the fresh batch (version 2).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell } from "./stub/harness.js";
import { DEFAULT_STUB_SERVER_CONFIG } from "./stub/stub-server.js";
import { assertNeverFired, eventsOf, payloadsOf } from "./stub/assert-probes.js";

interface GuardPayload {
  diagVersion: number | null;
  modelVersion: number;
  action: "drop" | "apply";
  reason: string;
}
interface MarkerSetPayload {
  diagId: string;
  severity: string;
  message: string;
}

test("stale squiggle: version guard drops the stale batch loudly and markers reflect ONLY the fresh batch", async () => {
  const h = await openTestCell("type-error.py", {
    serverCfg: {
      behaviors: { ...DEFAULT_STUB_SERVER_CONFIG.behaviors, staleOnNextChange: true },
    },
  });
  const bus = h.cell.probe;

  // Precondition (probe read): the didOpen batch applied both diagnostics at v1.
  assert.equal(eventsOf(bus, "editor.diag.marker.set").length, 2);

  // User edit removes the error. The stub now publishes:
  //   1) a STALE batch computed on the OLD text, tagged version 1 (error + warning),
  //   2) the fresh batch for version 2 (warning only — the error text is gone).
  const at = h.adapter.getText().indexOf("undefined_name");
  assert.ok(at >= 0);
  h.adapter.simulateUserEdit([{ rangeOffset: at, rangeLength: "undefined_name".length, text: "0" }]);

  // ── The guard's decision log: apply(open) → drop(stale) → apply(fresh). ──
  const guards = payloadsOf<GuardPayload>(bus, "editor.diag.version.guard");
  assert.deepEqual(
    guards.map((g) => ({ diagVersion: g.diagVersion, modelVersion: g.modelVersion, action: g.action })),
    [
      { diagVersion: 1, modelVersion: 1, action: "apply" },
      { diagVersion: 1, modelVersion: 2, action: "drop" },
      { diagVersion: 2, modelVersion: 2, action: "apply" },
    ],
    "expected exactly one loud drop for the stale batch and one apply for the fresh batch",
  );
  const drop = guards.find((g) => g.action === "drop")!;
  assert.match(drop.reason, /stale/, "drop must say WHY (stale squiggles would lie)");

  // ── The dropped batch left no trace: no clear, no mapping, no markers. ──
  // Batches seen: open(2 diags) + stale(2) + fresh(1) = 3 inputs…
  assert.deepEqual(
    payloadsOf<{ count: number }>(bus, "editor.diag.input").map((p) => p.count),
    [2, 2, 1],
  );
  // …but only the two APPLIED batches cleared/mapped/painted.
  assert.equal(eventsOf(bus, "editor.diag.clear").length, 2, "stale batch must not clear-before-apply");
  assert.equal(eventsOf(bus, "editor.diag.map.span").length, 3, "2 mapped at open + 1 fresh; stale mapped nothing");
  const markerSets = eventsOf(bus, "editor.diag.marker.set");
  assert.equal(markerSets.length, 3, "2 markers at open + 1 fresh; a 4th/5th would be the stale batch painting");

  // ── Markers after the drop are the FRESH batch only. ──
  const dropClock = eventsOf(bus, "editor.diag.version.guard").find(
    (e) => (e.payload as GuardPayload).action === "drop",
  )!.logicalClock;
  const afterDrop = markerSets
    .filter((e) => e.logicalClock > dropClock)
    .map((e) => e.payload as MarkerSetPayload);
  assert.equal(afterDrop.length, 1, "exactly one squiggle may exist after the fix");
  assert.equal(afterDrop[0].message, '"unused_var" is assigned but never used');
  assert.equal(afterDrop[0].severity, "warning");
  assert.ok(afterDrop[0].diagId.startsWith("d2-"), "surviving marker must belong to the version-2 batch");

  // The final marker paint replaced the two v1 markers with the one v2 marker.
  const markerDeltas = payloadsOf<{ added: number; removed: number; kept: number; kind: string }>(
    bus,
    "editor.render.decoration.delta",
  ).filter((d) => d.kind === "marker");
  assert.deepEqual(markerDeltas[markerDeltas.length - 1], { added: 1, removed: 2, kept: 0, kind: "marker" });

  // Mapping the fresh warning against the unchanged line stays byte-exact.
  assertNeverFired(bus, "editor.diag.map.mismatch");

  // Additional (probe reads above are primary): the adapter shows exactly the
  // fresh squiggle — count and message — with no stale "undefined_name" remnant.
  const applied = h.adapter.decorationsByKind.get("marker") ?? [];
  assert.equal(applied.length, 1);
  assert.equal(applied[0].message, '"unused_var" is assigned but never used');
  assert.ok(applied.every((d) => !(d.message ?? "").includes("undefined_name")));

  await h.cell.dispose();
});
