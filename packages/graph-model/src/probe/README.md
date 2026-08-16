# graph-model/src/probe

The cell's probe machinery. `bus.py` enforces the cataloged-lead contract at emit time (uncataloged probeIds and kind mismatches are hard errors); `catalog.py` splices the frozen lead-section data from `leads_pipeline.py`/`leads_analysis.py`/`leads_wall.py` into the 116-entry catalog (104-entry frozen baseline + 12 additive wall leads).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-graph-model.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `__init__.py` | 7 | Re-exports the bus (ProbeBus, CatalogHoleError, redact_secrets) and catalog surface (CATALOG, CATALOG_BY_ID, CELL_ID, STAGES, BASELINE_CATALOG_SIZE). |
| `bus.py` | 105 | The uniform probe bus: emit() hard-rejects uncataloged probeIds and kind mismatches (CatalogHoleError), deepcopies+secret-redacts payloads (presence+last-4 for secret-shaped string values), stamps logicalClock (only ordering key) and wallNanos (separate field), chains causeId probeId@clock refs, delivers to taps; history/clock reset per run, taps survive. |
| `catalog.py` | 59 | Catalog aggregator: splices PIPELINE_LEADS + ANALYSIS_LEADS (80 semantic) with 24 generated stage-boundary entries into the frozen 104-entry baseline, then appends the 12 WALL_LEADS (116 total); asserts probeId uniqueness; exports CATALOG/CATALOG_BY_ID/BASELINE_CATALOG_SIZE/CELL_ID/STAGES. |
| `leads_pipeline.py` | 82 | Frozen catalog section data: the 35 build-pipeline leads (schema 10, ingest 7, node 9, edge 9) as (probeId, kind, payloadType, description) tuples, spliced verbatim into catalog.py in the frozen order; descriptions match the emitting stage code. |
| `leads_analysis.py` | 104 | Frozen catalog section data: the 45 analysis/output leads (fill 5, t3 16, project 11, roundtrip 8, harness 5); descriptions match the emitting stage code except the re-ingest phrasing (see codeFindings). |
| `leads_wall.py` | 44 | Frozen catalog section data: the 12 additive graph-model.wall.* leads consumed by src/wall (version, 3 ingest.verify.*, greenGuard, accepted/rejected, query, query.rejected, verdict, project, projection.refused); descriptions match the wall code. |
