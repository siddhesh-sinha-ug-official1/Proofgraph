# capability-layer/capability/floor

Stage F grammar floor: `ts_runtime.py` (stub tree-sitter runtime shapes), `ts_grammars.py` (the two stub line-grammars and the real-runtime swap seam), `treesitter.py` (the build() facade; no floor for .py/.lean, and gotoHeuristic matches are always resolved:False).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-capability-layer.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `__init__.py` | 0 | Empty package marker. |
| `treesitter.py` | 119 | Stage F facade: FloorHandle (parse + nodeTypes), symbols_of regex walk, and build() which loads a stub grammar by fileExt (None for .py/.lean = no floor), parses the first repo file, and emits nodeTypes/highlights/parse/symbol/gotoHeuristic(resolved:False, every match)/tier leads. |
| `ts_runtime.py` | 58 | Stub runtime shapes: TSNode/Tree with utf-8 byte spans and walk(), the _tok token builder, and _LineGrammar's per-line classify-parse. |
| `ts_grammars.py` | 132 | The two stub line-grammars (ybg: let/fn/import/call/identifier with ERROR fallback; awk: function/rule/statement catch-all) plus StubTreeSitterRuntime mapping .ybg/.awk to them (the real-runtime swap seam). |
