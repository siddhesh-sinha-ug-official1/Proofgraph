"""Gate 7 — paperTier vs measured tier: the looks-deep-but-isn't shape.

zigish's README claims compiler reuse (paperTier=CT) but its server runs its own
analyzer and P2 yields no diagnostic — the returned Capability.tier must be the
MEASURED S, and the gap must be visible as a lead.
"""

import unittest

from capability.tests import common


class TestPaperVsMeasured(unittest.TestCase):
    def test_measured_overrides_paper(self):
        cap = common.get_run("zigish")
        self.assertEqual(cap.paperTier, "CT", "the README's claim")
        self.assertEqual(cap.tier, "S", "the probe's verdict")

    def test_the_gap_is_a_lead(self):
        cap = common.get_run("zigish")
        ev = common.events_of(cap, "capability.probe.measuredTier")
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]["payload"],
                         {"measuredTier": "S", "overrode": "CT"})

    def test_paper_tier_lead_recorded_the_claim(self):
        cap = common.get_run("zigish")
        ev = common.events_of(cap, "capability.score.paperTier")
        self.assertEqual(ev[0]["payload"], "CT")
        # and the claim's evidence is marked unverified
        s3 = common.events_of(cap, "capability.score.s3")[0]["payload"]
        self.assertIn("UNVERIFIED", s3["evidence"])

    def test_ct_run_has_no_gap(self):
        cap = common.get_run("ct")
        ev = common.events_of(cap, "capability.probe.measuredTier")
        self.assertEqual(ev[0]["payload"]["measuredTier"], "CT")

    def test_awk_paper_gap_also_visible(self):
        cap = common.get_run("awk")
        # paper says "there is a server" (S); the probe found only the grammar floor
        self.assertEqual(cap.paperTier, "S")
        self.assertEqual(cap.tier, "G")


if __name__ == "__main__":
    unittest.main()
