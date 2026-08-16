"""V3 CONNECTOR TEST — extractor wall -> graph-model wall (Phase 2 vessel).

AGGREGATOR (SUB200 restructure): `python vessels/test_v3_extractor_to_model.py`
runs the FULL suite — run_all_suites and faultcheck invoke it by this path,
unchanged.  The suite body lives in four sibling modules over the SAME two
fixture bundles (v3_seam_shared.py):

    test_v3_byte_identity   byte identity across the seam + THE node-preimage
                            gap closure (the promised MEMBRANE-SPEC seam test)
    test_v3_accounting      leads stay leads · no silent drops
    test_v3_semantics       composed moat story · verdicts stay unknown ·
                            root-vocabulary honesty (root-vocabulary-mismatch)
    test_v3_negatives       id-mismatch / lead-in-edges negatives · the
                            sys-path-shadowing pathing guards

The seam: `ExtractorWall.extract(root)` canonical envelope
`{schemaVersion, nodes, edges, leads, honestCeilings}` ->
`GraphModelWall.ingest(nodes, edges, leads, roots)` (VERIFY-NOT-MINT), with
the extractor's default stub capability (the real capability wall is V1's
scope, not V3's).  EVERY test asserts on BOTH cells' pins across the
boundary — never on a return value alone (Phase-2 binding rule); see the
split modules for the per-test pin inventories.

Run:  python proofgraph/vessels/test_v3_extractor_to_model.py
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

VESSELS = Path(__file__).resolve().parent
if str(VESSELS) not in sys.path:
    sys.path.insert(0, str(VESSELS))

import test_v3_byte_identity  # noqa: E402
import test_v3_accounting     # noqa: E402
import test_v3_semantics      # noqa: E402
import test_v3_negatives      # noqa: E402

#: original class order (byte identity -> preimage -> leads -> drops ->
#: moat -> verdicts -> roots honesty -> negatives -> pathing guards).
SUITE_MODULES = (
    test_v3_byte_identity,
    test_v3_accounting,
    test_v3_semantics,
    test_v3_negatives,
)


def load_tests(loader, tests, pattern):
    suite = unittest.TestSuite()
    for mod in SUITE_MODULES:
        suite.addTests(loader.loadTestsFromModule(mod))
    return suite


if __name__ == "__main__":
    unittest.main(verbosity=2)
