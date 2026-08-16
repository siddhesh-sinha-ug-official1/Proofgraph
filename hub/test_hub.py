"""Backend-hub suite AGGREGATOR (stdlib unittest; ephemeral ports; skeleton
fixture).  `python hub/test_hub.py` runs the FULL suite — run_demo/run_all
invoke it by this path, unchanged.

SUB200 restructure: the suite body now lives in nine sibling modules (one
shared stack, built lazily in test_hub_base.ensure_stack and stopped at
process exit), loaded here IN THE ORIGINAL Test01..Test11 order:

    test_hub_seam            Test01 health+pipeline seam · Test02 /graph
    test_hub_query_verdict   Test03 /query · Test04 /verdict
    test_hub_pins            Test05 /pins aggregation
    test_hub_analyze         Test06 POST /analyze · Test07 pipeline roots
    test_hub_lsp             Test08 WS /lsp echo bridge
    test_hub_truth_analysis  Test09 /graph/truth · Test10 GET /analysis
    test_hub_fs_workspace    Test11 part 1 (workspace + roots-candidates)
    test_hub_fs_io           Test11 part 2 (fs round-trip, escapes, binary)
    test_hub_fs_loop         Test11 part 3 (save -> re-analyze -> re-attach)

Binding rule honored throughout (see the split modules): every connector
assertion reads BOTH sides' diagnostic surfaces across a boundary — the
extractor wall's pins AND the graph-model wall's pins for the extract->ingest
seam; the model wall's pins AND the hub log for every HTTP surface; the
bridge ledger AND the backend ledger (AND the client's own lists) for the WS
seam.  Never a return value alone.

Failure classes exercised by name:
    serializer-edge-drop · envelope-version-mismatch · lsp-bridge-drop
    (echo-level) · pipeline-busy · no-analysis-computed · plus
    roots-undeclared / unknown-root /
    unknown-query / unknown-node / no-graph-* honest-refusal passthroughs
    and lsp-backend-busy / hub-bad-request / unknown-endpoint — and (app-shell
    round) path-escape / workspace-not-open / fs-io-error on the jailed
    workspace-fs surface (escape matrix, binary refusal, save → re-analyze →
    re-attach loop on a TEMP fixture copy).

Run:  python hub/test_hub.py            (from proofgraph/ or anywhere)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import test_hub_seam            # noqa: E402
import test_hub_query_verdict   # noqa: E402
import test_hub_pins            # noqa: E402
import test_hub_analyze         # noqa: E402
import test_hub_lsp             # noqa: E402
import test_hub_truth_analysis  # noqa: E402
import test_hub_fs_workspace    # noqa: E402
import test_hub_fs_io           # noqa: E402
import test_hub_fs_loop         # noqa: E402
import test_hub_cors            # noqa: E402  (pre-GitHub S1: CORS allowlist)
import test_hub_robustness      # noqa: E402  (pre-GitHub H-hub: H1/H2/H9/H10)

#: original Test01..Test11 order, then the S1 CORS module (pre-GitHub round) —
#: the aggregate runs exactly this sequence.
SUITE_MODULES = (
    test_hub_seam,
    test_hub_query_verdict,
    test_hub_pins,
    test_hub_analyze,
    test_hub_lsp,
    test_hub_truth_analysis,
    test_hub_fs_workspace,
    test_hub_fs_io,
    test_hub_fs_loop,
    test_hub_cors,
    test_hub_robustness,
)


def load_tests(loader, tests, pattern):
    suite = unittest.TestSuite()
    for mod in SUITE_MODULES:
        suite.addTests(loader.loadTestsFromModule(mod))
    return suite


if __name__ == "__main__":
    unittest.main(verbosity=2)
