# REPORT — SUB200 restructure (wave 2), area `acceptance/` (+ faultcheck + root runner)

Round: adversarial-round prep, wave 2. Mission: every non-exempt source file
in acceptance/ + the coverage round's runner files UNDER 200 lines, split by
cohesion behind facades, behavior-preserving.
Date: 2026-08-02. Result: **done — all files <=199 lines; run_demo FULL
11 PASS / 0 FAIL / 0 SKIP (91s), run_shell_demo 11 PASS (33s), faultcheck
(result row appended at the end).**

## What was split

| Old file (lines) | New modules (lines) |
| --- | --- |
| `acceptance/run_demo.py` (1650) | facade `run_demo.py` (199 — docstring alone is 100) + `acceptance/checks/`: `__init__.py` (23) `common.py` (171) `step1.py` (44) `a_unused.py` (31) `b_outline.py` (49) `c_h_ceiling.py` (125) `d_brushing.py` (55) `e_ai.py` (42) `f_trace.py` (105) `g_squiggle.py` (50) `i_green.py` (145) `j_unbacked.py` (93) `ui_servers.py` (132) `ui_specs.py` (146) `browser_step.py` (177) `suites.py` (52) `reporting.py` (181) |
| `acceptance/run_shell_demo.py` (317) | facade `run_shell_demo.py` (118) + `acceptance/shellchecks/`: `__init__.py` (11) `common.py` (74) `flow_fs.py` (55) `flow_analyze.py` (88) `flow_guards.py` (43) |
| `acceptance/headless/headless_ui.mjs` (583) | facade `headless_ui.mjs` (112) + `acceptance/headless/ui/`: `browser.mjs` (73) `cdp.mjs` (86) `facts.mjs` (90) `openfile.mjs` (68) `gutter.mjs` (64) `brush.mjs` (155) `ai.mjs` (44) |
| `acceptance/headless/squiggle_check.mjs` (296) | facade `squiggle_check.mjs` (151) + `acceptance/headless/squiggle/`: `stage.mjs` (77) `runner.mjs` (97) |
| `acceptance/headless/browser_shot.mjs` (272) | facade `browser_shot.mjs` (174) — now imports the SAME `ui/browser.mjs` + `ui/cdp.mjs` it originally donated (headless_ui had copied that scaffolding verbatim; the split de-duplicates it into the shared modules, byte-identical logic) |
| `faultcheck/run_faults.py` (361) | facade `run_faults.py` (145) + `faultcheck/faultlib/`: `__init__.py` (9) `harness.py` (130) `catalog.py` (113) |
| `run_all_suites.py` (167) | NOT split — already under the ceiling; verified 167 |

Split axes (per the wave-2 brief): run_demo = one module per §7 check family
(a/b/c+h/d/e/f/g/i/j) + step1-analyze + the browser step (specs / server
plumbing / orchestration) + reporting, with the shared check registry +
bootstrap in `checks/common.py`; run_shell_demo = the contract loop's three
cohesive stretches (fs flows / edit-analyze-revert / guards); headless_ui =
browser launch + CDP client (shared with browser_shot) + one module per
phase (facts, file-open, gutter, brush, ai); squiggle = staging vs.
transports; faultcheck = harness vs. fault catalog.

## Facade guarantees (zero external-churn)

Every runner keeps its path, CLI, flags, output format and exit codes:

