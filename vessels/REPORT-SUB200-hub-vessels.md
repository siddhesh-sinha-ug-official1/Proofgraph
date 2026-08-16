# REPORT-SUB200 — area: hub/ + vessels/

Adversarial-round prep: every non-exempt source file in hub/ and vessels/
restructured to UNDER 200 lines, split by cohesion, BEHAVIOR-PRESERVING.
Facade pattern everywhere: the original module paths remain and re-export
the full public surface — external importers (outerwall, acceptance,
faultcheck, serve_app, app/ai) need zero changes, and every by-path suite
invocation (run_all_suites, run_demo, faultcheck) still works.

## Splits

| old file (lines) | new modules (lines) |
|---|---|
| hub/server.py (1194) | server.py 166 (facade: HubServer composition + render_graph_payload — kept here because faultcheck fault b anchors its injection on this method's text in hub/server.py; anchor verified unique) · server_core.py 121 · server_fs.py 187 · server_surfaces.py 175 · server_analyze.py 119 · server_ws.py 152 · server_lsp.py 97 · server_http.py 149 · server_http_get.py 160 · server_http_mut.py 93 |
| hub/pipeline.py (466) | pipeline.py 64 (facade) · pipeline_log.py 162 · pipeline_paths.py 174 · pipeline_run.py 146 (HUB_PROBE_CATALOG stays ONE shared dict object — lsp_backend's additive registrations still visible everywhere) |
| hub/lsp_backend.py (251) | lsp_backend.py 73 (facade, keeps the V2 seam docstring) · lsp_backend_capability.py 195 |
| hub/test_hub.py (1132) | test_hub.py 79 (aggregator, load_tests in original Test01..Test11 order; `python hub/test_hub.py` unchanged) · test_hub_base.py 152 (one shared stack, atexit stop) · test_hub_seam.py 178 · test_hub_query_verdict.py 153 · test_hub_pins.py 116 · test_hub_analyze.py 120 · test_hub_lsp.py 144 · test_hub_truth_analysis.py 141 · test_hub_fs_workspace.py 120 · test_hub_fs_io.py 181 · test_hub_fs_loop.py 118 |
| vessels/test_v3_extractor_to_model.py (576) | test_v3_extractor_to_model.py 59 (aggregator; run_all_suites + faultcheck path unchanged) · v3_seam_shared.py 93 (lazy shared Bundles) · test_v3_byte_identity.py 145 · test_v3_accounting.py 129 · test_v3_semantics.py 140 · test_v3_negatives.py 147 |
| vessels/test_v2_squiggle.mjs (484) | test_v2_squiggle.mjs 37 (same `node --test vessels/test_v2_squiggle.mjs` entry; ONE spawned hub/process — imported case modules register in original order) · v2_squiggle_env.mjs 164 (fixture + ctx + before/after) · v2_runner_protocol.mjs 47 · v2_squiggle_cases.mjs 183 · v2_squiggle_drop.mjs 115 |
| vessels/test_v1.py (331) | test_v1.py 61 (aggregator; test_z shutdown still last; LOUD npx skip preserved) · v1_seam_shared.py 137 (lazy shared feed + five extractions, atexit safety net) · test_v1_live_python.py 117 · test_v1_langs_lifecycle.py 135 |
| vessels/v1_capability_extractor.py (262) | v1_capability_extractor.py 75 (facade, full __all__) · v1_walls.py 65 · v1_feed.py 163 |
| vessels/v2_hub_runner.py (215) | v2_hub_runner.py 136 (entry point unchanged) · v2_hub_info.py 93 |

Untouched (already under 200): hub/serve_app.py 188, vessels/pathing.py 191,
vessels/serve_hub_v4.py 69.

## Suite results (end state)

- `python hub/test_hub.py` — Ran 44 tests, OK (1 skip: the documented
  Windows symlink-creation leg).  Count unchanged (44 before split).
- `python vessels/test_v1.py` — Ran 11 tests, OK.  Count unchanged.
- `python vessels/test_v3_extractor_to_model.py` — Ran 16 tests, OK.
  Count unchanged.
- `node --test vessels/test_v2_squiggle.mjs` — pass 4, fail 0 (live stack:
  spawned v2_hub_runner battery; measured tier CT, squiggle, drop,
  teardown/orphan sweep).  Count unchanged.

Byte-stability: packages/schema untouched by this area (no gen/golden
changed).  Probe catalogs: element-for-element identical —
HUB_PROBE_CATALOG moved as one dict object; no cell catalog touched.

## Hidden couplings honored

- faultcheck/run_faults.py fault b patches hub/server.py by exact text of
  render_graph_payload's tail and injects code using `json` +
  `hub_pipeline` at that module's scope — the method and both names stay
  in hub/server.py; anchor occurs exactly once (verified).
- faultcheck fault c + run_all_suites + acceptance/run_demo invoke
  hub/test_hub.py, vessels/test_v1.py, vessels/test_v3_extractor_to_model.py
  by path — all remain runnable aggregators with identical totals; the
  fault-c lead-in-edges refusal path re-verified against the shared bundles.
- acceptance/headless/squiggle_check.mjs and serve_app --lsp live reuse
  vessels/v2_hub_runner.py and hub/lsp_backend.py — surfaces unchanged.

## Concurrency note (rule 9)

Mid-refactor runs of the hub suite crossed fire with another agent's
in-flight capability-layer (cell 2) split (transient NameError in
capability/spine_proto.py, then a transiently degraded measured tier on
the outerwall analyze path).  Re-runs after that agent's tree settled are
green end-state.

## Verification table (wc -l, end state)

hub/: lsp_backend.py 73 · lsp_backend_capability.py 195 · pipeline.py 64 ·
pipeline_log.py 162 · pipeline_paths.py 174 · pipeline_run.py 146 ·
serve_app.py 188 · server.py 166 · server_analyze.py 119 ·
server_core.py 121 · server_fs.py 187 · server_http.py 149 ·
server_http_get.py 160 · server_http_mut.py 93 · server_lsp.py 97 ·
server_surfaces.py 175 · server_ws.py 152 · test_hub.py 79 ·
test_hub_analyze.py 120 · test_hub_base.py 152 · test_hub_fs_io.py 181 ·
test_hub_fs_loop.py 118 · test_hub_fs_workspace.py 120 ·
test_hub_lsp.py 144 · test_hub_pins.py 116 · test_hub_query_verdict.py 153 ·
test_hub_seam.py 178 · test_hub_truth_analysis.py 141

vessels/: pathing.py 191 · serve_hub_v4.py 69 · test_v1.py 61 ·
test_v1_langs_lifecycle.py 135 · test_v1_live_python.py 117 ·
test_v3_accounting.py 129 · test_v3_byte_identity.py 145 ·
test_v3_extractor_to_model.py 59 · test_v3_negatives.py 147 ·
test_v3_semantics.py 140 · v1_capability_extractor.py 75 · v1_feed.py 163 ·
v1_seam_shared.py 137 · v1_walls.py 65 · v2_hub_info.py 93 ·
v2_hub_runner.py 136 · v3_seam_shared.py 93 · test_v2_squiggle.mjs 37 ·
v2_runner_protocol.mjs 47 · v2_squiggle_cases.mjs 183 ·
v2_squiggle_drop.mjs 115 · v2_squiggle_env.mjs 164

Every source file ≤ 195 lines; the 200 ceiling holds with ZERO exemptions
in this area.  Non-source in area (not counted): README/REPORT-*.md docs,
ASSEMBLY-CHANGES.md logs, vessels/TRACE-node.json (recorded evidence
artifact), vessels/fixtures_v2/ (test fixture inputs), __pycache__.

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 4 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: hub/serve_app.py 188→191; hub/test_hub.py 79→80; vessels/serve_hub_v4.py 69→71; vessels/v2_squiggle_drop.mjs 115→116. The '<= 195' bound still holds (max 195, lsp_backend_capability.py). render_graph_payload still defined exactly once in hub/server.py (fault-b anchor). All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
