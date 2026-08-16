/**
 * SPEC §9.15 — failure class: UNATTRIBUTED VERDICT.
 *
 * Every painted verdict must be attributable: the gutter hover tooltip carries
 * a non-empty source (the schema fill source), the tier, the server identity
 * ("stub-pyright" — the same identity editor.conn.serverInfo recorded), and
 * full provenance {tier, extractor, resolved}. The legend spelling out
 * "unknown ≠ green" fires exactly once. All assertions read probe output
 * (editor.verdict.gutter.hover / editor.verdict.legend / editor.conn.serverInfo).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, nodeByName } from "./stub/harness.js";
import { eventsOf, lastPayload, payloadsOf } from "./stub/assert-probes.js";

interface Tooltip {
  status: string;
  source: string;
  tier: string;
  serverName: string;
  provenance: { tier?: string; extractor?: string; resolved?: boolean };
}

interface HoverPayload {
  nodeId: string;
  tooltip: Tooltip;
}

interface LegendEntry {
  status: string;
  meaning: string;
  source: string;
}

test("unattributed verdict: every painted node's hover tooltip names source, tier, server and provenance (type-error.py, §9.15)", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;

  // The server identity that must back every tooltip.
  const serverInfo = lastPayload<{ name: string; version: string }>(bus, "editor.conn.serverInfo");
  assert.equal(serverInfo.name, "stub-pyright", "conn.serverInfo must record the stub identity");

  const paintedIds = new Set(
    payloadsOf<{ nodeId: string }>(bus, "editor.verdict.gutter.paint").map((p) => p.nodeId),
  );
  assert.ok(paintedIds.size >= 3, `expected all 3 fixture nodes painted; saw ${paintedIds.size}`);

  for (const name of ["add", "double", "broken"]) {
    const node = nodeByName(h.nodes, name);
    assert.ok(paintedIds.has(node.id), `${name} was never painted — cannot hover an unpainted node`);

    const returned = h.cell.verdict!.hoverTooltip(node);

    const hover = payloadsOf<HoverPayload>(bus, "editor.verdict.gutter.hover")
      .filter((p) => p.nodeId === node.id)
      .at(-1);
    assert.ok(hover, `editor.verdict.gutter.hover never fired for ${name}`);
    const tip = hover!.tooltip;

    // Non-empty attribution on every field — no anonymous verdicts.
    assert.equal(tip.source, node.fill.source, `${name}: tooltip source must be the schema fill source`);
    assert.ok(tip.source.trim().length > 0, `${name}: tooltip source is empty — anonymous verdict`);
    assert.equal(tip.tier, "CT", `${name}: tooltip must carry the connection tier`);
    assert.equal(tip.serverName, "stub-pyright", `${name}: tooltip must name the backing server`);
    assert.equal(
      tip.serverName,
      serverInfo.name,
      `${name}: tooltip server identity must match editor.conn.serverInfo`,
    );
    assert.ok(
      tip.provenance && typeof tip.provenance === "object",
      `${name}: tooltip has no provenance`,
    );
    assert.equal(tip.provenance.tier, "T1", `${name}: provenance tier missing/wrong`);
    assert.ok(
      (tip.provenance.extractor ?? "").length > 0,
      `${name}: provenance extractor is empty — anonymous verdict`,
    );
    assert.equal(tip.provenance.resolved, true, `${name}: provenance.resolved must be present`);

    // The tooltip status agrees with what the gutter last painted (attribution
    // describes the verdict actually on screen).
    const lastPaint = payloadsOf<{ nodeId: string; status: string }>(bus, "editor.verdict.gutter.paint")
      .filter((p) => p.nodeId === node.id)
      .at(-1)!;
    assert.equal(tip.status, lastPaint.status, `${name}: tooltip status diverges from the painted gutter`);

    // Return value agrees with the probe (asserted additionally, never instead).
    assert.deepEqual(returned, tip);
  }

  await h.cell.dispose();
});

test("unattributed verdict: legend fires exactly once with an 'unknown ≠ green' entry; serverInfo pins the identity (§9.15)", async () => {
  const h = await openTestCell("type-error.py");
  const bus = h.cell.probe;

  // Exactly one legend emission per cell — repaints must not re-spam it.
  const legendEvents = eventsOf(bus, "editor.verdict.legend");
  assert.equal(legendEvents.length, 1, `legend fired ${legendEvents.length} times, expected exactly 1`);

  const entries = (legendEvents[0].payload as { entries: LegendEntry[] }).entries;
  assert.ok(Array.isArray(entries) && entries.length > 0, "legend has no entries");

  const unknownEntry = entries.find((e) => e.status === "unknown");
  assert.ok(unknownEntry, "legend has no entry for status 'unknown'");
  const unknownText = `${unknownEntry!.meaning} ${unknownEntry!.source}`;
  assert.ok(
    /unknown\s*≠\s*green|NOT green/.test(unknownText),
    `legend's unknown entry does not spell out that unknown is not green: ${unknownText}`,
  );

  // The green entry documents the honesty contract (a REAL verdict, never faked).
  const greenEntry = entries.find((e) => e.status === "green");
  assert.ok(greenEntry, "legend has no entry for status 'green'");
  assert.ok(
    /real/i.test(greenEntry!.source) && /never faked/i.test(greenEntry!.source),
    `legend's green entry does not pin green to a real, never-faked verdict: ${greenEntry!.source}`,
  );

  // The server identity that backs every tooltip was recorded on the wire probes.
  const serverInfo = lastPayload<{ name: string; version: string }>(bus, "editor.conn.serverInfo");
  assert.equal(serverInfo.name, "stub-pyright");
  assert.ok(serverInfo.version.length > 0, "serverInfo.version is empty");

  // And a tooltip pulled after the fact still points at that same identity.
  const add = nodeByName(h.nodes, "add");
  h.cell.verdict!.hoverTooltip(add);
  const hover = payloadsOf<HoverPayload>(bus, "editor.verdict.gutter.hover")
    .filter((p) => p.nodeId === add.id)
    .at(-1);
  assert.ok(hover, "no hover probe for add");
  assert.equal(hover!.tooltip.serverName, serverInfo.name);

  await h.cell.dispose();
});
