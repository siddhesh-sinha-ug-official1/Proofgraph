# graph-model/src/stages

The 8 pipeline stages the cell iterates in `PIPELINE` order: S0 schema freeze, S1 manifest ingest, S2 node build, S3 edge build, S4 honest-fill ceiling, S5 T3 graph properties, S6 the three projections, S7 the C1 roundtrip gate. Stage exceptions are wrapped and probed by `../cell.py`.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-graph-model.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `__init__.py` | 14 | PIPELINE: the ordered (bus stage name, module) list of the 8 stages the cell iterates. |
| `s0_schema.py` | 114 | Schema freeze: loads schema.json, regenerates ts+md (bootstrap-writes if absent, byte-compares if present -> codegen-drift GateFailure), probes all three artifacts with hashes, parses kinds out of ts and md and cross-checks against the JSON (schema-drift on disagreement, diff names the drifted artifact), commits the freeze into ctx. |
| `s1_ingest.py` | 108 | Ingest of hand-written manifest records (not a parser): reads source bytes, declared roots, decl/ref/trivia records (logical file identity from the manifest, enabling reflowed presentations of the same file), runs the decl+trivia tiling precheck over [0,byteLen) — probed but non-halting (S7 is the judging gate) — and stores everything in ctx. |
| `s2_node.py` | 97 | Node build: for module + each decl computes the canonical identity via ids.py, probes canonicalName/normalizedSpan/id inputs/preimage/hash, emits schema-conformant Nodes with HONEST_FILL unknown, outline null, origin given(module)/assumed(decl), T1 skeleton provenance; duplicate id -> probed collision decision then id-collision GateFailure; builds the byId/byName tables S3 resolves against. |
| `s3_edge.py` | 86 | Edge build: resolves each ref against the module-qualified name table; hit -> resolved Edge (resolver skeleton.nameTable), miss -> lead with dstId unresolved:<name> and empty resolver, src-not-a-node -> probed edge.rejected and skipped; ids minted via compute_edge_identity; splits resolvedEdges/unresolvedLeads for S5/S6. |
| `s4_fill.py` | 63 | The honest ceiling enforced in code: probes fill/origin/greenGuard/outline per node, counts statuses, and raises fake-green if any node is green, deviates from HONEST_FILL, or claims origin=checked (no compiler in Tree 1); green_guard() is the reusable policy the wall's ingest also calls. |
| `s5_t3.py` | 120 | T3: reachability-from-roots over decl nodes only (module container excluded) using resolved edges only; rustworkx primary with networkx full cross-check (reachable/unused symmetric diff -> t3-library-disagreement), SCC partitions must match, condensation must be a DAG; probes every construction/output plus the null caps lead; builds the T3Result with blindSpots+soundnessNote inline. |
| `s6_project.py` | 127 | Three projections with one id set: text (ordered decl+trivia tiles reprinting the source bytes, span->nodeId map), graph ({schemaVersion,nodes,edges,leads} — validated, graphjson-nonconformant on failure), flat (rows labeling T3-derived reachable/unused, None for the container, never written into fill); recovers ids from all three (text via the pure manifest re-ingest) and raises projection-id-drift on any diff. |
| `s7_roundtrip.py` | 98 | C1 fixpoint gate: compares source vs reprint by length, sha256, first-divergence locator (index+bytes+context) and the full untruncated byte diff; re-derives ids via the pure manifest re-ingest and checks equality with the built nodes; second reprint must be identical (idempotence); verdict probe carries pass or c1-fixpoint-broken. |
