"""OUTER-WALL suite (Phase 3 programmatic face; stdlib unittest).

The mandated inputs (OUTERWALL-CONTRACT.md + the Phase-3 brief, extended by
the remediation green-flow round), all driven through the REAL composition —
hub pipeline + the REAL V1 capability feed (python AND lean MEASURED live by
cell 2 since CAP-LEAN; typst local-stub RECORDED fallback):

  MOAT    acceptance/fixtures/moatpkg   (live pyright; roots ["moatpkg.core"])
  RICH    packages/structure-extractor/fixtures/pyrich  (recorded pyright —
          deterministic resolution fixture; capability still measured live)
  LEAN    acceptance/fixtures/unused_hyp.lean  (CT verdict-arrival world:
          REAL kernel greens + the resolved proof_uses edge — LEAN-DOCK round)
  LEANCT  packages/structure-extractor/fixtures/lean_ct/Verified.lean
          (read-only; the sorry decl → AMBER asserted at the outer wall)
  CEILING acceptance/fixtures/honest_ceiling.typ — the SURVIVING all-unknown
          honest-ceiling input (typst: cell 2 refuses, recorded local-stub
          fallback; nodes + dashed leads only, NEVER green).  The
          unknown-never-green acceptance story lives HERE now that lean
          earned CT (green-flow round; the lean Mathlib fixture was MEASURED
          red — elaboration errors — not unknown, so typst carries the story).
  XYZ     an unknown-language input (.xyz) — typed refusal, no crash, no green

Binding rule honored: assertions read PIN surfaces alongside faces (model
wall verdictOf vs analysis verdicts; wall ingest greenGuard pins; outer log
closure/bound events; TRACE seed bytes; hub log for /analysis) — never a
return value alone.

SUB200 restructure: this file stays the DISCOVERING AGGREGATOR (run_all_
suites / run_demo / faultcheck invoke it by this exact path); the test
classes moved verbatim, split by fixture world, into the sibling modules
loaded below IN THE ORIGINAL Test01..Test08 order (the 8-test lean class
regrouped as arrival + rings/guards halves), with the shared lazy
sessions/helpers in ow_test_shared.py.  Same 41 tests, same assertions.

Run:  python outerwall/test_outerwall.py     (from proofgraph/ or anywhere)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

OUTERWALL_DIR = Path(__file__).resolve().parent
if str(OUTERWALL_DIR) not in sys.path:
    sys.path.insert(0, str(OUTERWALL_DIR))

import ow_test_shared                                     # noqa: E402,F401

#: original class order Test01..Test08, preserved across the split modules
_MODULES_IN_ORDER = (
    "test_outerwall_moat",      # Test01Moat
    "test_outerwall_rich",      # Test02Rich
    "test_outerwall_lean",      # Test03LeanVerdictArrival (first half)
    "test_outerwall_lean_rings",  # Test03bLeanRingsAndGuards (second half)
    "test_outerwall_ceiling",   # Test04TypstHonestCeiling, Test05Unknown...
    "test_outerwall_ruling8",   # Test06Ruling8AndFailureClasses
    "test_outerwall_pins",      # Test07SystemPins, Test08HubAnalysisEndpoint
)


def load_tests(loader, tests, pattern):
    import importlib
    suite = unittest.TestSuite()
    for mod_name in _MODULES_IN_ORDER:
        suite.addTests(loader.loadTestsFromModule(
            importlib.import_module(mod_name)))
    return suite


if __name__ == "__main__":
    unittest.main(verbosity=2)
