# graph-model/schema

The cell's frozen schema artifacts plus their regeneration entry point. `schema.json` and `schema.md` are byte-gated constitution artifacts and `graph-schema.ts` a generated projection (all exempt from the doc audit; S0 byte-compares the generated pair every run and raises a codegen-drift GateFailure on mismatch). `schemagen.py` is the CLI wrapper over `src/schemagen_core.regenerate`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-graph-model.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `schemagen.py` | 24 | CLI wrapper: loads schema.json and writes both regenerated artifacts via src/schemagen_core.regenerate, printing what it generated. |
