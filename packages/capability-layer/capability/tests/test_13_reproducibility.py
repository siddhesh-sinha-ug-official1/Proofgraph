"""Gate 13 — dump()/history() reproducibility (Probe Contract §4/§6).

Same input twice → identical history() ordering by logicalClock (wallNanos and
pids normalized — real time is a separate field, never used for ordering).
dump() returns the full internal state.
"""

import unittest

from capability import capability, dump, history
from capability.tests import common


class TestReproducibility(unittest.TestCase):
    def test_full_pipeline_probe_stream_reproduces(self):
        cap1 = common.get_run("ct")
        cap2 = common.get_run("ct2")   # identical config, fresh run
        s1 = common.normalize_stream(cap1.probeStream)
        s2 = common.normalize_stream(cap2.probeStream)
        self.assertEqual(len(s1), len(s2), "stream lengths diverged")
        for a, b in zip(s1, s2):
            self.assertEqual(a, b,
                             f"streams diverged at clock {a['logicalClock']}: "
                             f"{a['probeId']} vs {b['probeId']}")

    def test_dump_returns_entire_internal_state(self):
        common.get_run("ct2")  # ensure the module-level LAST run is a full one
        d = dump()
        for key in ("discovery", "scorecard", "treewalk", "shimState",
                    "battery", "cache", "libInventory", "capability"):
            self.assertIn(key, d)
        self.assertEqual(d["battery"]["measuredTier"], "CT")
        self.assertEqual(d["shimState"]["positionEncoding"], "utf-8")
        self.assertTrue(d["cache"], "cache keys missing from dump")
        self.assertEqual(d["scorecard"]["paperTier"], "CT")
        self.assertTrue(d["treewalk"]["chosenRung"])

    def test_history_matches_last_run_stream(self):
        cap2 = common.get_run("ct2")
        h = history()
        self.assertEqual(common.normalize_stream(h),
                         common.normalize_stream(cap2.probeStream))
        clocks = [e["logicalClock"] for e in h]
        self.assertEqual(clocks, list(range(len(h))))

    def test_z_last_run_semantics_are_falsifiable(self):
        # runs LAST in this class (name-ordered): a DISTINGUISHABLE pipeline is
        # executed now, and dump()/history() must reflect IT — a stuck-_LAST
        # regression cannot hide behind identical ct/ct2 runs
        cap = capability("awk", config={"work_dir": common.work_dir("last-awk")})
        try:
            self.assertEqual(common.normalize_stream(history()),
                             common.normalize_stream(cap.probeStream))
            self.assertEqual(dump()["capability"]["lang"], "awk")
            self.assertEqual(dump()["battery"]["measuredTier"], "G")
        finally:
            cap.handle.shutdown()


if __name__ == "__main__":
    unittest.main()
