# acceptance/checks — run_demo.py's check families

The 16 modules `run_demo.py` imports (mapped by `__init__.py`): the shared
import-time bootstrap and CHECKS/BOUNDS/CLASSES registries, step-1 analyze,
the named checks a–j, the step-3 headless-UI plumbing/specs/driver, the
recorded-suites table and the report writer. Every check registers
PASS/FAIL rows in the shared registries; run_demo prints totals and exits
nonzero on any FAIL (11 PASS / 0 FAIL / 0 SKIP measured 2026-08-03,
`audit/AUDIT-acceptance.json`).

## Files (verified)

Verified purposes from `audit/AUDIT-acceptance.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `__init__.py` | 23 | Package docstring mapping the 16 check-family modules run_demo.py imports; no code. |
| `common.py` | 171 | Import-time bootstrap (UTF-8 console, sys.path to proofgraph root, outerwall+hub imports) plus the shared CHECKS/BOUNDS/CLASSES registries and utilities (check/skip/bound/exercised, wait_port, kill_tree, run_node, http_get, offsets_of, ids_by_name) used by every checks/* module. |
| `step1.py` | 44 | Runs analyze_session on moatpkg/unused_hyp.lean/honest_ceiling.typ, writes the three canonical analysis-*.json files, logs the staging/root bounds; returns sessions+bytes to run_demo.main. |
| `a_unused.py` | 31 | Check a-unused: asserts moat gapAnalysis flags exactly moatpkg.helpers.unused_fn, the reachable set is {main, side_calc, used_fn} and the two-library crosscheck agrees. |
| `b_outline.py` | 49 | Check b-outline-rings: every moat outline filled unknown with worstOf ['none'], verdicts==node rows, closure probe agrees, and packages/schema/validate.py (exec'd standalone from disk) passes on the on-disk analysis-moat.json graph. |
| `c_h_ceiling.py` | 125 | Checks c-honest-ceiling and h-unknown-honesty on the typst analysis: all-unknown statuses, zero edges, leads unresolved with incompleteBases populated, roots-undeclared refusal; h re-proves unknown across hub-served bytes (typed 503 first), the headless view evidence and the AI no-claim answer. |
| `d_brushing.py` | 55 | Runs the app vitest acceptance config (evidence/headless.json) and check d-brushing: one select each direction over the V5 bus with byte-equal node ids on both walls' pins and exact bounded counts. |
| `e_ai.py` | 42 | Check e-ai: spawns headless/ai_check.mjs against the live moat hub and asserts the FAKE-transport answer names the real unused node id, listUnused executed, graphFacts.nodes==6. |
| `f_trace.py` | 105 | Check f-system-trace: reads system_pins().trace(main_id), extends it with hub /graph+/analysis byte offsets and the view/editor hops from the headless evidence, writes TRACE-full.json, asserts byte-identity at every hop. |
| `g_squiggle.py` | 50 | Check g-squiggle: runs headless/squiggle_check.mjs (V2 path, temp moat variant), asserts the diagnostic byte span equals the injected expression, severity error, one initialize enrichment, and the fixture sha-identical before/after. |
| `i_green.py` | 145 | Check i-green-trace: proves unused_hyp.uses_base is green because the kernel verified it (fill.source run-sha resolves to the probed driver invocation, model-wall greenGuard admitted), then the same id byte-identical through trace hops, a fresh hub's /graph+/analysis, the view green paint and the CT editor gutter; appends greenTrace to TRACE-full.json. |
| `j_unbacked.py` | 93 | Check j-unbacked-green: a doctored green (evidence stripped) must fail at cell 3's SchemaNode.validate (unbacked-green), the model wall's ingest (fake-green, pinned, committed state survives) and the editor wall (green-may-never-be-faked from headless evidence); documents its one post-SUB200 adaptation (package import of extractor.schema). |
| `ui_servers.py` | 132 | Step-3 plumbing: spawns the ephemeral ai server (--port 0 --hub), grants a free OS port, spawns a private strict-port vite child, and runs one headless_ui.mjs page over a temp fixture copy declared as the hub workspace; tears everything down and persists ui-<page>.json evidence. |
| `ui_specs.py` | 146 | build_specs computes the three page expectation specs (census, paints, greens, gutter glyphs with the tier-G green-block, brush targets, AI must/must-not strings) from the same analyses the earlier checks asserted; glyph rules mirror cell 4's origin/tier treatments and the span-file suffix rule mirrors app/src/uris.ts spanFileMatches. |
| `browser_step.py` | 177 | ui_step drives the three headless_ui pages (moat/lean/ceiling) on one ephemeral vite, converts exit 3 to a logged SKIP, re-verifies brush ids as UTF-8 byte arrays and green paints in-process, asserts fixtures sha-identical, and registers the single ui-acceptance check with bounds. |
| `suites.py` | 59 | run_suites re-runs hub/outerwall/app/ai live when --suites is given; RECORDED_SUITES is the report's cited recorded-count table (refreshed this audit to the current baseline). |
| `reporting.py` | 181 | write_report renders ACCEPTANCE-REPORT.md (check table, trace summaries, bounds, failure classes, suite roll-up, honest-ceiling statement) and persists evidence/checks.json with the full registries. |
