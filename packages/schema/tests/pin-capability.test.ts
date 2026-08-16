/**
 * PIN + capability-seam gates (split from schema-package.test.ts, SUB200):
 * canonical serialization, pinned schema identity, and the depth-tier ruling.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sha256Hex } from "../gen/ids.ts";
import {
  PINNED_SCHEMA_VERSION, PINNED_SCHEMA_REVISION, PINNED_SCHEMA_HASH,
  canonicalJson, checkPin,
} from "../gen/pin.ts";
import {
  CAPABILITY_VERSION, DEPTH_TIERS, DEPTH_ALLOWS_RESOLVED_EDGES,
  DEPTH_TO_MAX_PROVENANCE, HONEST_CEILINGS,
} from "../gen/capability_constants.ts";
import { PKG_ROOT, schemaObj, capabilityObj } from "./context.ts";

test("canonicalJson matches Python's sort_keys/compact/ensure_ascii=False form", () => {
  assert.equal(canonicalJson({ b: 1, a: [1, "ä", null, true] }),
    '{"a":[1,"ä",null,true],"b":1}');
  assert.equal(canonicalJson("\u001f"), '"\\u001f"');
});

test("PIN: pinned hash matches the recomputed canonical hash of schema.json", () => {
  const recomputed = sha256Hex(canonicalJson(schemaObj));
  assert.equal(recomputed, PINNED_SCHEMA_HASH);
  const pinText = readFileSync(join(PKG_ROOT, "PIN"), "utf8");
  const fields = new Map(pinText.trim().split("\n").map((line) => {
    const idx = line.indexOf(" ");
    return [line.slice(0, idx), line.slice(idx + 1)] as [string, string];
  }));
  assert.equal(fields.get("schemaVersion"), PINNED_SCHEMA_VERSION);
  assert.equal(fields.get("schemaHash"), PINNED_SCHEMA_HASH);
  assert.equal(PINNED_SCHEMA_VERSION, "v0");
  assert.equal(PINNED_SCHEMA_REVISION, "v0.1");
});

test("checkPin passes on the canonical pair and fails fast on drift", () => {
  checkPin(schemaObj.schemaVersion, sha256Hex(canonicalJson(schemaObj)));
  assert.throws(() => checkPin("v1", PINNED_SCHEMA_HASH), /schema-pin-mismatch/);
  const mutated = JSON.parse(JSON.stringify(schemaObj));
  mutated.$defs.Node.properties.kind.enum.push("macro");
  assert.throws(
    () => checkPin(mutated.schemaVersion, sha256Hex(canonicalJson(mutated))),
    /schema-pin-mismatch/);
});

test("capability constants match capability.json; ruling 2 recorded (S: false)", () => {
  assert.equal(CAPABILITY_VERSION, capabilityObj.capabilityVersion);
  assert.deepEqual([...DEPTH_TIERS], capabilityObj.depthTiers);
  assert.deepEqual(DEPTH_ALLOWS_RESOLVED_EDGES, capabilityObj.depthAllowsResolvedEdges);
  assert.deepEqual(DEPTH_TO_MAX_PROVENANCE, capabilityObj.depthToMaxProvenance);
  assert.deepEqual(HONEST_CEILINGS, capabilityObj.honestCeilings);
  assert.deepEqual(DEPTH_ALLOWS_RESOLVED_EDGES,
    { CT: true, S: false, G: false, P: false });
});
