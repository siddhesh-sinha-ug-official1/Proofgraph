# graph-model/src

The GraphModelCell implementation. `cell.py` orchestrates the importgate plus the 8 stages in `stages/` over the probe bus in `probe/`; `ids.py`, `validate.py` and `schema_tools.py` are sync-gated against `packages/schema`; `schemagen_core.py` regenerates the two schema artifacts for S0's byte-compare; `t3.py` wraps the two graph libraries; the Phase-1 wall lives in `wall/` and is re-exported at the frozen path by `../wall.py`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-graph-model.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `__init__.py` | 3 | Package export of GraphModelCell only. |
| `cell.py` | 141 | The cell orchestrator: run() resets the bus, derives a deterministic runId from the input sha, runs the importgate BEFORE the 8 stages, wraps every stage in __in/__out/__timing probes, converts stage exceptions to probed harness.error (GateFailure re-raised, else CellError), and always emits clock+run.end; also the probeCatalog/history/tap/dump quartet. |
| `errors.py` | 24 | Two exception types: CellError (stage-boundary wrapper, probed before raise by cell._run_stage) and GateFailure (constitution gates, message prefixed failure-class=<name>); every class named in the docstring is raised somewhere in stages s0/s2/s4/s5/s6. |
| `ids.py` | 93 | The canonical content-addressed mint: sha256 hex truncated to 16, US(0x1f)-joined domain-tagged preimages (node:v0 / edge:v0); node identity from (lang, kind, canonicalName, file, structural path) — byte offsets deliberately excluded so ids survive reformatting; ids_from_manifest is the pure (manifest, logical-file) re-ingest used by S6/S7. Sync-gated (functional-segment equality + 8 golden vectors) against packages/schema/ids.py — untouched. |
| `importgate.py` | 67 | Static AST import-boundary gate over src/**/*.py + schema/schemagen.py: whitelist {stdlib, networkx, rustworkx, own(src/schemagen)}; relative imports count as own; returns the decision payload {declaredDeps, observedImports, violations, pass}; extra_files lets the self-test inject a violation. |
| `schema_tools.py` | 39 | Schema identity helpers: canonical JSON serialization, schemaHash over it, kind extractors, and check_pin which raises SchemaPinMismatch on any (version, hash) drift including same-version content drift. Sync-gated against packages/schema/schema_tools.py — untouched. |
| `schemagen_core.py` | 181 | Codegen from the parsed schema.json only: generate_ts (TypeScript types with enums/patterns pulled from the JSON) and generate_md (human spec; worst-order/outline-policy/worstTokenToStatus DERIVED from the v0.1 amendment data, with a pre-amendment fallback string); regenerate() returns both artifacts for S0's byte-compare gate. |
| `t3.py` | 77 | Library-call-only graph properties: builds rustworkx PyDiGraph and networkx DiGraph from (universe ids, resolved edges), wraps descendants/SCC/condensation-is-DAG, normalizes outputs to sorted id lists; carries the BLIND_SPOTS and SOUNDNESS_NOTE constants every T3 result embeds. |
| `validate.py` | 95 | Stdlib-only validator for the JSON-Schema subset schema.json uses (type/enum/const/pattern with $-to-\Z anchor hardening/required/additionalProperties/items/$ref) plus the leads-segregation invariant (resolved=false never in edges[], resolved=true never in leads[]); returns (conforms, full untruncated error list). Byte-identical to packages/schema/validate.py (sync test) — untouched. |
