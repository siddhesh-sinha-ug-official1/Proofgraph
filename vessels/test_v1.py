"""CONNECTOR TEST — vessel V1 (capability wall × structure-extractor wall).

AGGREGATOR (SUB200 restructure): `python vessels/test_v1.py` runs the FULL
suite — run_all_suites invokes it by this path, unchanged.  The suite body
lives in two sibling modules over ONE shared stack (v1_seam_shared.py):

    test_v1_live_python       (a) python live-CT + reduced-S double, (b) awk
    test_v1_langs_lifecycle   (b/c) lean measured + latex refusal-fallback,
                              (c) unknown language, (z) lifecycle sweep

Every assertion reads BOTH cells' pins across the boundary — never a
return value alone:

  (a) python (the rich CT path, LIVE pyright on both sides): the extractor's
      `extractor.ingest.capability.response` pin carries EXACTLY the tier
      cell 2's `capability.probe.measuredTier` pin measured — byte-equal —
      with provenance stamped; resolved edges exist ONLY because the measured
      tier is CT (guard pin silent).  A labelled reduced-measurement double
      ("what if cell 2 had measured S") proves the same dock then emits ZERO
      resolved edges with the tier-gate cap pin fired — the honest-degraded
      path.  (The guard's FIRING on a forged resolved-at-S edge is proven in
      cell 3's own conformance suite, test_wall_conformance — the vessel
      never fakes a resolved edge to re-prove it here.)
  (b) awk (measured NON-CT) + lean (cell 2 MEASURES lean since CAP-LEAN —
      tier carried byte-equal; the extractor's kernel-driver dock runs for
      real and the Mathlib-importing fixture honestly yields ZERO resolved
      edges and ZERO green) + latex (cell-2 typed refusal → recorded local-
      stub fallback — the refusal mechanism, previously proven on lean,
      preserved on a language cell 2 still refuses).
  (c) klingon (unknown to BOTH cells): typed refusals through both walls,
      no fabricated tier anywhere.
  (z) lifecycle: the vessel shuts down cell 2's LSP child; no orphaned
      node/pyright processes remain (sweep vs. the pre-run baseline).

Run:  python proofgraph/vessels/test_v1.py   (LOUD skip if npx unavailable)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import test_v1_live_python      # noqa: E402
import test_v1_langs_lifecycle  # noqa: E402

#: original test_a1..test_z order — python/awk first, then lean/latex/
#: unknown/lifecycle (test_z, the explicit shutdown, runs LAST).
SUITE_MODULES = (test_v1_live_python, test_v1_langs_lifecycle)


def load_tests(loader, tests, pattern):
    suite = unittest.TestSuite()
    for mod in SUITE_MODULES:
        suite.addTests(loader.loadTestsFromModule(mod))
    return suite


if __name__ == "__main__":
    unittest.main(verbosity=2)
