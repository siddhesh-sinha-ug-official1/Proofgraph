"""Gate 15b — WALL conformance, the driven runs (split from Gate 15 SUB200;
the statics live in test_15_wall_conformance.py, the shared exec-loader in
wall_common.py — one wall namespace is shared by both files, exactly as the
original single-file gate had it).

Drives the wall on the CT language and on zigish, then asserts face == pins
field by field, that the fake-green protections hold THROUGH the wall, and
that shutdown() terminates the live LSP child — no leaked process.
"""

import sys
import unittest

import capability.capability               # noqa: F401  (ensure submodule)
from capability import probes, schema
from capability.handle import Handle
from capability.tests import common
from capability.tests.wall_common import WALL, _events

# the module, not the function (the package __init__ rebinds the name)
cap_mod = sys.modules["capability.capability"]


class TestWallConformanceCT(unittest.TestCase):
    """Drive the wall on the CT language; assert face == pins, then prove
    shutdown() leaves no leaked LSP child process."""

    @classmethod
    def setUpClass(cls):
        cls.wall = WALL["capability_wall"](
            "yaddabinggiberish", config={"work_dir": common.work_dir("wall-ct")})
        # pins snapshot taken immediately after the drive (this run is the
        # last run — the wall's own concurrency bound makes this well-defined)
        cls.hist = cap_mod.history()
        cls.dumped = cap_mod.dump()
        cls.addClassCleanup(cls.wall.shutdown)   # idempotent safety net

    def test_01_face_identity(self):
        w = self.wall
        self.assertIs(w.known, True)
        self.assertEqual(w.lang, "yaddabinggiberish")
        self.assertEqual(w.wallVersion, "capability-layer-wall/1.0.0")
        self.assertEqual(w.schemaPin,
                         {"schemaVersion": "v0",
                          "schemaHash": WALL["PINNED_SCHEMA_HASH"]})

    def test_02_tier_equals_measured_tier_pin(self):
        ev = _events(self.hist, "capability.probe.measuredTier")
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]["payload"]["measuredTier"], self.wall.tier)
        self.assertEqual(self.wall.tier, "CT")

    def test_03_paper_tier_equals_scorecard_pin(self):
        ev = _events(self.hist, "capability.score.paperTier")
        self.assertEqual(ev[0]["payload"], self.wall.paperTier)

    def test_04_honest_ceiling_is_the_canonical_table_entry(self):
        self.assertEqual(self.wall.honestCeiling,
                         schema.HONEST_CEILINGS[self.wall.tier])

    def test_05_green_allowed_consistency_with_faked_pin(self):
        faked = _events(self.hist, "capability.probe.faked")[0]["payload"]
        rep = self.wall.probeReport
        self.assertEqual(faked["tier"], self.wall.tier)
        self.assertEqual(faked["p2"], rep["p2"])
        self.assertEqual(faked["greenAllowed"], rep["greenAllowed"])
        self.assertEqual(rep["greenAllowed"],
                         schema.green_allowed(self.wall.tier, rep["p2"]))
        self.assertTrue(rep["greenAllowed"], "CT+P2-pass must allow green")

    def test_06_probe_summary_matches_probe_pins(self):
        rep = self.wall.probeReport
        self.assertEqual(rep["measuredTier"], self.wall.tier)
        for entry in rep["probes"]:
            # summary carries verdicts only — evidence stays a pin
            self.assertEqual(set(entry), {"id", "ran", "verdict"})
            pin = _events(self.hist,
                          f"capability.probe.{entry['id'].lower()}")[-1]
            self.assertEqual(pin["payload"]["verdict"], entry["verdict"],
                             f"{entry['id']}: face diverged from pin")
            self.assertEqual(pin["payload"]["ran"], entry["ran"])

    def test_07_dump_capability_pin_matches_face(self):
        pin = self.dumped["capability"]
        self.assertEqual(pin["lang"], self.wall.lang)
        self.assertEqual(pin["tier"], self.wall.tier)
        self.assertEqual(pin["paperTier"], self.wall.paperTier)
        self.assertEqual(pin["extractor"], self.wall.provenance["extractor"])
        self.assertEqual(self.dumped["battery"]["measuredTier"], self.wall.tier)

    def test_08_provenance_resolved_obeys_ruling_2(self):
        self.assertEqual(self.wall.provenance["resolved"],
                         schema.DEPTH_ALLOWS_RESOLVED_EDGES[self.wall.tier])

    def test_09_handle_is_the_live_unwrapped_handle(self):
        h = self.wall.handle
        self.assertIsInstance(h, Handle)
        self.assertEqual(h.kind, "lsp")
        self.assertTrue(h.alive)
        uri = [u for u in h._client.docs if u.endswith("main.ybg")][0]
        resp = h.request("textDocument/hover",
                         {"textDocument": {"uri": uri},
                          "position": {"line": 4, "character": 4}})
        self.assertIn("y: Int", str(resp.get("result")))
        tree = h.parse("let a: Int = 1\n")   # the floor rides along
        self.assertEqual(tree.root_node.type, "source_file")

    def test_10_construct_lead_fired_on_this_runs_bus(self):
        ev = _events(self.hist, "capability.wall.construct")
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]["payload"],
                         {"wallVersion": WALL["WALL_VERSION"],
                          "lang": self.wall.lang, "tier": self.wall.tier,
                          "schemaVersion": "v0",
                          "schemaHash": WALL["PINNED_SCHEMA_HASH"]})

    def test_11_pins_accessor_delegates_to_the_quartet(self):
        pins = self.wall.pins
        self.assertEqual(pins.probeCatalog(), probes.probeCatalog())
        self.assertEqual(pins.dump()["capability"], self.dumped["capability"])
        h = pins.history()
        self.assertEqual(h[:len(self.hist)], self.hist)

    def test_zz_shutdown_terminates_the_lsp_child(self):
        client = self.wall.handle._client
        self.assertIsNotNone(client)
        self.assertIsNone(client.proc.poll(), "server died before shutdown?")
        seen = []
        untap = self.wall.pins.tap("capability.wall.shutdown", seen.append)
        try:
            self.wall.shutdown()
        finally:
            untap()
        # the no-leaked-process check: the child is REAPED, not orphaned
        self.assertIsNotNone(client.proc.poll(),
                             "wall.shutdown() leaked the LSP child process")
        self.assertFalse(self.wall.handle.alive)
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0]["payload"]["terminated"], True)
        self.assertEqual(seen[0]["payload"]["lang"], self.wall.lang)
        self.wall.shutdown()                 # idempotent: no second emit
        self.assertEqual(len(seen), 1)


