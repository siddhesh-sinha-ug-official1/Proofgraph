"""run_demo — the §7 ACCEPTANCE RUNNER: one command, the organism breathes.

    python acceptance/run_demo.py                 # everything incl. the DEFAULT
                                                  # headless UI acceptance (real
                                                  # Chromium, DOM/a11y/pins — no
                                                  # person, no pixel screenshots)
    python acceptance/run_demo.py --skip-ui       # emergencies only: headless §7
                                                  # gate without the browser UI step
                                                  # (LOGGED skip, never a pass)
    python acceptance/run_demo.py --suites        # additionally re-run the assembly suites
                                                  # (hub / outerwall / app / ai) live

What it does (OUTERWALL-CONTRACT.md §"Acceptance runner" + the Phase-3 brief):

 1. Runs the REAL outer wall — analyze() on acceptance/fixtures/moatpkg
    (roots=["moatpkg.core"], LIVE pyright, REAL V1-measured capability), on
    acceptance/fixtures/unused_hyp.lean (the CT verdict-arrival world since
    the LEAN-DOCK round: REAL kernel greens + the resolved proof_uses edge)
    and on acceptance/fixtures/honest_ceiling.typ (the SURVIVING all-unknown
    honest ceiling — typst, a language cell 2 refuses) — and writes
    acceptance/analysis-moat.json + analysis-lean.json + analysis-ceiling.json
    (canonical bytes, byte-equal to what hub GET /analysis serves).

 2. Asserts §7 headlessly as NAMED checks (each PASS/FAIL with evidence):
      a-unused           exactly moatpkg.helpers.unused_fn's DECL flagged;
                         reachable set correct (wall crosscheck agrees)
      b-outline-rings    every moat outline FILLED unknown (honest — no
                         verdict compiler) with ruling-8-correct worstOf
                         tokens; packages/schema/validate.py green on the
                         ON-DISK filled graph
      c-honest-ceiling   (UPDATED green-flow round: the all-unknown story
                         moved from lean — which EARNED CT greens — to the
                         typst ceiling input) zero green anywhere; every
                         connection a LEAD (dashed class), zero resolved
                         edges; incompleteBases populated; roots-undeclared
                         honored, never inferred
      d-brushing         headless bus-level round-trip: V5 adapter + BOTH real
                         walls, one select each direction, byte-equal nodeIds
                         on BOTH cells' pins (app/test-acceptance suite)
      e-ai               through the V6 outlet (FAKE transport goldens):
                         "what is unused?" → the answer names the REAL unused
                         Node.id; tool output is REAL hub graph data
      f-system-trace     ONE moatpkg Node.id byte-identical at EVERY hop:
                         extraction → model → analysis bytes → hub-served →
                         view-ingested → editor-selection (headless via the
                         V5 bus); appended to acceptance/TRACE-full.json
      g-squiggle         V2's path against a TEMP moat variant with an
                         injected type error (fixture NEVER mutated) —
                         pyright diagnostics land at the exact byte span
      h-unknown-honesty  the CEILING (typst) analysis renders unknown through
                         EVERY layer: analyze() → hub-served bytes → view
                         paints (jsdom, V4 harness pattern) → AI honest
                         no-claim
      i-green-trace      (NEW, green-flow round) one decl green BECAUSE the
                         kernel verified it: the SAME content-addressed
                         Node.id byte-identical at every hop — extractor
                         driver probe (runSha) → model wall greenGuard →
                         analyze() canonical bytes → hub GET /graph +
                         /analysis → view dump().paints #2E7D32 → editor
                         gutter pin (greenGuard PASSES at measured CT);
                         appended to TRACE-full.json as greenTrace
      j-unbacked-green   (NEW, green-flow round) the companion guard: a
                         DOCTORED green without checker evidence fails at
                         cell 3's schema (unbacked-green), at the model
                         wall's ingest (fake-green) and at the editor wall
                         (editor.verdict.green.blocked) — the named classes
                         surface through the stack, never a silent pass

 3. Headless UI acceptance (the DEFAULT browser-check path — HEADLESS-UI
    round, remediation worklist item 5): stands an EPHEMERAL hub+ai pair per
    page (workspace = a TEMP FIXTURE COPY so the real fixtures are never
    writable through /fs) + one EPHEMERAL-port vite, and drives a REAL
    Chromium (headless=new over CDP, zero installs) through
    acceptance/headless/headless_ui.mjs — asserting the full on-screen path
    via DOM/a11y reads + the §7.8 spike surfaces (window.pgGraphWall /
    pgEditorWall / pgShellLog pins): the file OPENS with verdict markers
    (editor gutter pins), the graph renders nodes COLORED BY VERDICT
    (dump().paints incl. the kernel greens #2E7D32), BRUSHING carries the
    same byte-identical id across both walls in BOTH directions (a real
    graph-node click AND a real Monaco caret click), and the unknown-tier
    ceiling renders unknown, never green.  ZERO pixel screenshots — the old
    screenshot capture (browser_shot.mjs, could hang on the Monaco canvas)
    remains an OPTIONAL manual tool only.  Evidence:
    acceptance/evidence/ui-{moat,lean,ceiling}.json (+ ui-spec-*.json).

 4. Writes acceptance/ACCEPTANCE-REPORT.md (every §7 bullet + proof, bounds,
    failure classes exercised, suite roll-up, honest-ceiling statement).

ZERO tolerance for fake green: any FAIL exits nonzero with the evidence; a
skipped UI step is a LOGGED SKIP, never a silent pass.  All child
processes are torn down (taskkill /T on Windows trees).

SUB200 restructure (wave 2): this file is the ONE-COMMAND FACADE — same CLI,
same flags, same output format; the check families live in
acceptance/checks/*.py (one module per family, carved verbatim).
"""
from __future__ import annotations

