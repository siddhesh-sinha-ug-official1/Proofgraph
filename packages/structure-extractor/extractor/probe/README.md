# structure-extractor/extractor/probe

The cell's probe machinery: `bus.py` enforces catalogued-id + declared-kind emits with logicalClock ordering; `events.py` carries the datatypes and the one sanctioned redaction; `catalog.py` concatenates the four section modules in spec order into the 149-entry catalog (143 pre-wall + 6 wall).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-structure-extractor.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `__init__.py` | 23 | Probe package surface: re-exports the bus datatypes/errors and CATALOG, plus make_bus() returning a ProbeBus with the full catalog registered. |
| `bus.py` | 136 | ProbeBus: catalog registration with duplicate/kind checks, emit() enforcing catalogued-id + declared-kind with logicalClock ordering and secret redaction, live taps, filtered event queries, history/jsonl; StageTimer emits per-stage wall timing. |
| `events.py` | 96 | Probe datatypes: the PROBE_KINDS vocabulary, CELL_ID, typed catalog errors, the one sanctioned redaction (secret keys -> presence + last-4), CatalogEntry, and ProbeEvent with ref() causal ids and wallNanos stripping for determinism views. |
| `catalog.py` | 28 | Catalog aggregator: concatenates the four section modules in spec order into CATALOG; 149 entries = 143 pre-wall + 6 wall, zero duplicates (re-verified this audit). |
| `catalog_stages.py` | 80 | Catalog section (spec 6.0-6.2): 32 cross-cutting/ingest/T1 lead entries, aggregated in order by catalog.py. |
| `catalog_docks.py` | 102 | Catalog section (spec 6.3-6.5b): 41 entries — dock dispatch, the python dock, the lean dock G+dormant design entries, and the 10 additive CT-driver leads; dormant entries say so in their descriptions. |
| `catalog_docs_graph.py` | 115 | Catalog section (spec 6.6-6.9): 48 entries — latex/typst docks (dormant backends marked), S3 assemble incl. the two green-guard leads, and S4 T3. |
| `catalog_output_infra.py` | 69 | Catalog section (spec 6.10-6.14 + 7.8): 28 entries — S5 output, backend req/resp pairs (dormant ones marked), provenance/tier discipline, reason histogram, honest gaps, and the six wall leads. |
