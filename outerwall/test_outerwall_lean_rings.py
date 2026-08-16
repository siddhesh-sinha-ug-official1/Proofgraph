"""OUTER-WALL suite part 3b — LEAN rings, ceilings + the doctored-green
guard (SUB200 split of test_outerwall.py; tests verbatim — the continuation
of Test03LeanVerdictArrival in test_outerwall_lean.py, regrouped under
Test03bLeanRingsAndGuards; 8 lean tests total, unchanged).

Run standalone or via the test_outerwall.py aggregator.
"""
from __future__ import annotations

import unittest
from copy import deepcopy

import ow_test_shared as shared

import outerwall

LEAN: dict
LEANCT: dict


def setUpModule():
    global LEAN, LEANCT
    LEAN = shared.session("LEAN")
    LEANCT = shared.session("LEANCT")


class Test03bLeanRingsAndGuards(unittest.TestCase):
    """Sorry->amber, ruling-8 green rings, riding limits, doctored-green
    rejection (Test03's second half — same sessions, same frozen facts)."""

    def test_sorry_decl_amber_never_green(self):
        """NEW (green-flow round): sorry coverage AT THE OUTER WALL — cell
        3's CT fixture carries sorry_case; amber arrives, never green."""
        a = LEANCT["analysis"]
        by_name = {n["name"]: n for n in a["graph"]["nodes"]}
        sorry = by_name["Verified.sorry_case"]
        self.assertEqual(sorry["fill"]["status"], "amber")
        self.assertIn("sorryAx", sorry["fill"]["source"])
        self.assertNotEqual(sorry["fill"]["status"], "green")
        # ruling 8: the amber fill contributes the amber token; ring amber
        self.assertEqual(sorry["outline"],
                         {"status": "amber", "worstOf": ["amber"]})
        # kernel-clean neighbours in the SAME file still earn green
        for name in ("Verified.base_fact", "Verified.uses_base",
                     "Verified.unused_hyp_case"):
            self.assertEqual(by_name[name]["fill"]["status"], "green", name)
        # and the resolved edge arrives here too
        kinds = {e["kind"] for e in a["graph"]["edges"]}
        self.assertIn("proof_uses", kinds)

    def test_ruling8_green_rings_on_real_kernel_greens(self):
        """RULING-8's first REAL exercise (green-flow round): green fills
        contribute kind-derived tokens — a green-based theorem over a green
        base rings GREEN now (worstOf ['lemma'], status green via
        WORST_TOKEN_TO_STATUS + FILL severity)."""
        a = LEAN["analysis"]
        by_name = {n["name"]: n for n in a["graph"]["nodes"]}
        # uses_base's base = {self, base_fact}, both green theorems -> lemma
        self.assertEqual(by_name["unused_hyp.uses_base"]["outline"],
                         {"status": "green", "worstOf": ["lemma"]})
        # reflexive base: base_fact alone rings green too
        self.assertEqual(by_name["unused_hyp.base_fact"]["outline"],
                         {"status": "green", "worstOf": ["lemma"]})
        # the unknown module stays STATUS-only: worstOf ['none'], unknown
        self.assertEqual(by_name["unused_hyp"]["outline"],
                         {"status": "unknown", "worstOf": ["none"]})
        # face == pins: verdicts rows equal node rows equal wall verdictOf
        wall = LEAN["modelWall"]
        for n in a["graph"]["nodes"]:
            self.assertEqual(a["verdicts"][n["id"]], wall.verdictOf(n["id"]))
            self.assertEqual(a["verdicts"][n["id"]]["outline"], n["outline"])
        # the filled graph still validates against the canonical schema
        conforms, errors = outerwall.validate_graph(a["graph"])
        self.assertTrue(conforms, errors)

    def test_lean_ceiling_declares_limits_and_pin_divergence(self):
        """NEW: the declared limits RIDE the output (standing rule) — driver
        limits verbatim, the toolchain pin divergence declared (not
        unified), unused hypotheses summarized."""
        hc = LEAN["analysis"]["provenance"]["honestCeilings"]["lean"]
        self.assertEqual(len(hc["driverLimits"]), 9)
        div = hc["toolchainPinDivergence"]
        self.assertEqual(div["driverPin"], "leanprover/lean4:v4.31.0")
        self.assertEqual(div["capabilityPin"], "leanprover/lean4:v4.32.0")
        self.assertIn("declared-not-unified", div["action"])
        summary = hc["unusedHypothesesSummary"]
        self.assertEqual(summary["perDecl"]["unused_hyp.lonely"], ["h2"])
        self.assertEqual(summary["perDecl"]["unused_hyp.uses_base"], ["h"])

    def test_unbacked_green_rejected_at_the_wall(self):
        """NEW guard companion: a DOCTORED green (no checker attestation)
        fails ingest at the SAME model wall that admitted the real greens —
        failure class fake-green, pinned; wall state survives the refusal."""
        a = LEAN["analysis"]
        wall = LEAN["modelWall"]
        doctored = deepcopy(a["graph"]["nodes"])
        victim = next(n for n in doctored if n["kind"] == "module")
        victim["fill"] = {"status": "green", "source": ""}   # no attestation
        with self.assertRaises(Exception) as cm:
            wall.ingest(doctored, a["graph"]["edges"], a["graph"]["leads"])
        self.assertEqual(getattr(cm.exception, "failure_class", None),
                         "fake-green")
        rejected = [e for e in wall.pins.history()
                    if e.get("probeId") == "graph-model.wall.ingest.rejected"]
        self.assertTrue(rejected)
        self.assertEqual(rejected[-1]["payload"]["failureClass"],
                         "fake-green")
        # the wall's committed state survived: verdicts still served
        v = wall.verdictOf(victim["id"])
        self.assertEqual(v["fill"]["status"], "unknown")


if __name__ == "__main__":
    unittest.main(verbosity=2)
