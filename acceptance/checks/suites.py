"""optional --suites live re-run + the recorded end-state suite table.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import subprocess

from .common import AI_DIR, APP_DIR, NPM, NPX, ROOT, run_node


def run_suites() -> list[dict]:
    suites = [
        ("hub", ["python", str(ROOT / "hub" / "test_hub.py")], ROOT, 600),
        ("outerwall", ["python", str(ROOT / "outerwall" / "test_outerwall.py")],
         ROOT, 900),
        ("app (vitest incl. build gate)", [NPX, "vitest", "run"], APP_DIR, 900),
        ("ai (node --test)", [NPM, "test"], AI_DIR, 300),
    ]
    results = []
    for name, cmd, cwd, tmo in suites:
        print(f"== suite: {name} ==", flush=True)
        try:
            rc, out, err = run_node(cmd, timeout_s=tmo, cwd=cwd)
        except subprocess.TimeoutExpired:
            results.append({"suite": name, "ok": False, "tail": "TIMEOUT"})
            continue
        tail = "\n".join((out + "\n" + err).splitlines()[-6:])
        results.append({"suite": name, "ok": rc == 0, "tail": tail})
        print(f"   {'OK' if rc == 0 else 'FAIL'} — {tail.splitlines()[-1] if tail else ''}",
              flush=True)
    return results


# [adversarial claim-audit 2026-08-03: cells 2/3/5 + outerwall rows refreshed
#  to the CURRENT recorded counts — the old rows (124 / 131 / 133 / bare 41)
#  predated the LEAN-DOCK battery growth, the REAL-INPUTS round (+9 cell-3,
#  +21 outerwall real-inputs tests) and the SUB200 graph-view boundary-gate
#  census (133→152); sources re-cited.]
RECORDED_SUITES = [
    ("graph-model (cell 1)", "113", "REPORT/phase-0 close (master transcript)"),
    ("capability-layer (cell 2)", "131 (incl. the lean battery)",
     "LEANDOCK-CT round (remediation log)"),
    ("structure-extractor (cell 3)", "140 (131 + 9 REAL-INPUTS)",
     "REPORT-LEANDOCK / REAL-INPUTS round (remediation log)"),
    ("editor-shell (cell 4)", "96", "phase-0 close / REPORT-V2"),
    ("graph-view (cell 5)", "152 (133 + 19 SUB200 boundary-gate census)",
     "REPORT-SUB200-graph-view"),
    ("byok-arena (cell 6)", "103", "phase-0 close"),
    ("packages/schema", "23 py + 14 ts", "phase-0.2"),
    ("hub", "44", "app-shell round (REPORT-appshell-integrate)"),
    ("outerwall", "41 (green-flow: verdict arrival + typst ceiling) "
     "+ 21 test_real_inputs", "REPORT-GREENFLOW / REAL-INPUTS round"),
    ("app (vitest incl. build gate)", "111 + 1 todo",
     "green-flow round (UI-polish merge reconciled); re-swept headless-ui round"),
    ("ai (V6 outlet 8 + p3.server 6)", "14", "REPORT-P3-face"),
    ("vessels V1/V2/V3", "V1 11/11 (verdict-arrival c2) · V2 4/4 · V3 16/16",
     "REPORT-LEANDOCK / REPORT-V2"),
]
