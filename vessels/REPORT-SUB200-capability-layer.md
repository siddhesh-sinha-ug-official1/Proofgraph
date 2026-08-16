# REPORT-SUB200 — packages/capability-layer

Adversarial-round prep: every source file in the area restructured to land
UNDER 200 lines (hard ceiling), split by cohesion, BEHAVIOR-PRESERVING ONLY.
Every original module path remains as a facade re-exporting its full public
surface — zero changes required in any other area, test, cell, or the hub.

## Splits (old file → new modules)

| Old (lines) | New modules (lines) |
| --- | --- |
| capability/probe.py (619) | probe.py 63 (facade: `_Battery` assembly + `run()`), probe_battery.py 115, probe_p0_p2.py 154, probe_p3_p5.py 160, probe_p6_p11.py 178 — probe families P0–P2 / P3–P5 / P6–P11 as mixins over the battery base; injection + position helpers travel with their families. |
| capability/shim/ybg_lsp.py (618) | ybg_lsp.py 104 (REMAINS the spawned entry — spine.shim_argv() spawns it by file path; standalone it adds the layer root to sys.path and imports siblings package-qualified), ybg_state.py 152 (modes/env/STATE/framing/probe/paths/encoding), ybg_ybc.py 150 (ybc plumbing + diagnostics), ybg_handlers.py 163 (initialize/hover/def/refs), ybg_symbols.py 110 (rename/documentSymbol/completion). Verified standalone from a foreign cwd: initialize round-trip green, exit 0. |
| capability/spine.py (530) | spine.py 54 (facade: `LspClient` assembly + `wire()`), spine_wire.py 97, spine_client.py 119, spine_msgs.py 161, spine_proto.py 154. |
| capability/probes.py (373) | probes.py 26 (facade/aggregator), probes_bus.py 149, probes_catalog_ae.py 119 (stages A–E), probes_catalog_fj.py 105 (stages F–J). Catalog verified ELEMENT-FOR-ELEMENT identical (json-equal, 89 entries; 92 with the wall's three). |
| wall.py (352) | wall.py 111 (facade: docstring/imports/PIN constants/_RUN_LOCK/__all__) + sections exec'd into the wall namespace in original order: wall_refusals.py 74, wall_pin.py 80, wall_face.py 122. All three wall loading modes preserved (module import / vessels.pathing.load_wall importlib-by-file / tests' file-read+exec): one namespace, fresh _RUN_LOCK per load, module __doc__ intact (section headers are comments, not docstrings). |
| capability/capability.py (306) | capability.py 165 (facade: the A→J pipeline), capability_config.py 118, capability_state.py 45 (Capability + _LAST + dump/history; same _LAST dict object re-exported — the wall's `_cap_mod._LAST` access unchanged). |
| testbed/mock_ybc.py (300) | mock_ybc.py 135 (REMAINS the spawned entry for config ybc_argv), mock_ybc_lang.py 101, mock_ybc_query.py 85. |
| capability/fixtures.py (294) | fixtures.py 36 (facade), fixtures_profiles.py 100, fixtures_discovery.py 170. Pure data move. |
| capability/floor/treesitter.py (291) | treesitter.py 117 (facade: FloorHandle/symbols_of/build), ts_runtime.py 58, ts_grammars.py 132. |
| tests/test_15_wall_conformance.py (284) | test_15_wall_conformance.py 109 (statics) + test_15b_wall_runs.py 184 (CT + fake-green) + tests/wall_common.py 28 (shared exec-loader; one shared wall ns as before). 23 tests → 23. |
| tests/test_17_lean_profile.py (265) | test_17_lean_profile.py 173 (gates a–f) + test_17b_lean_shutdown.py 47 (z orphan sweep, still last in discovery order) + tests/lean_common.py 62 (one shared live lean run + LOUD lake skip). 7 tests → 7. |

## Caution items verified

- importgate ALLOWED lists: byte-untouched. New intra-package imports are
  relative or root `capability` (the declared internal root); gate 01 green.
- Probe payload/order byte-stability: gate 13 reproducibility green; the
  probe catalog is json-identical to the pre-split snapshot; no emit site,
  payload, or ordering was edited — code was moved, not changed.
- Spawn entries kept working: the shim by-path spawn (shim_argv) and the
  mock-ybc by-path spawn (ybc_argv) both verified.
- packages/schema untouched (no schemagen impact); no goldens touched.

## Semantic changes / bugs noticed

- None made. No bug found that required deferral.
- Environmental note (pre-existing, not introduced): gate 17b's orphan sweep
  diffs system-wide lean.exe/lake.exe PID sets before/after; a CONCURRENT
  lean-spawning run on the machine can cross-fire it (observed once during
  the pre-restructure baseline while foreign lean/lake processes were live;
  the identical test passed pre- and post-restructure in a clean window).

## Verification table (every .py in the area; ceiling <= 200)

capability/__init__.py 11; capability.py 165; capability_config.py 118;
capability_state.py 45; discovery.py 130; fixtures.py 36;
fixtures_discovery.py 170; fixtures_profiles.py 100; floor/__init__.py 0;
floor/treesitter.py 117; floor/ts_grammars.py 132; floor/ts_runtime.py 58;
gate.py 87; handle.py 47; importgate.py 82; libinventory.py 76; probe.py 63;
probe_battery.py 115; probe_p0_p2.py 154; probe_p3_p5.py 160;
probe_p6_p11.py 178; probes.py 26; probes_bus.py 149;
probes_catalog_ae.py 119; probes_catalog_fj.py 105; schema.py 67;
scip.py 114; score.py 127; shim/__init__.py 0; shim/ybg_handlers.py 163;
shim/ybg_lsp.py 104; shim/ybg_state.py 152; shim/ybg_symbols.py 110;
shim/ybg_ybc.py 150; spine.py 54; spine_client.py 119; spine_msgs.py 161;
spine_proto.py 154; spine_wire.py 97; tree.py 103; tests/__init__.py 0;
tests/common.py 93; tests/lean_common.py 62; tests/wall_common.py 28;
tests/test_01 42; test_02 93; test_03 50; test_04 119; test_05 111;
test_06 130; test_07 47; test_08 36; test_09 123; test_10 100; test_11 39;
test_12 112; test_13_reproducibility 61; test_13_schema_sync 177;
test_14 142; test_15 109; test_15b 184; test_16 198; test_17 173;
test_17b 47; testbed/mock_ybc.py 135; testbed/mock_ybc_lang.py 101;
testbed/mock_ybc_query.py 85; testbed/python_repo/lib.py 15;
testbed/python_repo/main.py 18; testbed/python_repo/util.py 5;
wall.py 111; wall_face.py 122; wall_pin.py 80; wall_refusals.py 74.

Exemptions relied on: none in this area (no generated artifacts, goldens, or
proven Lean drivers live here; testbed repo fixtures — *.ybg/*.awk/*.lean
sources and the lean_repo .lake build outputs — are real-input fixtures, not
Python/TS source, and were not touched).

## Suite

`python -m pytest capability/tests -q` → 131 collected (unchanged from the
131 baseline; test files split, count preserved). Full post-restructure run
incl. live pyright + lean batteries: **131 passed in 46.49s**, Windows /
Python 3.12.

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 10 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: capability/discovery.py 130→131; capability/floor/treesitter.py 117→119; capability/gate.py 87→88; capability/handle.py 47→50; capability/probes_catalog_ae.py 119→124; capability/probes_catalog_fj.py 105→108; capability/shim/ybg_lsp.py 104→105; capability/spine_wire.py 97→99; capability/tree.py 103→105; capability/tests/test_14_walking_skeleton.py 142→143. Area max is still 198 (test_16). Probe catalog re-imported live: 89 entries. All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
