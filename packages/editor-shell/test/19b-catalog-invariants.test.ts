/**
 * §9.19 — Probe-catalog completeness, part 2 (SUB200 restructure: split from
 * 19-catalog.test.ts, assertions unchanged): the catalog invariants (unique
 * ids, contract kinds, the 10 firehose flags, >= 120 leads) and the ProbeBus
 * hard-reject of uncataloged emits.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { PROBE_CATALOG, FIREHOSE_IDS } from "../src/probe/catalog.js";
import { ProbeBus } from "../src/probe/probe-bus.js";
import { CONTRACT_KINDS, EXPECTED_FIREHOSE } from "./helpers/catalog-consts.js";

test("undocumented lead: catalog invariants — unique ids, the 11 contract kinds, exactly the 10 firehose leads, >= 120 entries", () => {
  assert.ok(PROBE_CATALOG.length >= 120, `catalog has only ${PROBE_CATALOG.length} entries`);

  const ids = PROBE_CATALOG.map((s) => s.probeId);
  assert.equal(new Set(ids).size, ids.length, "catalog probeIds must be unique");

  for (const spec of PROBE_CATALOG) {
    assert.ok(
      CONTRACT_KINDS.includes(spec.kind),
      `${spec.probeId} has kind "${spec.kind}" outside the 11 contract kinds`,
    );
  }

  for (const id of EXPECTED_FIREHOSE) {
    const spec = PROBE_CATALOG.find((s) => s.probeId === id);
    assert.ok(spec, `firehose lead ${id} missing from the catalog`);
    assert.equal(spec!.firehose, true, `${id} must be flagged firehose:true (never sampled)`);
  }
  assert.deepEqual(
    [...FIREHOSE_IDS].sort(),
    [...EXPECTED_FIREHOSE].sort(),
    "the firehose set is exactly the 10 contract leads — no silent additions or removals",
  );
});

test("undocumented lead: ProbeBus THROWS on an uncataloged emit and nothing enters the probe stream", () => {
  const bus = new ProbeBus({ wallClock: () => null });
  assert.throws(
    () => bus.emit("editor.nonexistent.lead", {}),
    /not in probeCatalog/,
    "an uncataloged lead must throw, not silently log",
  );
  // Probe-stream truth: the rejected emit left no trace.
  assert.deepEqual(bus.firedProbeIds(), []);
  assert.equal(bus.history().length, 0);

  // A cataloged emit is accepted and lands in the stream.
  bus.emit("editor.gate.import.scan", { declaredDeps: [], actualImports: [], fileCount: 0 }, null);
  assert.deepEqual(bus.firedProbeIds(), ["editor.gate.import.scan"]);
  assert.equal(bus.history()[0].probeId, "editor.gate.import.scan");
});
