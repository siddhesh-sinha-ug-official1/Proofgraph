"""REAL-INPUTS suite part 3 — real lean semantics: collision regression,
ruling 8, guards, ceilings (SUB200 split of test_real_inputs.py; tests
verbatim — the continuation of Test02RealLeanToolchainSource in
test_real_inputs_lean.py, regrouped under Test03RealLeanSemantics; 12 lean
tests total, unchanged).

Run standalone or via the test_real_inputs.py aggregator.
"""
from __future__ import annotations

import unittest

import ow_real_shared as shared
from ow_real_shared import names_of

from outerwall import provenance as prov_mod

LEAN: dict


def setUpModule():
    global LEAN
    LEAN = shared.lean_session()


class Test03RealLeanSemantics(unittest.TestCase):
    """The collision regression + ruling 8 over a REAL DAG + the riding
    limits (Test02's semantics half — same fixtures, same frozen facts)."""

    def test_classical_collision_regression_stays_inverted(self):
        """THE frozen regression for the REAL-INPUTS cell-3 fix (measured
        bug: raw last-component matching let the last writer win).  In
        Init/Classical.lean, `choose` (namespace Classical) and top-level
        `Exists.choose` collide on 'choose':
          * each node carries ITS OWN attestation;
          * Classical.em's kernel refs resolve to Classical.choose (the
            decl its proof REALLY uses), never to Exists.choose;
          * the real dependency Exists.choose -> Classical.choose EXISTS
            (pre-fix it self-rejected because both names hit one node)."""
        a = LEAN["analysis"]
        by_name = {n["name"]: n for n in a["graph"]["nodes"]}
        self.assertIn("decl=Classical.choose ",
                      by_name["Classical.choose"]["fill"]["source"])
        self.assertIn("decl=Exists.choose ",
                      by_name["Classical.Exists.choose"]["fill"]["source"])
        self.assertIn("decl=Classical.choose_spec ",
                      by_name["Classical.choose_spec"]["fill"]["source"])
        nm = names_of(LEAN)
        edges = {(nm[e["srcId"]], nm[e["dstId"]])
                 for e in a["graph"]["edges"]}
        self.assertIn(("Classical.em", "Classical.choose"), edges)
        self.assertIn(("Classical.em", "Classical.choose_spec"), edges)
        self.assertNotIn(("Classical.em", "Classical.Exists.choose"), edges,
                         "the crossed edge — the regressed bug signature")
        self.assertIn(("Classical.Exists.choose", "Classical.choose"), edges)
        # and the compact ByCases intra-file dependency, frozen
        self.assertIn(("ByCases.apply_ite", "ByCases.apply_dite"), edges)
        # every driver-decl assignment was probed (the decl.match lead)
        matches = [e for e in LEAN["extractorWall"].pins.history()
                   if e.get("probeId") == "extractor.t2.lean.decl.match"]
        self.assertTrue(matches)
        matched = {e["payload"]["decl"]: e["payload"]["nodeId"]
                   for e in matches if e["payload"]["outcome"] == "matched"}
        self.assertEqual(matched["Classical.choose"],
                         by_name["Classical.choose"]["id"])
        self.assertEqual(matched["Exists.choose"],
                         by_name["Classical.Exists.choose"]["id"])

    def test_ruling8_green_rings_over_real_dag(self):
        """Ruling 8 over a REAL dependency DAG — richer than any demo
        fixture, frozen as measured:
          * an all-THEOREM green base rings GREEN (apply_ite over
            apply_dite: worstOf ['lemma']);
          * a base containing a green DEF rings BLUE (ruling 1: definition
            → blue, composed through ruling 8): Classical.em's proof
            reaches the def `choose`, so em rings blue with worstOf
            ['definition','lemma'] — honestly saying 'this theorem stands
            on a definition', never upgrading to green;
          * modules stay unknown/none."""
        a = LEAN["analysis"]
        by_name = {n["name"]: n for n in a["graph"]["nodes"]}
        self.assertEqual(by_name["Classical.em"]["outline"],
                         {"status": "blue",
                          "worstOf": ["definition", "lemma"]})
        self.assertEqual(by_name["Classical.choose"]["kind"], "decl")
        self.assertEqual(by_name["Classical.choose"]["outline"],
                         {"status": "blue", "worstOf": ["definition"]})
        self.assertEqual(by_name["ByCases.apply_ite"]["outline"],
                         {"status": "green", "worstOf": ["lemma"]})
        self.assertEqual(by_name["SizeOfLemmas.Fin.sizeOf"]["outline"],
                         {"status": "green", "worstOf": ["lemma"]})
        for n in a["graph"]["nodes"]:
            if n["kind"] == "module":
                self.assertEqual(n["outline"],
                                 {"status": "unknown", "worstOf": ["none"]})
        # face == pins everywhere
        wall = LEAN["modelWall"]
        for n in a["graph"]["nodes"]:
            self.assertEqual(a["verdicts"][n["id"]], wall.verdictOf(n["id"]))

    def test_green_guard_admitted_all_arriving_greens(self):
        """PINS alongside faces: the model wall's ingest greenGuard admitted
        every real green; no fake-green refusal fired anywhere."""
        hist = LEAN["modelWall"].pins.history()
        guard = [e for e in hist
                 if e.get("probeId") == "graph-model.wall.ingest.greenGuard"]
        self.assertTrue(guard)
        self.assertTrue(all(e["payload"].get("allowedGreen") is True
                            for e in guard))
        rejected = [e for e in hist
                    if e.get("probeId") == "graph-model.wall.ingest.rejected"]
        self.assertEqual(rejected, [])

    def test_ceiling_limits_and_divergence_still_ride(self):
        """Declared limits ride REAL outputs exactly as they ride fixture
        outputs: 9 driver limits verbatim, pin divergence declared, zero
        unused hypotheses on linter-clean toolchain source."""
        hc = LEAN["analysis"]["provenance"]["honestCeilings"]["lean"]
        self.assertEqual(len(hc["driverLimits"]), 9)
        self.assertIn("single-file driver", hc["driverLimits"][0])
        div = hc["toolchainPinDivergence"]
        self.assertEqual(div["driverPin"], "leanprover/lean4:v4.31.0")
        self.assertEqual(div["capabilityPin"], "leanprover/lean4:v4.32.0")
        self.assertEqual(hc["unusedHypothesesSummary"],
                         {"perDecl": {}, "totalFlagged": 0})

    def test_capability_lean_measured_ct(self):
        cap = LEAN["analysis"]["provenance"]["capability"]["lean"]
        self.assertEqual(cap["measuredBy"], "capability-layer")
        self.assertEqual(cap["tier"], "CT")
        self.assertEqual(cap["measuredTierPin"]["measuredTier"], "CT")

    def test_undeclared_roots_refuse_honestly(self):
        gap = LEAN["analysis"]["gapAnalysis"]
        self.assertTrue(gap["undeclared"])
        self.assertEqual(gap["reachability"]["wallRefusal"],
                         "roots-undeclared")

    def test_provenance_complete_no_holes(self):
        prov = LEAN["analysis"]["provenance"]
        graph = LEAN["analysis"]["graph"]
        prov_mod.assert_no_holes(graph, prov, LEAN["outerLog"])
        for n in graph["nodes"]:
            rec = prov["nodes"][n["id"]]
            for field in ("cell", "tier", "extractor", "resolved"):
                self.assertIsNotNone(rec[field], (n["id"], field))
        for row in graph["edges"]:
            rec = prov["edges"][row["id"]]
            for field in ("cell", "tier", "extractor", "resolved"):
                self.assertIsNotNone(rec[field], (row["id"], field))


if __name__ == "__main__":
    unittest.main(verbosity=2)
