/**
 * SPEC §9.14 — failure class: DEBT SHOWN AS VERIFIED.
 *
 * Node.origin maps to a visual treatment that keeps assumed DEBT visually
 * distinct from a real verdict: given → blue, assumed → amber (NEVER green,
 * even when the schema fill claims green), checked → its verdict color. Live
 * errors are never hidden by origin styling — an assumed node with live red
 * diagnostics still shows red. All assertions read editor.verdict.origin.map
 * and editor.verdict.gutter.paint probe output.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { openTestCell, loadFixture, nodeByName } from "./stub/harness.js";
import type { SchemaNode } from "../src/schema/schema.js";
import { payloadsOf } from "./stub/assert-probes.js";

interface OriginMapPayload {
  nodeId: string;
  origin: "given" | "assumed" | "checked";
  treatment: "blue" | "amber" | "verdict-color";
  reason: string;
}

interface GutterPaintPayload {
  nodeId: string;
  lineNumber: number;
  glyphClass: string;
  color: string;
  status: string;
}

interface FillDecisionPayload {
  nodeId: string;
  displayedStatus: string;
  source: string;
  reason: string;
}

function lastOriginMap(
  bus: import("../src/probe/probe-bus.js").ProbeBus,
  nodeId: string,
): OriginMapPayload {
  const maps = payloadsOf<OriginMapPayload>(bus, "editor.verdict.origin.map").filter(
    (m) => m.nodeId === nodeId,
  );
  assert.ok(maps.length > 0, `no editor.verdict.origin.map for node ${nodeId}`);
  return maps.at(-1)!;
}

function gutterPaints(
  bus: import("../src/probe/probe-bus.js").ProbeBus,
  nodeId: string,
): GutterPaintPayload[] {
  const paints = payloadsOf<GutterPaintPayload>(bus, "editor.verdict.gutter.paint").filter(
    (p) => p.nodeId === nodeId,
  );
  assert.ok(paints.length > 0, `no editor.verdict.gutter.paint for node ${nodeId}`);
  return paints;
}

test("debt shown as verified: given→blue, assumed→amber (green fill NEVER leaks), checked→verdict color (clean.py, §9.14)", async () => {
  const h = await openTestCell("clean.py");
  const bus = h.cell.probe;

  // module "clean": origin given ⇒ blue treatment, blue gutter.
  const moduleNode = nodeByName(h.nodes, "clean");
  assert.equal(moduleNode.origin, "given", "fixture precondition");
  const givenMap = lastOriginMap(bus, moduleNode.id);
  assert.equal(givenMap.origin, "given");
  assert.equal(givenMap.treatment, "blue", "given/external must be treated blue");
  assert.equal(gutterPaints(bus, moduleNode.id).at(-1)!.status, "blue");

  // "double": origin assumed WITH a schema fill claiming green ⇒ amber, not green.
  const dbl = nodeByName(h.nodes, "double");
  assert.equal(dbl.origin, "assumed", "fixture precondition");
  assert.equal(dbl.fill.status, "green", "fixture precondition: the tempting green fill");
  const assumedMap = lastOriginMap(bus, dbl.id);
  assert.equal(assumedMap.origin, "assumed");
  assert.equal(assumedMap.treatment, "amber", "assumed is DEBT and must be treated amber");
  const dblPaints = gutterPaints(bus, dbl.id);
  assert.equal(
    dblPaints.at(-1)!.status,
    "amber",
    "assumed debt painted something other than amber",
  );
  assert.ok(
    dblPaints.every((p) => p.status !== "green"),
    `assumed-origin node was painted green at least once — debt shown as verified: ${JSON.stringify(dblPaints)}`,
  );

  // "add": origin checked ⇒ verdict-color treatment, and its real verdict is green.
  const add = nodeByName(h.nodes, "add");
  assert.equal(add.origin, "checked", "fixture precondition");
  const checkedMap = lastOriginMap(bus, add.id);
  assert.equal(checkedMap.origin, "checked");
  assert.equal(checkedMap.treatment, "verdict-color", "checked must render its verdict color");
  assert.equal(gutterPaints(bus, add.id).at(-1)!.status, "green");

  await h.cell.dispose();
});

test("debt shown as verified: assumed origin never hides live errors — red wins over amber debt styling (type-error.py, §9.14)", async () => {
  // Rebuild type-error.py's nodes with `broken` (which carries the live error span)
  // downgraded to origin "assumed" — debt styling must NOT mask the live red.
  const { nodes } = loadFixture("type-error.py");
  const schemaNodes: SchemaNode[] = nodes.map((n) =>
    n.name === "broken" ? { ...n, origin: "assumed" as const } : n,
  );
  const h = await openTestCell("type-error.py", { schemaNodes });
  const bus = h.cell.probe;
  const broken = schemaNodes.find((n) => n.name === "broken")!;

  // Origin treatment is still logged as amber debt…
  const map = lastOriginMap(bus, broken.id);
  assert.equal(map.origin, "assumed");
  assert.equal(map.treatment, "amber");

  // …but the displayed verdict is the live red — errors are never hidden.
  const decision = payloadsOf<FillDecisionPayload>(bus, "editor.verdict.fill.decision")
    .filter((d) => d.nodeId === broken.id)
    .at(-1);
  assert.ok(decision, "no fill.decision for the assumed broken node");
  assert.equal(decision!.displayedStatus, "red", "live errors must win over amber debt styling");
  assert.equal(decision!.source, "lsp-live", "the red must be attributed to live diagnostics");

  const paints = gutterPaints(bus, broken.id);
  assert.equal(
    paints.at(-1)!.status,
    "red",
    "assumed node with live errors must still paint red",
  );
  assert.ok(
    paints.every((p) => p.status !== "green"),
    "assumed node with live errors was painted green",
  );

  await h.cell.dispose();
});