- `python acceptance/run_demo.py [--skip-ui|--skip-browser] [--suites]` —
  same one command, same `[PASS]/[FAIL]/[SKIP]` lines, same
  ACCEPTANCE-REPORT.md / TRACE-full.json / evidence/*.json artifacts. All
  external references (run_all_suites.py, hub/test_hub.py docstrings,
  app/vitest.acceptance.config.ts, app/test-acceptance) invoke it by
  path/CLI only — no importer churn (verified by grep).
- `python acceptance/run_shell_demo.py` — same command, same 11 named checks
  in the same order.
- `node acceptance/headless/headless_ui.mjs --url ... --spec ...` — same
  invocation from `checks/ui_servers.py`, same evidence JSON last-line, same
  exit codes (0/2/3 incl. the typed `browser-tooling-missing` 3).
- `node acceptance/headless/squiggle_check.mjs` — same JSON stage lines, the
  last line is the same evidence object `checks/g_squiggle.py` asserts on.
- `node acceptance/headless/browser_shot.mjs --url ... [--ask] [--click-node ...]`
  — same manual tool, same flags, same evidence line (smoke-tested live:
  Edge headless launch → CDP → navigate → PNG written → facts → exit 0).
- `python faultcheck/run_faults.py [a c ...]` — same command, same per-fault
  narration + summary table, same dev filter.
- Python packages resolve from the runners' own directories (sys.path[0] =
  script dir), so `checks`/`shellchecks`/`faultlib` need no installation;
  the hub/vessels path prepends were checked for shadowing (no `checks`/
  `shellchecks`/`faultlib` modules exist there).

## Suites (measured live after the split)

| suite | result |
| --- | --- |
| `python acceptance/run_demo.py` (FULL, headless-UI default) | **11 PASS / 0 FAIL / 0 SKIP** in 91s — incl. ui-acceptance with 59 named page-checks green (moat/lean/ceiling), the §7(i) green trace and §7(j) doctored-green guard |
| `python acceptance/run_shell_demo.py` | **11 PASS / 0 FAIL** in 33s |
| `python faultcheck/run_faults.py` | (row appended at the end of this report) |

## Verification table — every file in the area (ceiling: <200)

| File | Lines |
| --- | --- |
| `acceptance/run_demo.py` (facade) | 199 |
| `acceptance/checks/__init__.py` | 23 |
| `acceptance/checks/common.py` | 171 |
| `acceptance/checks/step1.py` | 44 |
| `acceptance/checks/a_unused.py` | 31 |
| `acceptance/checks/b_outline.py` | 49 |
| `acceptance/checks/c_h_ceiling.py` | 125 |
| `acceptance/checks/d_brushing.py` | 55 |
| `acceptance/checks/e_ai.py` | 42 |
| `acceptance/checks/f_trace.py` | 105 |
| `acceptance/checks/g_squiggle.py` | 50 |
| `acceptance/checks/i_green.py` | 145 |
| `acceptance/checks/j_unbacked.py` | 93 |
| `acceptance/checks/ui_servers.py` | 132 |
| `acceptance/checks/ui_specs.py` | 146 |
| `acceptance/checks/browser_step.py` | 177 |
| `acceptance/checks/suites.py` | 52 |
| `acceptance/checks/reporting.py` | 181 |
| `acceptance/run_shell_demo.py` (facade) | 118 |
| `acceptance/shellchecks/__init__.py` | 11 |
| `acceptance/shellchecks/common.py` | 74 |
| `acceptance/shellchecks/flow_fs.py` | 55 |
| `acceptance/shellchecks/flow_analyze.py` | 88 |
| `acceptance/shellchecks/flow_guards.py` | 43 |
| `acceptance/headless/ai_check.mjs` | 72 |
| `acceptance/headless/headless_ui.mjs` (facade) | 112 |
| `acceptance/headless/ui/browser.mjs` | 73 |
| `acceptance/headless/ui/cdp.mjs` | 86 |
| `acceptance/headless/ui/facts.mjs` | 90 |
| `acceptance/headless/ui/openfile.mjs` | 68 |
| `acceptance/headless/ui/gutter.mjs` | 64 |
| `acceptance/headless/ui/brush.mjs` | 155 |
| `acceptance/headless/ui/ai.mjs` | 44 |
| `acceptance/headless/squiggle_check.mjs` (facade) | 151 |
| `acceptance/headless/squiggle/stage.mjs` | 77 |
| `acceptance/headless/squiggle/runner.mjs` | 97 |
| `acceptance/headless/browser_shot.mjs` (facade) | 174 |
| `faultcheck/run_faults.py` (facade) | 145 |
| `faultcheck/faultlib/__init__.py` | 9 |
| `faultcheck/faultlib/harness.py` | 130 |
| `faultcheck/faultlib/catalog.py` | 113 |
| `run_all_suites.py` (proofgraph root) | 167 (not split — already under) |

Exempt (documented reasons):

| Path | Reason |
| --- | --- |
| `acceptance/analysis-moat.json`, `analysis-lean.json`, `analysis-ceiling.json` | generated by run_demo step 1 every run (canonical analyze() bytes) |
| `acceptance/TRACE-full.json` | generated by checks f + i every run |
| `acceptance/ACCEPTANCE-REPORT.md` | generated by checks/reporting.py every run |
| `acceptance/evidence/*` | generated evidence (headless suite + UI pages + checks.json + vite log) |
| `acceptance/browser/*.png` | generated screenshots (manual browser_shot tool) |
| `acceptance/fixtures/moatpkg/`, `unused_hyp.lean`, `honest_ceiling.typ` | demo fixtures (all tiny anyway; never mutated — sha-asserted by the suites) |
| `acceptance/fixtures/real_py/`, `real_lean/` | VENDORED real-input fixtures (byte-verbatim, sha256-pinned in PROVENANCE.md, licenses alongside — REAL-INPUTS round; frozen by outerwall/test_real_inputs.py) |

## Notes / deviations (nothing silent)

1. **Cross-stream find, adapted in MY area (not a package fix): §7(j)'s
   schema load.** The pre-split runner file-loaded cell 3's
   `extractor/schema.py` standalone via `spec_from_file_location` ("stdlib-only
   module FILE-LOADED as data"). Wave-1's SUB200 split of structure-extractor
   made that file a FACADE with relative imports (`from .schema_ids import ...`),
   so the standalone load now raises `ImportError: attempted relative import
   with no known parent package` — reproduced on the PRE-split runner (the
   wave-2 baseline run crashed in check j BEFORE any of this split landed).
   Remedy (acceptance-side, documented in `checks/j_unbacked.py`): import
   `extractor.schema` THROUGH the package system (sys.path +=
   packages/structure-extractor) — the imported surface (SchemaNode + Span +
   validate()) and the assertion (`unbacked-green` raised on a green with
   `source=""`) are identical; verified standalone and in the full run
   (j PASSES). No package file was touched.
2. `run_demo.py` facade is 199 lines — under the 200 ceiling but above the
   135–150 comfort target, because its 100-line docstring (the §7 check
   catalog + CLI contract, user-facing muscle memory) was preserved verbatim
   per the no-comment-stripping rule; the code below it is ~85 lines of
   imports + main().
3. `browser_shot.mjs` de-dup: headless_ui.mjs had copied browser_shot's
   launch + CDP scaffolding verbatim; the split extracts ONE shared copy
   (`ui/browser.mjs`, `ui/cdp.mjs`) used by both. One stale doc line in
   browser_shot's header ("Spawned by run_demo.py once the 8477/8478/5199
   stack is up" — untrue since the HEADLESS-UI round demoted it to a manual
   tool) was updated to "run by hand once a hub + ai + vite stack is up";
   no behavior involved.
4. Pre-existing, unchanged: the stdlib hub's ConnectionResetError stderr
   noise during child tree-kill (declared harmless in the HEADLESS-UI round)
   still appears in run_demo output; counts unaffected.
5. Test counts: run_demo 11 named checks (same names, same order), 59 named
   page-checks inside ui-acceptance (moat 17 / lean 23 / ceiling 19 — same
   as the HEADLESS-UI round record); run_shell_demo 11 named checks (same
   names, same order); no assertion weakened, none removed.
---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 6 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: acceptance/checks/suites.py 52→59; faultcheck/run_faults.py 145→152; faultcheck/faultlib/__init__.py 9→10; faultcheck/faultlib/harness.py 130→141; faultcheck/faultlib/catalog.py 113→135; run_all_suites.py 167→169. All files still <= 199 (run_demo.py facade remains the 199 max). All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
