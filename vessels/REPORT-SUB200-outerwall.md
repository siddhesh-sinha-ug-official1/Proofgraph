# REPORT-SUB200 — area: outerwall/

Adversarial-round prep, wave 2: every non-exempt source file in outerwall/
restructured to UNDER 200 lines, split by cohesion, BEHAVIOR-PRESERVING.
Facade pattern everywhere: the original module paths remain and re-export
the full public surface — external importers (hub/server_analyze.py's
`from outerwall.analyze import analyze_session`, hub/test_hub_fs_loop.py,
acceptance/run_demo.py + run_shell_demo.py's `import outerwall` /
`from outerwall import analyze_session, system_pins`, faultcheck) need zero
changes, and every by-path suite invocation (run_all_suites, run_demo
--full, faultcheck fault d) still works.

## Splits

| old file (lines) | new modules (lines) |
|---|---|
| `__init__.py` (257) | `__init__.py` 67 (facade: docstring + full re-export incl. the path constants siblings pull via `from . import` — bottom-up init order kept) · wallconst.py 21 (version/cellId/paths/schema pin) · errors.py 46 (named failure classes) · probelog.py 96 (OUTERWALL_PROBE_CATALOG + OuterLog — ONE dict object, moved whole) · loaders.py 63 (schema loaders + ensure_assembly_paths + json_scrub, memoization preserved) |
| analyze.py (391) | analyze.py 67 (facade; full original docstring; `from outerwall.analyze import analyze, analyze_session` unchanged — the hub seam) · analyze_roots.py 153 (root normalization + staging + root re-declaration, verbatim) · analyze_capability.py 69 (feed open/snapshot/provenance — same probes, same order) · analyze_run.py 159 (session assembly, verbatim incl. the finally-block feed shutdown) |
| system_pins.py (332) | system_pins.py 125 (facade: SystemPins class + factory + probeCatalog/tap; TRACE_SEED_PATH/_canon re-exported) · pins_streams.py 115 (StreamsMixin: bounds + dump/history) · pins_trace.py 128 (TraceMixin: the V4 trace, verbatim) |
| test_outerwall.py (819) | test_outerwall.py 71 (AGGREGATOR — same `python outerwall/test_outerwall.py` entry, load_tests in the original Test01..Test08 order, 41 tests) · ow_test_shared.py 96 (LAZY memoized sessions MOAT/RICH/LEAN/LEANCT/CEILING/XYZ + helpers — each world built exactly once per process, same total work as the old setUpModule; split modules also run standalone building only what they need) · test_outerwall_moat.py 178 · test_outerwall_rich.py 105 · test_outerwall_lean.py 125 · test_outerwall_lean_rings.py 114 · test_outerwall_ceiling.py 97 · test_outerwall_ruling8.py 106 · test_outerwall_pins.py 135 |
| test_real_inputs.py (438) | test_real_inputs.py 81 (AGGREGATOR — same path entry, 21 tests) · ow_real_shared.py 111 (SHA pins + lazy sessions incl. the second INDEPENDENT byte-compare runs) · test_real_inputs_py.py 139 (Test00 + Test01) · test_real_inputs_lean.py 110 · test_real_inputs_lean_semantics.py 154 |

Untouched (already under 200): gap.py 150, outline.py 185, provenance.py
144.  provenance.py is ALSO deliberately untouched because
faultcheck/run_faults.py fault (d) anchors its injection on this file's
exact text (the `"tier": p.get("tier"),` block) — anchor intact, and the
fault-d command path `python outerwall/test_outerwall.py` remains the
discovering aggregator.

Test regrouping (documented, count-preserving): the 8-test
Test03LeanVerdictArrival split as Test03LeanVerdictArrival (4 arrival
facts) + Test03bLeanRingsAndGuards (4: sorry/rings/ceiling/doctored-green);
the 12-test Test02RealLeanToolchainSource split as
Test02RealLeanToolchainSource (5: identity/shape/attestation) +
Test03RealLeanSemantics (7: collision/ruling8/guard/ceilings/provenance).
Every test METHOD is verbatim (names, assertions, comments); totals 41 and
21 unchanged; no assertion weakened.

## Suite results (end state)

- `python outerwall/test_outerwall.py` — Ran 41 tests, OK (76.6s).
  Count unchanged (41 before split; baseline re-measured green this
  session at 80.8s pre-split).
- `python outerwall/test_real_inputs.py` — Ran 21 tests, OK — measured
  THREE times post-split (89.3s / 91.3s / 94.3s), all green.  Count
  unchanged.
- `python hub/test_hub.py` (spot-run: the hub->outerwall seam) — Ran 44
  tests, OK (skipped=1: the documented Windows symlink-privilege env
  skip), 24.1s.  Seam intact.

## Hidden couplings honored

- faultcheck fault (d) patches outerwall/provenance.py by exact text and
  runs `python outerwall/test_outerwall.py` — file untouched, aggregator
  path preserved, provenance-hole still build-failing on the same code.
- hub/server_analyze.py lazily imports `from outerwall.analyze import
  analyze_session` (dependency direction hub -> outerwall; hub is NOT this
  area and was not touched) — analyze.py stays that module path with that
  name (import verified live).
- Siblings outline.py/gap.py/provenance.py import `from . import OuterLog,
  ...` — the package facade defines every one of those names BEFORE its
  bottom `from .analyze import ...`, so package init stays bottom-up with
  no cycles (wallconst/errors/probelog/loaders import only each other).
- OUTERWALL_PROBE_CATALOG remains one dict object; no probe added or
  removed — a probe API never shrinks.  system_pins.tap() still resolves
  ownership via `from . import OUTERWALL_PROBE_CATALOG` at call time.

## Concurrency note (rule 9)

Wave-1 was still concurrent in packages/editor-shell (TS only); no package
path this area imports changed underneath the runs, and no package was
touched by this stream.

## Verification table (wc -l, end state)

outerwall/: `__init__.py` 67 · analyze.py 67 · analyze_capability.py 69 ·
analyze_roots.py 153 · analyze_run.py 159 · errors.py 46 · gap.py 150 ·
loaders.py 63 · outline.py 185 · ow_real_shared.py 111 ·
ow_test_shared.py 96 · pins_streams.py 115 · pins_trace.py 128 ·
probelog.py 96 · provenance.py 144 · system_pins.py 125 ·
test_outerwall.py 71 · test_outerwall_ceiling.py 97 ·
test_outerwall_lean.py 125 · test_outerwall_lean_rings.py 114 ·
test_outerwall_moat.py 178 · test_outerwall_pins.py 135 ·
test_outerwall_rich.py 105 · test_outerwall_ruling8.py 106 ·
test_real_inputs.py 81 · test_real_inputs_lean.py 110 ·
test_real_inputs_lean_semantics.py 154 · test_real_inputs_py.py 139 ·
wallconst.py 21

Every source file <= 185 lines; the 200 ceiling holds with ZERO exemptions
in this area.  Non-source in area (not counted): __pycache__.

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 4 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: probelog.py 96→97; provenance.py 144→147; system_pins.py 125→129; test_outerwall_pins.py 135→138. The '<= 185' bound still holds (max 185, outline.py). The fault-(d) injection anchor still occurs exactly once in provenance.py. All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
