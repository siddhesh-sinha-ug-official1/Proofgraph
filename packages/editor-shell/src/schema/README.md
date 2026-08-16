# editor-shell/src/schema

Verified-in-sync copies of the canonical schema artifacts: `schema.ts` mirrors `packages/schema/gen/graph-schema.ts` and `pin.ts` mirrors `gen/pin.ts` (checkPin is the schema-pin guard); agreement with the canonical package is enforced at runtime by tests 21/22.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `schema.ts` | 114 | Verified-in-sync copy of packages/schema/gen/graph-schema.ts (pattern b): enum arrays, SchemaNode/SchemaEdge types, OUTLINE_WORST_ORDER (split spelling), WORST_TO_STATUS (definition->blue), rankWorstToken/worstOfVerdict (unrecognized ranks worst); byte-agreement enforced at runtime by test 21. |
| `pin.ts` | 48 | Verified-in-sync copy of packages/schema/gen/pin.ts: PINNED_SCHEMA_VERSION/REVISION/HASH consts, canonicalJson (Python sort_keys-equivalent serializer), checkPin throwing failure-class=schema-pin-mismatch; sync enforced by test 22 against the real canonical module. |
