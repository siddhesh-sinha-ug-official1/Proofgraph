"""REAL-INPUTS regression suite — remediation worklist item 3b.

analyze() on two previously-unseen REAL inputs, vendored with provenance
(NOT derived from the demo fixtures in any way), frozen here as regression
fixtures.  Both run through the REAL composition — hub pipeline + the REAL
V1 capability feed (python + lean MEASURED live by cell 2), live pyright,
live kernel driver:

  REAL_PY   acceptance/fixtures/real_py/colorama — colorama 0.4.6
            (BSD-3-Clause; PyPI wheel vendored from this machine's
            site-packages; PROVENANCE.md pins origin/license/version and
            the exact bytes).  Live pyright; roots ['colorama.initialise']
            (module-name expansion on a real package).
  REAL_LEAN acceptance/fixtures/real_lean/src — Init/ByCases.lean,
            Init/Classical.lean, Init/SizeOfLemmas.lean vendored VERBATIM
            from the leanprover/lean4:v4.31.0 toolchain source
            (Apache-2.0; PROVENANCE.md pins everything).  Three REAL
            theorem-bearing single files at CT — the declared single-file
            driver bound honored; multi-file lake stays a declared limit.

The frozen guarantees (each one a test):
  * well-formed graph — packages/schema validate.py green on every run;
  * ID STABILITY — TWO fully independent analyze_session runs per input
    BYTE-COMPARE EQUAL on the canonical analysis bytes (ids, verdicts,
    provenance, gap — everything canonical);
  * complete provenance — assert_no_holes (build-failing) + every node and
    edge row carries non-null cell/tier/extractor/resolved;
  * verdicts consistent with the CHECKERS' ACTUAL output — python: pyright
    is resolution, not verdict, so literally zero green; lean: every green
    carries the node's OWN kernel attestation whose run=<sha16> resolves to
    the probed driver invocation;
  * the Init/Classical.lean raw-name COLLISION REGRESSION stays inverted
    (the REAL-INPUTS cell-3 matcher fix: crossed attestations / crossed
    proof_uses edges must never come back);
  * vendored fixture bytes match the PROVENANCE.md sha256 pins — a drifted
    fixture is a build failure, never a silent re-baseline.

Budget: 2 live-pyright + 2 live-lean capability batteries + 2x3 kernel
driver invocations — roughly 2-4 minutes warm (first-ever driver run of a
cold day can add ~76 s once, a declared driver bound).

SUB200 restructure: this file stays the DISCOVERING AGGREGATOR (invoked by
this exact path); the test classes moved verbatim into the sibling modules
loaded below in the original order (the 12-test lean class regrouped as
identity/shape + semantics halves), with the shared lazy sessions/pins in
ow_real_shared.py.  Same 21 tests, same assertions.

Run:  python outerwall/test_real_inputs.py     (from proofgraph/ or anywhere)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

OUTERWALL_DIR = Path(__file__).resolve().parent
if str(OUTERWALL_DIR) not in sys.path:
    sys.path.insert(0, str(OUTERWALL_DIR))

import ow_real_shared                                     # noqa: E402,F401

#: original class order Test00..Test02(+continuation), preserved
_MODULES_IN_ORDER = (
    "test_real_inputs_py",              # Test00VendoredBytesPinned,
                                        # Test01RealPyColorama
    "test_real_inputs_lean",            # Test02RealLeanToolchainSource
    "test_real_inputs_lean_semantics",  # Test03RealLeanSemantics
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
