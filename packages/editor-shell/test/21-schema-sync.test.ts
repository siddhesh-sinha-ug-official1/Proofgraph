/**
 * ASSEMBLY Phase 0 — verified-in-sync gate for the canonical schema swap.
 *
 * src/schema/schema.ts is a LOCAL COPY of the canonical schema surface
 * (packages/schema/gen/graph-schema.ts) because this cell's tsconfig
 * rootDir "." blocks a direct cross-package import (swap pattern (b)).
 * "One schema" is preserved by THIS file: it imports the REAL canonical
 * package at runtime (Node 24 type stripping handles the .ts files — the
 * compiled test does a dynamic import, so tsc's rootDir never binds) and
 * asserts constant-for-constant and behavior-for-behavior agreement, plus
 * the schema PIN. Any drift between the cell's copy and packages/schema
 * fails HERE, loudly, before it can ship a wrong verdict color.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as local from "../src/schema/schema.js";

// dist/test/21-schema-sync.test.js → cell root is two levels up; the canonical
// package is the sibling packages/schema.
const CELL_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCHEMA_PKG = join(CELL_ROOT, "..", "schema");

// The membrane's OWN record of the canonical PIN (assembly Phase 0). If
// packages/schema ever changes identity, this cell must fail fast here and be
// re-synced deliberately — never silently absorb a different schema.
const EXPECTED_PIN_VERSION = "v0";
const EXPECTED_PIN_HASH = "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c";

async function importCanonical(rel: string): Promise<any> {
  return import(pathToFileURL(join(SCHEMA_PKG, rel)).href);
}

test("assembly sync: local schema constants byte-agree with canonical gen/graph-schema.ts", async () => {
  const canon = await importCanonical("gen/graph-schema.ts");
  assert.equal(local.SCHEMA_VERSION, canon.SCHEMA_VERSION);
  assert.equal(local.SCHEMA_REVISION, canon.SCHEMA_REVISION);
  assert.deepEqual([...local.NODE_KINDS], [...canon.NODE_KINDS]);
  assert.deepEqual([...local.EDGE_KINDS], [...canon.EDGE_KINDS]);
  assert.deepEqual([...local.LANGS], [...canon.LANGS]);
  assert.deepEqual([...local.FILL_STATUSES], [...canon.FILL_STATUSES]);
  assert.deepEqual([...local.ORIGINS], [...canon.ORIGINS]);
  assert.deepEqual([...local.TIERS], [...canon.TIERS]);
  assert.equal(local.NODE_ID_PATTERN, canon.NODE_ID_PATTERN);
  assert.equal(local.EDGE_ID_PATTERN, canon.EDGE_ID_PATTERN);
  assert.equal(local.UNRESOLVED_PLACEHOLDER_PREFIX, canon.UNRESOLVED_PLACEHOLDER_PREFIX);
  // Ruling 4: canonical SPLIT order — none and green are separate entries.
  assert.deepEqual([...local.OUTLINE_WORST_ORDER], [...canon.OUTLINE_WORST_ORDER]);
  assert.deepEqual([...local.OUTLINE_WORST_ORDER],
    ["red", "amber", "blue", "definition", "lemma", "none", "green"]);
  // Ruling 1: worstTokenToStatus with definition→blue.
  assert.deepEqual({ ...local.WORST_TO_STATUS }, { ...canon.WORST_TO_STATUS });
  assert.equal(local.WORST_TO_STATUS.definition, "blue");
});

test("assembly sync: rankWorstToken/worstOfVerdict agree behaviorally with the canonical policy (ruling 4)", async () => {
  const canon = await importCanonical("gen/graph-schema.ts");
  for (const token of [...local.OUTLINE_WORST_ORDER, "none/green", "", "NONE", "sorry", "🟢"]) {
    assert.deepEqual(local.rankWorstToken(token), canon.rankWorstToken(token),
      `rankWorstToken(${JSON.stringify(token)}) drifted from canonical`);
  }
  // Unrecognized must rank WORST — never silently best (the old demo bug class).
  assert.deepEqual(local.rankWorstToken("sorry"), { rank: -1, recognized: false });
  const cases: string[][] = [
    ["green"],
    ["lemma", "blue"],
    ["definition", "lemma"],
    ["red", "amber", "green"],
    ["none", "green"],
    ["amber", "blue"],
    [],
    ["none/green"], // fused token BANNED from data → unrecognized → worst
    ["green", "mystery-token"],
    ["red", "none/green"],
  ];
  for (const worstOf of cases) {
    assert.deepEqual(local.worstOfVerdict(worstOf), canon.worstOfVerdict(worstOf),
      `worstOfVerdict(${JSON.stringify(worstOf)}) drifted from canonical`);
  }
  // Placeholder predicate (ruling 6).
  for (const id of ["unresolved:η_helper", "n_" + "0".repeat(16), "unresolved:", "x"]) {
    assert.equal(local.isUnresolvedPlaceholder(id), canon.isUnresolvedPlaceholder(id));
  }
});

test("assembly pin: checkPin passes against canonical schema.json and the recorded PIN values", async () => {
  const pin = await importCanonical("gen/pin.ts");
  // The membrane's recorded pin must equal the canonical package's pin consts.
  assert.equal(pin.PINNED_SCHEMA_VERSION, EXPECTED_PIN_VERSION);
  assert.equal(pin.PINNED_SCHEMA_HASH, EXPECTED_PIN_HASH);
  // Recompute the canonical hash of schema.json independently (node:crypto)
  // over the canonical serialization, and let checkPin arbitrate.
  const schemaObj = JSON.parse(readFileSync(join(SCHEMA_PKG, "schema.json"), "utf8"));
  const recomputed = createHash("sha256")
    .update(pin.canonicalJson(schemaObj), "utf8")
    .digest("hex");
  pin.checkPin(schemaObj.schemaVersion, recomputed); // must NOT throw
  assert.equal(recomputed, EXPECTED_PIN_HASH);
  // And drift fails FAST, named failure class.
  assert.throws(() => pin.checkPin("v1", EXPECTED_PIN_HASH), /schema-pin-mismatch/);
  assert.throws(() => pin.checkPin(EXPECTED_PIN_VERSION, "0".repeat(64)), /schema-pin-mismatch/);
});

test("assembly re-mint: every fixture node id is the REAL canonical mint (ruling 5)", async () => {
  const ids = await importCanonical("gen/ids.ts");
  const allNodes = JSON.parse(
    readFileSync(join(CELL_ROOT, "test", "fixtures", "schema-nodes.json"), "utf8"),
  ) as Record<string, local.SchemaNode[]>;
  const idPattern = new RegExp(local.NODE_ID_PATTERN);
  let checked = 0;
  for (const [fixture, nodes] of Object.entries(allNodes)) {
    for (const node of nodes) {
      assert.match(node.id, idPattern, `${fixture}: ${node.name} id is not canonical-shaped`);
      // Same derivation the generator uses: moduleName = basename sans extension.
      const moduleName = node.span.file.split("/").pop()!.replace(/\.[^.]+$/, "");
      const identity = ids.computeNodeIdentity(
        node.lang, node.kind, moduleName, node.name, node.span.file,
      );
      assert.equal(node.id, identity.nodeId,
        `${fixture}: ${node.kind} ${node.name} carries a non-canonical id (stale fixtures? run npm run gen:fixtures)`);
      // The canonical preimage is span-free and \x1f-delimited (ruling 5).
      assert.ok(identity.preimage.startsWith("node:v0"));
      checked += 1;
    }
  }
  assert.ok(checked >= 14, `unexpectedly few fixture nodes checked: ${checked}`);
});
