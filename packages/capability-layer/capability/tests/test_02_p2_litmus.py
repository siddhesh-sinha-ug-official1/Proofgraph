"""Gate 2 — the P2 compiler-truth litmus (the headline test). BOTH directions:

  * the wired ybg-lsp sees the injected type error → P2 pass → measured CT;
  * a structure-only stand-in (never runs `ybc check`) stays silent → P2 fail
    → measured tier ≤ S.

Assertions are on PROBE OUTPUT (contract §7), not just return values.
"""

import os
import unittest

from capability import probe as probe_mod
from capability import spine
from capability.fixtures import PROFILES
from capability.probes import ProbeBus
from capability.tests import common

_LAYER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
REPO = os.path.join(_LAYER_ROOT, "testbed", "ybg_repo")


class TestP2Litmus(unittest.TestCase):
    def test_ct_direction_injected_error_is_seen(self):
        cap = common.get_run("ct")
        inject = common.events_of(cap, "capability.probe.p2.inject")
        self.assertEqual(len(inject), 1)
        payload = inject[0]["payload"]
        self.assertIn('let x: Int = "nope"', payload["injected"])
        diags = payload["diagnostics"]
        self.assertTrue(diags, "P2 got no diagnostics back")
        self.assertEqual(diags[0]["severity"], 1)
        self.assertIn("type mismatch", diags[0]["message"])
        self.assertEqual(diags[0]["source"], "ybc")

        verdict = common.events_of(cap, "capability.probe.p2.verdict")
        self.assertEqual(verdict[0]["payload"], {"p2": "pass", "tier": "CT"})
        self.assertEqual(cap.tier, "CT")
        self.assertEqual(common.result_of(cap, "p2")["verdict"], "pass")

    def test_structure_direction_silence_means_not_ct(self):
        cap = common.get_run("zigish")
        inject = common.events_of(cap, "capability.probe.p2.inject")
        self.assertEqual(len(inject), 1)
        payload = inject[0]["payload"]
        self.assertIn('"nope"', payload["injected"])
        self.assertEqual(payload["diagnostics"], [],
                         "structure stand-in unexpectedly produced diagnostics")

        verdict = common.events_of(cap, "capability.probe.p2.verdict")
        self.assertEqual(verdict[0]["payload"]["p2"], "fail")
        self.assertIn(cap.tier, ("S", "G", "P"), "a P2 failure may not yield CT")
        self.assertEqual(cap.tier, "S")

    def test_p2_evidence_names_the_failure_class(self):
        cap = common.get_run("zigish")
        r = common.result_of(cap, "p2")
        self.assertEqual(r["verdict"], "fail")
        self.assertIn("does not run the real type checker", r["evidence"])

    def test_trickster_canned_error_cannot_earn_p2(self):
        # the fake-green attack: a server publishing the SAME canned error for
        # every document (clean or injected). P2 must not count it — a pass is
        # earned only by a NEW error anchored at the injected line.
        bus = ProbeBus()
        env = {"YBG_LSP_MODE": "trickster",
               "YBG_LSP_TMPDIR": common.work_dir("trickster")}
        client = None
        try:
            client = spine.wire(bus, file_ext=".ybg",
                                server_name="trickster-ls",
                                argv=spine.shim_argv(), env=env,
                                root_path=REPO)
            battery = probe_mod.run(
                bus, client=client, floor_handle=None, repo_root=REPO,
                profile=PROFILES["yaddabinggiberish"],
                config={"work_dir": common.work_dir("trickster"),
                        "max_refs": None},
                paper_tier="CT", floor_nanos=0)
            self.assertEqual(battery["p2"], "fail",
                             "a canned diagnostic bought a P2 pass")
            self.assertNotEqual(battery["measuredTier"], "CT")
            faked = [e for e in bus.history()
                     if e["probeId"] == "capability.probe.faked"]
            self.assertFalse(faked[0]["payload"]["greenAllowed"])
        finally:
            if client is not None:
                client.shutdown()


if __name__ == "__main__":
    unittest.main()
