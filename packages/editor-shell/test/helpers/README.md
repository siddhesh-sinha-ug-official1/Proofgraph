# editor-shell/test/helpers

Shared payload shapes and small factories for the test files: buffer/diagnostics/selection/green-guard payloads, catalog constants, the stub-server behaviors builder, the synthetic SchemaNode factory, and the wall-conformance harness.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `buffer-payloads.ts` | 20 | Shared fixture name (whitespace.py) + RoundtripPayload/ClassifyPayload shapes for the 01/01b buffer tests. |
| `catalog-consts.ts` | 25 | CONTRACT_KINDS (the 11 probe kinds) and EXPECTED_FIREHOSE (the 10 contract firehose lead ids) for the 19/19b catalog tests. |
| `diag-payloads.ts` | 31 | LspRange/MonacoRange/MapSpanPayload/MarkerSetPayload shapes for the 02/02b diagnostics tests. |
| `green-guard.ts` | 46 | Green-guard payload shapes + paintsFor (asserting gutter paints exist for a node) for the 04/04b tests. |
| `select-payloads.ts` | 32 | Brushing probe payload shapes for the 03/03b tests. |
| `server-behaviors.ts` | 18 | behaviors() builds a full StubServerConfig behaviors object from a partial (the config type is not deep-partial). |
| `synthetic-node.ts` | 21 | syntheticNode factory: a complete SchemaNode with overridable fields for regression tests. |
| `wall-harness.ts` | 90 | Wall-conformance harness: mountWall builds a fully wired wall over the stub tier, pin readers (eventsOf/payloadsOf/lastPayload through wall.pins ONLY), importCanonical for the real packages/schema, lastGutterByNode. |
