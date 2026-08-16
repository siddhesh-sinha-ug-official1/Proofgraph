# editor-shell/src/map

S7 span index: `span-index.ts` builds TextGeometry and node bindings and serves the coordinate conversions; `geometry.ts` is the pure byte/line/column math under the D4 conventions; `build-nodes.ts` handles foreign-file partitioning, same-span conflicts, clamps and innermost lookup.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `span-index.ts` | 195 | S7 SpanIndex facade: builds TextGeometry + binds nodes at construction (build.input/build.index probes), then byteToPos (firehose + mismatch self-check), posToByte, lspPositionToByte, posToLsp, spanToRange, getById/allNodes, nodeAtByte (innermost), nodeAtPosition, snapshot. |
| `geometry.ts` | 194 | Pure byte/line/column math under the D4 conventions: encoding-aware byteLen/byteLenOfCodePoint (latin1=1/unit, utf-16=2/unit, utf-8 variable), buildLineIndex, byteToPosCore (+ mid-codepoint and round-trip desync evidence), posToByteInternal, lspPositionToByteCore (utf-8 byte-walk and utf-16 both clamped to line length), posToLspCore. |
| `build-nodes.ts` | 198 | Index build: partitions foreign-file nodes (multifile probe), detects identical-span conflicts (deterministic lexicographically-smallest winner, probed), clamps out-of-file spans loudly, binds spans to ranges via spanToRangeCore (skips the firehose, keeps the desync self-check), and innermostAtByte with the overlap.ambiguous decision. |
