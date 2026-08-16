"""acceptance.checks — the §7 runner's check families, one module each.

SUB200 restructure (wave 2): carved VERBATIM out of acceptance/run_demo.py
(behavior-preserving; the runner remains the ONE-COMMAND facade — same CLI,
same flags, same output format).  Module map:

    common.py        env bootstrap + check registry + shared utilities
    step1.py         step 1 — outer wall analyze() on the three fixtures
    a_unused.py      §7(a)  exact unused decl + crosschecked reachability
    b_outline.py     §7(b)  outline rings + validate.py on the on-disk graph
    c_h_ceiling.py   §7(c)+(h)  the typst honest ceiling, every layer
    d_brushing.py    headless vitest suite + §7(d) bus round-trip
    e_ai.py          §7(e)  the V6 outlet against the LIVE hub
    f_trace.py       §7(f)  THE system trace (TRACE-full.json)
    g_squiggle.py    §7(g)  live pyright squiggle via V2's path
    i_green.py       §7(i)  THE green trace (kernel evidence chain)
    j_unbacked.py    §7(j)  the doctored-green companion guard
    ui_servers.py    step 3 plumbing — ephemeral ai/vite/hub-per-page
    ui_specs.py      step 3 expectations COMPUTED from the analyses
    browser_step.py  step 3 — headless UI acceptance (default gate)
    suites.py        --suites live re-run + the recorded end-state table
    reporting.py     ACCEPTANCE-REPORT.md + evidence/checks.json
"""
