/**
 * Id-mint gates (split from schema-package.test.ts, SUB200): gen/ids.ts must
 * reproduce every golden vector from vectors.json byte-for-byte — the
 * cross-language id-mint agreement gate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { NODE_ID_PATTERN, EDGE_ID_PATTERN, isUnresolvedPlaceholder } from "../gen/graph-schema.ts";
import {
  US, NODE_DOMAIN_TAG, EDGE_DOMAIN_TAG, TRUNCATE,
  sha256Hex, computeNodeIdentity, computeEdgeIdentity, idsFromManifest,
} from "../gen/ids.ts";
import { schemaObj, vectors, type NodeVector, type EdgeVector } from "./context.ts";

test("sha256 provider sanity (node:crypto reachable)", () => {
  assert.equal(sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("id mint constants match schema.json idScheme", () => {
  assert.equal(US, schemaObj.idScheme.delimiter);
  assert.equal(TRUNCATE, schemaObj.idScheme.hashLength);
  assert.equal(NODE_DOMAIN_TAG, schemaObj.idScheme.node.domainTag);
  assert.equal(EDGE_DOMAIN_TAG, schemaObj.idScheme.edge.domainTag);
});

test("gen/ids.ts reproduces every node vector from vectors.json (cross-language gate)", () => {
  const nodeVectors = vectors.filter((v): v is NodeVector => v.type === "node");
  assert.ok(nodeVectors.length >= 3);
  for (const vec of nodeVectors) {
    const { lang, kind, moduleName, rawName, file } = vec.input;
    const identity = computeNodeIdentity(lang, kind, moduleName, rawName, file);
    assert.equal(identity.canonicalName, vec.expected.canonicalName);
    assert.equal(identity.path, vec.expected.path);
    assert.equal(identity.preimage, vec.expected.preimage);
    assert.equal(identity.nodeId, vec.expected.id);
    assert.match(identity.nodeId, new RegExp(NODE_ID_PATTERN));
  }
});

test("gen/ids.ts reproduces every edge vector from vectors.json (cross-language gate)", () => {
  const edgeVectors = vectors.filter((v): v is EdgeVector => v.type === "edge");
  assert.ok(edgeVectors.length >= 2);
  let sawPlaceholder = false;
  for (const vec of edgeVectors) {
    const identity = computeEdgeIdentity(vec.input.kind, vec.input.srcId, vec.input.dstId);
    assert.equal(identity.preimage, vec.expected.preimage);
    assert.equal(identity.edgeId, vec.expected.id);
    assert.match(identity.edgeId, new RegExp(EDGE_ID_PATTERN));
    if (isUnresolvedPlaceholder(vec.input.dstId)) sawPlaceholder = true;
  }
  assert.ok(sawPlaceholder, "unresolved-placeholder dst edge vector missing");
});

test("idsFromManifest mirrors ids.py (module + decls, sorted)", () => {
  const ids = idsFromManifest({
    module: { name: "sample", file: "fixtures/sample.py", lang: "python" },
    decls: [{ kind: "function", name: "A" }],
  });
  const moduleId = computeNodeIdentity("python", "module", "sample", "sample", "fixtures/sample.py").nodeId;
  const aId = computeNodeIdentity("python", "function", "sample", "A", "fixtures/sample.py").nodeId;
  assert.deepEqual(ids, [moduleId, aId].sort());
  // Frozen goldens from graph-model tests/context.py — the canonical mint IS Tree 1's.
  assert.equal(moduleId, "n_baeb074b4cfa2016");
  assert.equal(aId, "n_76287cc71e90c629");
});
