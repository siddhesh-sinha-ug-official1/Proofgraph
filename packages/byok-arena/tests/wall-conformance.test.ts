// ============================================================================
// Phase-1 WALL CONFORMANCE — construction gates + pins/catalog half.
// The insecure-master-secret gate, the by-design schema absence (asserted to
// STAY absent), the pins quartet, the additive-only catalog, and the
// import-boundary property of wall.ts itself. The pins-vs-face half (face
// results EQUAL pin truths + the leak scan through wall.pins) lives in
// wall-conformance-face.test.ts; shared setup in wall-helpers.ts.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createByokWall, INSECURE_DEV_MASTER_SECRET, WALL_VERSION, WallRefusal,
} from "../src/wall.ts";
import { createCell } from "../src/index.ts";
import { providerHappyFetch } from "../src/testkit/fakefetch.ts";
import { lastPayload, makeTestWall } from "./wall-helpers.ts";

// ---------------------------------------------------------------------------
// construction gates
// ---------------------------------------------------------------------------

test("wall: WALL_VERSION exported and pinned to byok-arena-wall/1.0.0", () => {
  assert.equal(WALL_VERSION, "byok-arena-wall/1.0.0");
});

test("wall gate: the cell's dev default masterSecret is REFUSED — failure class insecure-master-secret", () => {
  for (const bad of [
    INSECURE_DEV_MASTER_SECRET,
    Buffer.from(INSECURE_DEV_MASTER_SECRET, "utf8"),
    "",
    undefined as unknown as string,
  ]) {
    assert.throws(
      () => createByokWall({ masterSecret: bad, fetchImpl: providerHappyFetch() }),
      (err: unknown) =>
        err instanceof WallRefusal && err.failureClass === "insecure-master-secret",
      `expected insecure-master-secret refusal for ${JSON.stringify(String(bad).slice(0, 20))}`,
    );
  }
});

test("wall vs cell: the CELL keeps its dev default for standalone runs — only the assembled face refuses it", () => {
  // additive-only proof: the wall did not take the standalone path away
  const cell = createCell({ fetchImpl: providerHappyFetch() }); // no masterSecret → dev default
  const stored = cell.vault.store("standalone-user", "anthropic", "sk-ant-standalone-0009");
  assert.equal(stored.stored, true);
});

test("wall construction: both gates probed, wall.construct carries version + catalog size", () => {
  const wall = makeTestWall();
  const secretGate = lastPayload(wall, "wall.masterSecret.gate");
  assert.equal(secretGate.accepted, true);
  assert.match(secretGate.branchNotTaken, /insecure-master-secret/);

  const absenceGate = lastPayload(wall, "wall.schemaAbsence.gate");
  assert.equal(absenceGate.schemaAbsent, true);
  assert.deepEqual(absenceGate.nodeEdgeKindEntries, []);
  assert.deepEqual(absenceGate.schemaLeads, []);

  const construct = lastPayload(wall, "wall.construct");
  assert.equal(construct.wallVersion, WALL_VERSION);
  assert.equal(construct.masterSecretAccepted, true);
  assert.equal(construct.schemaAbsent, true);
  assert.equal(construct.catalogSize, wall.pins.probeCatalog().length);
});

// ---------------------------------------------------------------------------
// pins quartet + additive-only catalog + wall.ts stays inside the membrane
// ---------------------------------------------------------------------------

test("pins quartet delegates live: tap() through wall.pins subscribes and unsubscribes", () => {
  const wall = makeTestWall();
  const seen: unknown[] = [];
  const untap = wall.pins.tap("wall.call", (e) => seen.push(e.payload));
  wall.estimateCost("anthropic", "claude-sonnet-5", { inputTokens: 1, outputTokens: 1 });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { method: "estimateCost", provider: "anthropic" });
  untap();
  wall.estimateCost("anthropic", "claude-sonnet-5", { inputTokens: 1, outputTokens: 1 });
  assert.equal(seen.length, 1, "after untap, no further deliveries");
});

test("additive only: the pre-wall catalog is fully preserved; wall.* entries only GROW it", () => {
  const wall = makeTestWall();
  const catalog = wall.pins.probeCatalog();
  const preWall = catalog.filter((e) => !e.probeId.startsWith("wall."));
  const wallEntries = catalog.filter((e) => e.probeId.startsWith("wall."));
  // Round WC-W4 (pre-GitHub remediation): the catalog GREW from 163 to 166
  // pre-wall pins with the addition of `adapter.<provider>.submit.maxTokens`
  // on each of the three adapters — the continuation leg now honors caller
  // maxTokens instead of silently substituting DEFAULT_MAX_TOKENS. Per the
  // wave rules probe catalogs never SHRINK (extend if needed); this test
  // asserts the new floor (166 pre-wall + 5 wall.* = 171 total).
  assert.equal(preWall.length, 166, "a wall never deletes a pin — the pre-wall catalog must stay ≥ 166 after WC-W4");
  assert.deepEqual(
    wallEntries.map((e) => e.probeId).sort(),
    ["wall.call", "wall.construct", "wall.masterSecret.gate", "wall.reject", "wall.schemaAbsence.gate"],
  );
  assert.equal(catalog.length, 171);
});

test("schema absence STAYS absent through the wall: no node/edge kinds, no schema.* leads, wall.ts imports in-cell relative only", () => {
  const wall = makeTestWall();
  for (const entry of wall.pins.probeCatalog()) {
    assert.notEqual(entry.kind, "node", `${entry.probeId} claims kind node in a schema-absent cell`);
    assert.notEqual(entry.kind, "edge", `${entry.probeId} claims kind edge in a schema-absent cell`);
    assert.ok(!entry.probeId.startsWith("schema."), `schema lead in a schema-absent cell: ${entry.probeId}`);
  }

  // the import-boundary property, re-asserted for the wall file specifically
  // (the cell-wide gate in import-boundary.test.ts already walks all of src/,
  // wall.ts included — this is the wall-focused restatement)
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
  const wallFile = path.join(srcRoot, "wall.ts");
  const text = readFileSync(wallFile, "utf8");
  const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g;
  let sawImports = 0;
  for (const match of text.matchAll(IMPORT_RE)) {
    sawImports++;
    const spec = match[1];
    assert.ok(spec.startsWith("."), `wall.ts must import in-cell relative modules only, found "${spec}"`);
    const resolved = path.resolve(path.dirname(wallFile), spec);
    assert.ok(resolved.startsWith(srcRoot), `wall.ts relative import escapes the cell: ${spec}`);
  }
  assert.ok(sawImports >= 3, "wall.ts has imports to check");
  assert.ok(!text.includes("packages/schema"), "wall.ts must not reference the canonical schema package — schema-absent BY DESIGN");
});
