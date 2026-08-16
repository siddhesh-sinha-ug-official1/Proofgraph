#!/usr/bin/env python3
"""Smoke test for the Lean extraction/verdict driver (feasibility spike).

One command, from anywhere:

    python A:\\30lean-push\\proofgraph\\packages\\structure-extractor\\extractor\\docks\\lean_driver\\run_smoke.py

What it does: runs `lean --run Driver.lean <target>` (cwd = this directory,
so the adjacent `lean-toolchain` file pins the version) against the three
scratch fixtures plus the read-only acceptance fixture, parses the single
JSON document each run emits on stdout, and asserts the spike's proof
obligations:

  (a) fixtures/clean.lean       — 3 decls (fixA/fixB/fixC) all kernelAccepted,
                                  fixB.refs contains fixA, zero sorry,
                                  zero unexpectedAxioms, errors == [].
  (b) fixtures/sorry_case.lean  — fixS.usesSorry == true, sorryAx present in
                                  BOTH axioms and unexpectedAxioms (never
                                  allowlisted), driver still exits 0
                                  (sorry is a warning, not an error).
  (c) fixtures/unused_hyp_case.lean — lonely.unusedHypotheses == [h2]
                                  (h used, NOT flagged).
  (d) ../../../../../acceptance/fixtures/unused_hyp.lean (READ-ONLY) —
                                  uses_base.refs contains base_fact;
                                  uses_base flags unused h; lonely flags
                                  unused h2 only; zero sorry anywhere.

Also asserted every run: toolchain.leanVersion == the version named in the
adjacent lean-toolchain pin (currently leanprover/lean4:v4.31.0), and the
limits[] array is present and non-empty (declared limits ride in the output).

Lean binary resolution: $LEAN_EXE if set, else A:\\lean\\elan\\bin\\lean.exe
(this machine's elan shim), else `lean` on PATH.

Exit code: 0 = all assertions pass; 1 = any failure (each printed).
NOTE: a cold toolchain (first `lean --run` after boot / elan install) can
take 60-120s on the first file; warm runs are ~2-3s each. Timeout is 300s.
"""

import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ACCEPTANCE = os.path.abspath(os.path.join(
    HERE, "..", "..", "..", "..", "..", "acceptance", "fixtures", "unused_hyp.lean"))


def lean_exe() -> str:
    cand = os.environ.get("LEAN_EXE")
    if cand and os.path.exists(cand):
        return cand
    shim = r"A:\lean\elan\bin\lean.exe"
    if os.path.exists(shim):
        return shim
    found = shutil.which("lean")
    if found:
        return found
    raise SystemExit("no lean binary: set LEAN_EXE or install elan")


def pinned_version() -> str:
    # "leanprover/lean4:v4.31.0" -> "4.31.0"
    with open(os.path.join(HERE, "lean-toolchain"), encoding="utf-8") as f:
        pin = f.read().strip()
    return pin.rsplit(":v", 1)[-1]


def run_driver(target: str):
    t0 = time.monotonic()
    proc = subprocess.run(
        [lean_exe(), "--run", "Driver.lean", target],
        cwd=HERE, capture_output=True, text=True, encoding="utf-8", timeout=300)
    elapsed = time.monotonic() - t0
    return proc, elapsed


FAILURES = []


def check(label: str, cond: bool, detail: str = ""):
    if cond:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label}  {detail}")
        FAILURES.append(f"{label} {detail}")


def decls_by_name(doc):
    return {d["name"]: d for d in doc["decls"]}


def common_checks(name: str, proc, doc, expect_exit: int):
    check(f"{name}: exit {expect_exit}", proc.returncode == expect_exit,
          f"got {proc.returncode}; stderr={proc.stderr[:400]}")
    check(f"{name}: toolchain pinned", doc["toolchain"]["leanVersion"] == pinned_version(),
          f'got {doc["toolchain"]["leanVersion"]}, pin {pinned_version()}')
    check(f"{name}: limits declared", bool(doc.get("limits")))


def main() -> int:
    print(f"lean = {lean_exe()}  pin = leanprover/lean4:v{pinned_version()}")

    # (a) clean
    proc, dt = run_driver(os.path.join("fixtures", "clean.lean"))
    doc = json.loads(proc.stdout)
    print(f"[clean.lean] {dt:.1f}s")
    common_checks("clean", proc, doc, 0)
    d = decls_by_name(doc)
    check("clean: decls fixA/fixB/fixC", set(d) == {"fixA", "fixB", "fixC"}, str(set(d)))
    check("clean: all kernelAccepted", all(x["kernelAccepted"] for x in d.values()))
    check("clean: fixB.refs contains fixA", "fixA" in d["fixB"]["refs"])
    check("clean: no sorry", not any(x["usesSorry"] for x in d.values()))
    check("clean: no unexpected axioms", all(x["unexpectedAxioms"] == [] for x in d.values()))
    check("clean: errors empty", doc["errors"] == [])
    check("clean: imports == [Init]", doc["imports"] == ["Init"], str(doc["imports"]))

    # (b) sorry
    proc, dt = run_driver(os.path.join("fixtures", "sorry_case.lean"))
    doc = json.loads(proc.stdout)
    print(f"[sorry_case.lean] {dt:.1f}s")
    common_checks("sorry", proc, doc, 0)  # sorry elaborates as a WARNING
    d = decls_by_name(doc)
    check("sorry: fixS present", "fixS" in d, str(set(d)))
    check("sorry: usesSorry true", d["fixS"]["usesSorry"])
    check("sorry: sorryAx in axioms", "sorryAx" in d["fixS"]["axioms"])
    check("sorry: sorryAx unexpected (never allowlisted)",
          "sorryAx" in d["fixS"]["unexpectedAxioms"])
    check("sorry: warning surfaced", any(
        e["severity"] == "warning" and "sorry" in e["message"] for e in doc["errors"]))

    # (c) unused hypothesis
    proc, dt = run_driver(os.path.join("fixtures", "unused_hyp_case.lean"))
    doc = json.loads(proc.stdout)
    print(f"[unused_hyp_case.lean] {dt:.1f}s")
    common_checks("unused", proc, doc, 0)
    d = decls_by_name(doc)
    names = [b["binderName"] for b in d["lonely"]["unusedHypotheses"]]
    check("unused: exactly [h2] flagged (h NOT)", names == ["h2"], str(names))

    # (d) acceptance fixture (READ-ONLY input)
    check("acceptance: fixture exists", os.path.exists(ACCEPTANCE), ACCEPTANCE)
    proc, dt = run_driver(ACCEPTANCE)
    doc = json.loads(proc.stdout)
    print(f"[acceptance unused_hyp.lean] {dt:.1f}s")
    common_checks("acceptance", proc, doc, 0)
    d = decls_by_name(doc)
    check("acceptance: decls", set(d) == {"base_fact", "uses_base", "lonely"}, str(set(d)))
    check("acceptance: uses_base.refs contains base_fact",
          "base_fact" in d["uses_base"]["refs"])
    check("acceptance: uses_base flags unused h",
          [b["binderName"] for b in d["uses_base"]["unusedHypotheses"]] == ["h"])
    check("acceptance: lonely flags unused h2 only",
          [b["binderName"] for b in d["lonely"]["unusedHypotheses"]] == ["h2"])
    check("acceptance: zero sorry", not any(x["usesSorry"] for x in d.values()))

    print()
    if FAILURES:
        print(f"SMOKE FAIL — {len(FAILURES)} failure(s)")
        return 1
    print("SMOKE PASS — all driver assertions green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