import argparse
import json
import sys
import time

# checks.common performs the runner's original bootstrap on import (UTF-8
# console, sys.path → proofgraph root, outerwall + hub imports).
from checks.common import (CHECKS, EVIDENCE_DIR, check, exercised, http_get,
                           hub_server, skip)
from checks.step1 import step1_analyze
from checks.a_unused import check_a_unused
from checks.b_outline import check_b_outline
from checks.c_h_ceiling import check_c_ceiling, check_h_honesty
from checks.d_brushing import check_d_brushing, run_headless_suite
from checks.e_ai import check_e_ai
from checks.f_trace import check_f_trace
from checks.g_squiggle import check_g_squiggle
from checks.i_green import check_i_green_trace
from checks.j_unbacked import check_j_unbacked_green
from checks.browser_step import ui_step
from checks.suites import run_suites
from checks.reporting import write_report


def main() -> int:
    ap = argparse.ArgumentParser(description="§7 acceptance runner")
    ap.add_argument("--skip-ui", "--skip-browser", dest="skip_ui",
                    action="store_true",
                    help="EMERGENCIES ONLY: skip the DEFAULT headless UI "
                         "acceptance (LOGGED skip, never a pass; "
                         "--skip-browser is the deprecated alias)")
    ap.add_argument("--suites", action="store_true",
                    help="also re-run hub/outerwall/app/ai suites live")
    args = ap.parse_args()

    EVIDENCE_DIR.mkdir(exist_ok=True)

    t0 = time.time()
    moat, lean, ceiling, moat_bytes, lean_bytes, ceiling_bytes = step1_analyze()

    # analysis-level checks
    check_a_unused(moat)
    check_b_outline(moat)
    check_c_ceiling(ceiling)

    # headless walls suite (vitest) — feeds d, f (two hops), h (view layer)
    vitest_ok, headless_ev, headless_tail = run_headless_suite()
    if not vitest_ok:
        print(headless_tail, flush=True)
    check_d_brushing(vitest_ok, headless_ev, moat)

    # a LIVE hub over the MOAT organism (ephemeral ports; analysis attached
    # only after the typed refusal is exercised)
    hub = hub_server.HubServer(moat["pipeline"], log=moat["hubLog"]).start()
    try:
        s0, body0 = http_get(hub.http_port, "/analysis")
        if s0 == 503 and json.loads(body0).get("failureClass") == "no-analysis-computed":
            exercised("no-analysis-computed")
        hub.attach_analysis(moat["analysis"], note="run_demo §7")
        # byte-for-byte: GET /analysis == canonical_json(analyze(...))
        s1, served = http_get(hub.http_port, "/analysis")
        if not (s1 == 200 and served == moat_bytes):
            check("hub-analysis-bytes", False,
                  "GET /analysis != canonical analyze() bytes", None)
        check_e_ai(hub.http_port, moat)
        check_f_trace(moat, hub.http_port, headless_ev)
    finally:
        hub.stop()

    check_g_squiggle()
    check_h_honesty(ceiling, ceiling_bytes, headless_ev)

    # green-flow round: the green trace + the companion guard (§7 i, j)
    check_i_green_trace(lean, headless_ev)
    check_j_unbacked_green(lean, headless_ev)

    # step 3 — the DEFAULT headless UI acceptance (worklist item 5): runs
    # WITHOUT a person; --skip-ui is for emergencies only (LOGGED skip).
    ui_result = None
    if args.skip_ui:
        skip("ui-acceptance", "--skip-ui given (headless §7 gate ran in "
             "full; manual browser steps: app/README.md)")
    else:
        ui_result = ui_step(moat, lean, ceiling)

    suite_results = run_suites() if args.suites else []

    write_report(args, moat, lean, ceiling, suite_results, headless_tail)

    n_fail = sum(1 for c in CHECKS if c["pass"] is False)
    if args.suites:
        n_fail += sum(1 for s in suite_results if not s["ok"])
    dt = time.time() - t0
    print(f"== DONE in {dt:.0f}s: "
          f"{sum(1 for c in CHECKS if c['pass'] is True)} PASS, {n_fail} FAIL, "
          f"{sum(1 for c in CHECKS if c['pass'] is None)} SKIP ==", flush=True)
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
