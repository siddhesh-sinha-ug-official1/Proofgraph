"""Gate 15c — WALL pins INSTANCE ISOLATION (Wave-B D1).

Before D1, WallPins was a static shim that delegated dump()/history() to
the cell's module-global _LAST — the LAST-RUN state.  Any subsequent
capability() call (a second language measured in the same process; a hub
POST /analyze standing up its own V1 feed; a wall test tearing down and
reingesting) silently overwrote every earlier wall.pins.history() reader.
analyze()'s snapshot_streams() iterated feed._walls, and every language's
snapshot came out equal to the SECOND-measured language's stream —
capability provenance misattributed at the diagnostic surface.

D1 binds WallPins to the wall INSTANCE's own bus + captured state.  This
gate proves it by rebinding _cap_mod._LAST under an already-constructed
wall and asserting the wall's own pins are UNCHANGED while the cell's
own module-global shim (_cap_mod.dump/.history — kept intact for
standalone callers) follows the rebind.

No pipeline re-run needed: the D1 defect surface is exactly _LAST being
replaced under the reader's feet; the test drives that condition
directly.  Uses the CT (yaddabinggiberish) fixture so no real toolchain
is required at gate time.
"""

import sys
import unittest

import capability.capability                # noqa: F401  (ensure submodule)
from capability import probes
from capability.tests import common
from capability.tests.wall_common import WALL

cap_mod = sys.modules["capability.capability"]


class TestWallPinsInstanceIsolation(unittest.TestCase):
    """One wall stood up; assert its pins do not follow _cap_mod._LAST."""

    @classmethod
    def setUpClass(cls):
        cls.wall = WALL["capability_wall"](
            "yaddabinggiberish",
            config={"work_dir": common.work_dir("wall-pins-isolation")})
        cls.addClassCleanup(cls.wall.shutdown)

    def test_wall_pins_do_not_follow_module_global_rebind(self):
        hist_before = self.wall.pins.history()
        dump_before = self.wall.pins.dump()
        # baseline: a real run produced non-empty evidence
        self.assertGreater(len(hist_before), 0)
        self.assertIsNotNone(dump_before["capability"])
        # Simulate a second measurement rebinding cell 2's module-global
        # LAST-RUN state (this is exactly what capability() does at line 53
        # of capability.py — _LAST["bus"]=bus; _LAST["state"]=state).
        saved_last = {"bus": cap_mod._LAST["bus"],
                      "state": cap_mod._LAST["state"]}
        cap_mod._LAST["bus"] = probes.ProbeBus()
        cap_mod._LAST["state"] = {
            "cache": None,
            "capability": {"lang": "OTHER_LANG", "tier": "G",
                           "paperTier": "G", "extractor": "other-lang@0"},
        }
        try:
            # The standalone shim FOLLOWS _LAST — this is its documented job
            # (kept intact for callers who genuinely want last-run global).
            self.assertNotEqual(cap_mod.dump()["capability"],
                                dump_before["capability"])
            self.assertEqual(cap_mod.history(), [])
            # The wall's OWN pins are UNCHANGED.  Pre-D1, both of these
            # would equal the rebound module-global — misattributing this
            # wall's diagnostic evidence to the intervening run.
            self.assertEqual(self.wall.pins.history(), hist_before)
            self.assertEqual(self.wall.pins.dump()["capability"],
                             dump_before["capability"])
            # dump()'s full shape stays stable (every documented field
            # served from the captured instance state, not from _LAST).
            after = self.wall.pins.dump()
            for k in ("discovery", "scorecard", "treewalk", "shimState",
                      "battery", "cache", "libInventory", "capability"):
                self.assertEqual(after[k], dump_before[k],
                                 f"wall.pins.dump()[{k!r}] followed _LAST")
        finally:
            cap_mod._LAST["bus"] = saved_last["bus"]
            cap_mod._LAST["state"] = saved_last["state"]


if __name__ == "__main__":
    unittest.main()
