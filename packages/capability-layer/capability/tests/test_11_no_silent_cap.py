"""Gate 11 — no silent caps (Operating Contract rule 8 / Probe Contract §5).

Any bound (top-N truncation, sampled repo, assembled inventory) is emitted as a
value lead the user can see.
"""

import unittest

from capability.tests import common


class TestNoSilentCap(unittest.TestCase):
    def test_reference_truncation_is_logged(self):
        cap = common.get_run("cap1")   # max_refs=1
        caps_ev = common.events_of(cap, "capability.probe.cap")
        self.assertEqual(len(caps_ev), 1)
        p = caps_ev[0]["payload"]
        self.assertEqual(p["cap"], 1)
        self.assertGreaterEqual(p["dropped"], 1)
        self.assertIn("truncated", p["what"])
        # and the truncated P5 result reflects the cap
        p5 = common.result_of(cap, "p5")
        self.assertEqual(len(p5["response"]), 1)

    def test_uncapped_run_emits_no_cap_lead(self):
        cap = common.get_run("ct")
        self.assertEqual(common.events_of(cap, "capability.probe.cap"), [])

    def test_library_inventory_nonuniformity_is_logged(self):
        for key in ("ct", "awk", "zigish"):
            cap = common.get_run(key)
            ev = common.events_of(cap, "capability.lib.nonuniform")
            self.assertEqual(len(ev), 1, key)
            self.assertIn("no 'list all libraries/APIs' primitive",
                          ev[0]["payload"]["note"])


if __name__ == "__main__":
    unittest.main()
