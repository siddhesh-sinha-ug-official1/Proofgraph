# editor-shell/scripts

Build/run tooling: `run-tests.mjs` (deterministic runner over dist/test), `import-gate.mjs` (runs the S9 gate over the real src/ tree, exits 1 on failure), `gen-fixture-nodes.mjs` (Tree-1 stand-in; writes the byte-exact fixtures and metadata under test/fixtures/ using the sections in `fixture-gen/`).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `run-tests.mjs` | 26 | Deterministic runner: walks dist/test for .test.js files (optional substring filter), sorts, hands them to node --test, exits with its status. |
| `import-gate.mjs` | 45 | S9 gate runner: walks the real src/ tree, extracts imports, runs the compiled runImportGate over a null-wallClock ProbeBus, prints scan/violation/leak probes, exits 1 on failure. |
| `gen-fixture-nodes.mjs` | 67 | Fixture-generator entry (Tree-1 stand-in): runs the six per-fixture sections in the original order, then writes schema-nodes.json / fixture-meta.json / outline-fixture.json and prints a summary; ids come from the canonical mint (ruling 5). |
