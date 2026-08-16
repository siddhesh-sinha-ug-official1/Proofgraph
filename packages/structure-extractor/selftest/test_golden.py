"""Golden-fixture gates, scip-snapshot style (§9): the Python dock passes only
if its edges match the golden file exactly — edge-for-edge, with matching
resolved/resolver/provenance — and the annotated-source snapshot diffs clean."""
import json
import unittest
from pathlib import Path

from harness import FIXTURES, edge_view, run_rich, run_skeleton, snapshot_render

GOLDEN = FIXTURES / "golden"


class TestGolden(unittest.TestCase):
    maxDiff = None

    def test_skeleton_edges_golden(self):
        got = edge_view(run_skeleton())
        want = json.loads((GOLDEN / "skeleton.edges.json").read_text(encoding="utf8"))
        self.assertEqual(got, want)

    def test_rich_edges_golden(self):
        got = edge_view(run_rich())
        want = json.loads((GOLDEN / "rich.edges.json").read_text(encoding="utf8"))
        self.assertEqual(got, want)

    def test_rich_snapshot_golden(self):
        got = snapshot_render(run_rich())
        want = (GOLDEN / "rich.snapshot").read_text(encoding="utf8")
        self.assertEqual(got, want)

    def test_moat_docks_lead_golden(self):
        # lean's G-tier golden is the tier-G REGRESSION gate (LEAN-DOCK round):
        # the placeholder behavior must stay byte-stable under a pinned G —
        # the stub default is now CT, so the tier is passed explicitly.
        from harness import force_tier_g, run_lang
        for sub in ("lean", "latex", "typst"):
            kw = {"capability_fn": force_tier_g} if sub == "lean" else {}
            got = edge_view(run_lang(sub, **kw))
            want = json.loads((GOLDEN / f"{sub}.edges.json").read_text(encoding="utf8"))
            self.assertEqual(got, want, sub)

    def test_lean_ct_edges_golden(self):
        # the CT driver path's edge set, frozen: exactly the kernel-resolved
        # proof_uses chain from fixtures/lean_ct (regenerate via gen_goldens.py)
        from harness import run_lang
        got = edge_view(run_lang("lean_ct"))
        want = json.loads((GOLDEN / "lean_ct.edges.json").read_text(encoding="utf8"))
        self.assertEqual(got, want)


if __name__ == "__main__":
    unittest.main()
