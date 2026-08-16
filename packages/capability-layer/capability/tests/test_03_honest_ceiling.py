"""Gate 3 — the honest-ceiling test: green-may-not-be-faked, at the source.

greenAllowed ⇔ tier==CT ∧ P2 passed; the code path that would stamp CT without
a P2 pass must be unreachable (it raises HonestCeilingViolation).
"""

import unittest

from capability.probe import stamp_tier
from capability.schema import HonestCeilingViolation, green_allowed
from capability.tests import common


class TestHonestCeiling(unittest.TestCase):
    def test_ct_run_allows_green(self):
        cap = common.get_run("ct")
        faked = common.events_of(cap, "capability.probe.faked")
        self.assertEqual(len(faked), 1)
        self.assertEqual(faked[0]["payload"],
                         {"tier": "CT", "p2": "pass", "greenAllowed": True})

    def test_floor_run_forbids_green(self):
        cap = common.get_run("awk")
        faked = common.events_of(cap, "capability.probe.faked")
        self.assertEqual(faked[0]["payload"]["greenAllowed"], False)
        self.assertNotEqual(cap.tier, "CT")

    def test_structure_run_forbids_green(self):
        cap = common.get_run("zigish")
        faked = common.events_of(cap, "capability.probe.faked")
        self.assertEqual(faked[0]["payload"]["greenAllowed"], False)

    def test_ct_without_p2_is_unreachable(self):
        with self.assertRaises(HonestCeilingViolation):
            stamp_tier("CT", "fail")
        with self.assertRaises(HonestCeilingViolation):
            stamp_tier("CT", "skip")
        self.assertEqual(stamp_tier("CT", "pass"), "CT")
        self.assertEqual(stamp_tier("S", "fail"), "S")

    def test_green_allowed_truth_table(self):
        self.assertTrue(green_allowed("CT", "pass"))
        for tier in ("S", "G", "P"):
            self.assertFalse(green_allowed(tier, "pass"))
        for p2 in ("fail", "skip", "warn"):
            self.assertFalse(green_allowed("CT", p2))


if __name__ == "__main__":
    unittest.main()
