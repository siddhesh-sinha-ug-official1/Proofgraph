/**
 * §9.7 — failure class: LATENCY REGRESSION.
 *
 * The keystroke→diagnostic feel chain is measured on LOGICAL CLOCKS only
 * (never wallNanos) and must stay within the declared 400-tick feel budget.
 * Under rapid edits the pipeline must converge on the FINAL model version:
 * the last applied diagnostics batch matches adapter.getVersionId() and the
 * gutter FILL is recomputed (no stale red after the error text is removed).
 *
 * Fixture facts (type-error.py, pure ASCII → utf-16 offset == byte offset):
 *   "unused_var"     at [91,101)  → severity-2 warning
 *   "undefined_name" at [121,135) → severity-1 error
 *   file length 136, node `broken` spans [72,136), schema fill green (stale).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, nodeByName } from "./stub/harness.js";
import { assertFired, lastPayload, payloadsOf } from "./stub/assert-probes.js";

const LATENCY = "editor.latency.keystroke.diagnostic";
/** Declared keystroke→diagnostic feel budget (logical ticks). */
const FEEL_BUDGET = 400;

interface LatencyPayload {
  keystrokeClock: number;
  didChangeClock: number;
  diagInClock: number;
  renderedClock: number;
  endToEndClockDelta: number;
}

/** Chain shape: keystroke < didChange < diagIn < rendered, delta ≤ budget. */
function assertChainShape(p: LatencyPayload): void {
  assert.ok(
    p.keystrokeClock < p.didChangeClock,
    `latency chain out of order: keystrokeClock ${p.keystrokeClock} !< didChangeClock ${p.didChangeClock}`,
  );
  assert.ok(
    p.didChangeClock < p.diagInClock,
    `latency chain out of order: didChangeClock ${p.didChangeClock} !< diagInClock ${p.diagInClock}`,
  );
  assert.ok(
    p.diagInClock < p.renderedClock,
    `latency chain out of order: diagInClock ${p.diagInClock} !< renderedClock ${p.renderedClock}`,
  );
  assert.equal(
    p.endToEndClockDelta,
    p.renderedClock - p.keystrokeClock,
    `endToEndClockDelta ${p.endToEndClockDelta} != renderedClock - keystrokeClock (${p.renderedClock} - ${p.keystrokeClock}); logical clocks only`,
  );
  assert.ok(
    p.endToEndClockDelta <= FEEL_BUDGET,
    `latency regression: endToEndClockDelta observed ${p.endToEndClockDelta} logical ticks > declared feel budget ${FEEL_BUDGET}`,
  );
}

test("latency regression: a single user edit emits the keystroke→diagnostic chain within the 400-tick feel budget", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;

  // One real user keystroke (append a comment at end-of-file; the error text
  // is still present, so the server publishes a non-empty batch for it).
  h.adapter.simulateUserEdit([{ rangeOffset: 136, rangeLength: 0, text: "# k\n" }]);

  // Pins the FIX for the §9-agent finding (stale comment updated in the
  // adversarial claim audit): the buffer.onChange path in src/cell/open.ts
  // now arms pendingLatency BEFORE pump.notify("textDocument/didChange"), so
  // even a synchronously delivered diagnostics batch closes the chain and
  // the latency probe fires for a single edit. This assertion is GREEN.
  assertFired(bus, LATENCY);
  const p = lastPayload<LatencyPayload>(bus, LATENCY);
  assertChainShape(p);
  // Observed value recorded per spec:
  assert.ok(
    p.endToEndClockDelta <= FEEL_BUDGET,
    `observed endToEndClockDelta = ${p.endToEndClockDelta} (budget ${FEEL_BUDGET})`,
  );

  await h.cell.dispose();
});

test("latency regression under rapid edits: last applied diagnostics match the final model version and the gutter FILL is recomputed (no stale red)", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;
  const broken = nodeByName(h.nodes, "broken");

  // Three rapid user edits, chosen so the FINAL text contains NEITHER
  // diagnostic pattern (crisp end state: an empty final batch):
  //   1. append a harmless comment           → error + warning still present
  //   2. overwrite "unused_var"  [91,101)    → warning pattern gone
  //   3. overwrite "undefined_name" [121,135) → error pattern gone
  h.adapter.simulateUserEdit([{ rangeOffset: 136, rangeLength: 0, text: "# tail\n" }]);
  h.adapter.simulateUserEdit([{ rangeOffset: 91, rangeLength: 10, text: "kept_var__" }]);
  h.adapter.simulateUserEdit([{ rangeOffset: 121, rangeLength: 14, text: "y" }]);

  // (a) The LAST diagnostics batch applied is for the FINAL model version —
  //     the version guard proves no stale batch won the race.
  const guards = payloadsOf<{ diagVersion: number | null; modelVersion: number; action: string }>(
    bus,
    "editor.diag.version.guard",
  );
  assert.ok(guards.length >= 4, `expected a version guard per batch (open + 3 edits), saw ${guards.length}`);
  const lastGuard = guards.at(-1)!;
  assert.equal(lastGuard.action, "apply", `last diagnostics batch was ${lastGuard.action}, not applied`);
  assert.equal(
    lastGuard.modelVersion,
    h.adapter.getVersionId(),
    `last applied batch guarded against model version ${lastGuard.modelVersion}, adapter is at ${h.adapter.getVersionId()}`,
  );
  assert.equal(
    lastGuard.diagVersion,
    h.adapter.getVersionId(),
    `last diagnostics version ${lastGuard.diagVersion} is not the final model version ${h.adapter.getVersionId()} — stale diagnostics applied`,
  );

  // (b) The final batch is EMPTY (both patterns removed) and cleared markers.
  const lastInput = lastPayload<{ version: number | null; count: number }>(bus, "editor.diag.input");
  assert.equal(lastInput.count, 0, `final diagnostics batch should be empty, carried ${lastInput.count}`);
  assertFired(bus, "editor.diag.clear");
  const lastMarkerDelta = payloadsOf<{ added: number; removed: number; kept: number; kind: string }>(
    bus,
    "editor.render.decoration.delta",
  )
    .filter((d) => d.kind === "marker")
    .at(-1)!;
  assert.equal(
    lastMarkerDelta.added + lastMarkerDelta.kept,
    0,
    `stale squiggle: last marker paint still carries ${lastMarkerDelta.added + lastMarkerDelta.kept} decoration(s) after the error text was removed`,
  );

  // (c) No stale FILL: broken painted red while the live error existed, and
  //     its LAST gutter paint is green (schema green fill at tier CT wins once
  //     live diagnostics are gone) — the paint was recomputed, not kept.
  const paints = payloadsOf<{ nodeId: string; status: string }>(bus, "editor.verdict.gutter.paint");
  const brokenPaints = paints.filter((x) => x.nodeId === broken.id);
  assert.ok(
    brokenPaints.some((x) => x.status === "red"),
    "precondition: broken must paint red while the live error exists",
  );
  assert.equal(
    brokenPaints.at(-1)!.status,
    "green",
    `stale FILL: broken's last gutter paint is ${brokenPaints.at(-1)!.status}, expected green after the error text was removed`,
  );

  // (d) Every latency chain that fired under the rapid edits is well-formed
  //     and within the feel budget (observed values in the assertion messages).
  const chains = payloadsOf<LatencyPayload>(bus, LATENCY);
  assert.ok(chains.length >= 1, "expected at least one keystroke→diagnostic latency chain under rapid edits");
  for (const p of chains) assertChainShape(p);

  await h.cell.dispose();
});
