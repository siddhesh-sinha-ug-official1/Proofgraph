/**
 * Synthetic SchemaNode factory for regression tests (SUB200 restructure:
 * split from 20-review-regressions.test.ts, verbatim).
 */

import type { SchemaNode } from "../../src/schema/schema.js";

export function syntheticNode(overrides: Partial<SchemaNode> & { id: string }): SchemaNode {
  return {
    kind: "function",
    lang: "python",
    name: overrides.id,
    signature: null,
    span: { file: "file:///fixtures/clean.py", byteStart: 0, byteEnd: 10 },
    fill: { status: "green", source: "stub verdict" },
    outline: null,
    origin: "checked",
    provenance: { tier: "T1", extractor: "tree1-stub", resolved: true },
    ...overrides,
  } as SchemaNode;
}