class TestWallConformanceFakeGreen(unittest.TestCase):
    """zigish: looks-deep-but-isn't.  The trickster/fake-green protections
    must hold THROUGH the wall — paper CT, measured S, green forbidden."""

    @classmethod
    def setUpClass(cls):
        cls.wall = WALL["capability_wall"](
            "zigish", config={"work_dir": common.work_dir("wall-zigish")})
        cls.hist = cap_mod.history()
        cls.addClassCleanup(cls.wall.shutdown)

    def test_01_measured_overrides_paper_through_the_wall(self):
        self.assertEqual(self.wall.paperTier, "CT", "the README's claim")
        self.assertEqual(self.wall.tier, "S", "the probe's verdict")
        ev = _events(self.hist, "capability.probe.measuredTier")
        self.assertEqual(ev[0]["payload"],
                         {"measuredTier": "S", "overrode": "CT"})

    def test_02_green_stays_forbidden_through_the_wall(self):
        rep = self.wall.probeReport
        self.assertEqual(rep["p2"], "fail")
        self.assertFalse(rep["greenAllowed"],
                         "a P2-fail run surfaced green through the wall")
        faked = _events(self.hist, "capability.probe.faked")[0]["payload"]
        self.assertFalse(faked["greenAllowed"])
        self.assertFalse(schema.green_allowed(self.wall.tier, rep["p2"]))

    def test_03_honest_ceiling_is_reduced_never_inflated(self):
        self.assertEqual(self.wall.honestCeiling, schema.HONEST_CEILINGS["S"])
        self.assertIn("green forbidden", self.wall.honestCeiling)
        self.assertNotEqual(self.wall.honestCeiling,
                            schema.HONEST_CEILINGS["CT"])

    def test_04_s_tier_may_not_emit_resolved_edges(self):
        # assembly ruling 2, visible on the face neighbors consume
        self.assertIs(self.wall.provenance["resolved"], False)


if __name__ == "__main__":
    unittest.main()
