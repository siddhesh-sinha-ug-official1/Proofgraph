# editor-shell/src/gate

S9 import gate: pure gate logic checking externals against the DECLARED_DEPS allow-list and Monaco packages against `src/mount/monaco/`; fed synthetic files by tests and the real tree by `scripts/import-gate.mjs`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `import-gate.ts` | 133 | S9 gate logic: DECLARED_DEPS allow-list + MONACO_ONLY_PACKAGES; runImportGate checks externals against the allow-list and Monaco packages against src/mount/monaco/, emitting scan/violation/leak probes; extractImports pulls static/dynamic/re-export/require specifiers via regex. Pure - fed synthetic files by tests, the real tree by scripts/import-gate.mjs. |
