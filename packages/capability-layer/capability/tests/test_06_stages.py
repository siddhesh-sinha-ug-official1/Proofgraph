"""Gate 6 — decision-tree determinism + stage-B/C/D unit coverage.

Same DiscoveryResult → same TreeWalk (by logicalClock), same chosenRung, same
rejected-rung reasons. Plus: the archived-server refusal branch, the license
veto, and the dynamic-typing ceiling.
"""

import unittest

from capability import discovery, fixtures, gate, score, tree
from capability.capability import _default_config
from capability.probes import ProbeBus
from capability.tests import common


def _run_a_to_d(lang):
    bus = ProbeBus()
    profile = fixtures.PROFILES[lang]
    cfg = {"ybc_argv": _default_config(lang, None)["ybc_argv"],
           "now": "2026-07-19"}
    disc = discovery.run(bus, profile, repo_root=".", config=cfg)
    survivors = gate.run(bus, disc, cfg)
    scorecard = score.run(bus, profile, disc, survivors)
    walk = tree.run(bus, profile, disc, survivors)
    return bus, disc, survivors, scorecard, walk


class TestTreeDeterminism(unittest.TestCase):
    def test_same_input_same_walk(self):
        for lang in ("awk", "yaddabinggiberish", "zigish"):
            bus1, _, _, sc1, walk1 = _run_a_to_d(lang)
            bus2, _, _, sc2, walk2 = _run_a_to_d(lang)
            self.assertEqual(common.normalize_stream(bus1.history()),
                             common.normalize_stream(bus2.history()),
                             f"probe streams diverged for {lang}")
            self.assertEqual(walk1["chosenRung"], walk2["chosenRung"])
            self.assertEqual(sc1, sc2)

    def test_rejected_rungs_carry_reasons(self):
        bus, _, _, _, walk = _run_a_to_d("awk")
        self.assertEqual(walk["chosenRung"], "grammar")
        rejected = [e for e in bus.history()
                    if e["probeId"] == "capability.tree.rejected"]
        rejected_rungs = {e["payload"]["rung"] for e in rejected}
        self.assertEqual(rejected_rungs, {"official", "community", "structure"})
        for e in rejected:
            self.assertTrue(e["payload"]["whyRejected"],
                            f"empty rejection reason for {e['payload']['rung']}")
        # the awk structure rejection must name the no-semantic-layer fact
        structure = [e for e in rejected if e["payload"]["rung"] == "structure"][0]
        self.assertIn("no semantic layer", structure["payload"]["whyRejected"])

    def test_dynamic_ceiling_fires_for_awk(self):
        bus, _, _, _, _ = _run_a_to_d("awk")
        ev = [e for e in bus.history()
              if e["probeId"] == "capability.tree.dynamicCeiling"]
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]["payload"]["cappedAt"], "S")

    def test_extras_collected_at_every_node(self):
        for lang in ("awk", "yaddabinggiberish", "zigish"):
            bus, _, _, _, walk = _run_a_to_d(lang)
            ev = [e for e in bus.history()
                  if e["probeId"] == "capability.tree.extras"]
            self.assertEqual(len(ev), 1, lang)
            self.assertIn("grammar", ev[0]["payload"])
            self.assertIn("scip", ev[0]["payload"])


class TestGateBranches(unittest.TestCase):
    def _gate(self, candidates):
        bus = ProbeBus()
        disc = {"candidates": candidates}
        survivors = gate.run(bus, disc, {"now": "2026-07-19"})
        return bus, survivors

    def test_archived_server_is_refused(self):
        bus, survivors = self._gate([{
            "name": "erlang_ls", "steward": "community", "source": "github",
            "lastRelease": "2025-06-01", "lastCommit": "2025-08-01",
            "license": "Apache-2.0", "reusesCompiler": True}])
        self.assertEqual(survivors, [])
        archived = [e for e in bus.history()
                    if e["probeId"] == "capability.gate.archived"]
        self.assertEqual(len(archived), 1)
        self.assertEqual(archived[0]["payload"]["candidate"], "erlang_ls")

    def test_license_veto_drops_a_deep_server(self):
        bus, survivors = self._gate([{
            "name": "deep-but-locked", "steward": "vendor", "source": "docs",
            "lastRelease": "2026-06-01", "lastCommit": "2026-07-01",
            "license": "BUSL", "reusesCompiler": True}])
        self.assertEqual(survivors, [])
        lic = [e for e in bus.history()
               if e["probeId"] == "capability.gate.license"]
        self.assertEqual(lic[0]["payload"]["verdict"], "veto")

    def test_copyleft_is_subprocess_only_not_vetoed(self):
        bus, survivors = self._gate([{
            "name": "gpl-server", "steward": "community", "source": "github",
            "lastRelease": "2026-06-01", "lastCommit": "2026-07-01",
            "license": "GPL-3.0", "reusesCompiler": False,
            "semanticLayer": True}])
        self.assertEqual(len(survivors), 1)
        self.assertEqual(survivors[0]["licenseVerdict"], "subprocess-only")

    def test_stale_sole_option_kept_with_reason(self):
        bus, survivors = self._gate([{
            "name": "only-choice", "steward": "community", "source": "github",
            "lastRelease": "2023-01-01", "lastCommit": "2023-06-01",
            "license": "MIT", "reusesCompiler": False, "semanticLayer": True}])
        self.assertEqual(len(survivors), 1)
        maint = [e for e in bus.history()
                 if e["probeId"] == "capability.gate.maintenance"][0]
        self.assertEqual(maint["payload"]["verdict"], "keep")
        self.assertIn("nothing else exists", maint["payload"]["reason"])

    def test_stale_with_alternatives_dropped(self):
        bus, survivors = self._gate([
            {"name": "stale-one", "steward": "c", "source": "g",
             "lastRelease": "2022-01-01", "lastCommit": "2022-06-01",
             "license": "MIT", "reusesCompiler": False, "semanticLayer": True},
            {"name": "fresh-one", "steward": "c", "source": "g",
             "lastRelease": "2026-06-01", "lastCommit": "2026-07-01",
             "license": "MIT", "reusesCompiler": False, "semanticLayer": True}])
        self.assertEqual([s["name"] for s in survivors], ["fresh-one"])


if __name__ == "__main__":
    unittest.main()
