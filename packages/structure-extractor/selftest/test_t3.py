"""T3 gates: two-library agreement, condensation-is-DAG, unused vs
unreferenced kept distinct, soundness flag beside every unused claim,
language-specific import-cycle N/A branches, caps logged."""
import unittest

from harness import one_payload, payloads, run_lang, run_rich, run_skeleton


class TestTwoLibraryAgreement(unittest.TestCase):
    def test_agreement_empty_diff_skeleton(self):
        cell = run_skeleton()
        p = one_payload(cell, "extractor.t3.agreement.diff")
        self.assertTrue(p["agree"])
        self.assertEqual(p["diff"], {"onlyInRustworkx": [], "onlyInNetworkx": []})

    def test_agreement_and_cycle_on_rich(self):
        cell = run_rich()
        p = one_payload(cell, "extractor.t3.agreement.diff")
        self.assertTrue(p["agree"], p["diff"])
        sccs = one_payload(cell, "extractor.t3.scc.tarjan")
        self.assertEqual(sccs["multiNodeSccCount"], 1)
        self.assertEqual({frozenset(c) for c in sccs["sccs"]},
                         {frozenset({"richpkg.core", "richpkg.helpers"})})
        cycles = one_payload(cell, "extractor.t3.cycle.johnson")["cycles"]
        self.assertEqual([sorted(c) for c in cycles],
                         [["richpkg.core", "richpkg.helpers"]])

    def test_condensation_is_dag(self):
        for cell in (run_skeleton(), run_rich()):
            self.assertTrue(one_payload(cell, "extractor.t3.condensation.dag")
                            ["condensationIsDag"])


class TestUnusedSemantics(unittest.TestCase):
    def test_unused_vs_unreferenced_distinct(self):
        cell = run_rich()
        unused = set(one_payload(cell, "extractor.t3.unused.complement")["unusedSet"])
        unref = set(one_payload(cell, "extractor.t3.unreferenced")["unreferencedSet"])
        self.assertNotEqual(unused, unref)
        # alpha is a root: unreferenced (nothing calls it) but NOT unused
        self.assertIn("richpkg.core.alpha", unref)
        self.assertNotIn("richpkg.core.alpha", unused)

    def test_dynamic_import_blindspot_shows_in_unused(self):
        # plugin is loaded ONLY via importlib -> the missing dynamic edge makes
        # it look dead: exactly the §5.10 soundness story, and the blind-spot
        # probe must ship beside the claim.
        cell = run_rich()
        unused = one_payload(cell, "extractor.t3.unused.complement")["unusedSet"]
        self.assertIn("richpkg.plugin", unused)
        history = cell.history(strip_wall=True)
        i_unused = next(i for i, e in enumerate(history)
                        if e["probeId"] == "extractor.t3.unused.complement")
        blind = [e for e in history if e["probeId"] == "extractor.t3.soundness.blindspots"]
        self.assertTrue(blind, "unused claim without soundness blind-spots probe")
        self.assertEqual(set(blind[0]["payload"]["missingEdgeClasses"]),
                         {"dynamic dispatch", "reflection", "dependency injection",
                          "dynamic imports"})
        self.assertGreater(next(i for i, e in enumerate(history)
                                if e["probeId"] == "extractor.t3.soundness.blindspots"),
                           i_unused)

    def test_roots_are_an_explicit_probed_decision(self):
        cell = run_rich()
        p = one_payload(cell, "extractor.t3.roots.selected")
        self.assertEqual(sorted(p["roots"]),
                         ["richpkg.core", "richpkg.core.alpha", "richpkg.dyn",
                          "richpkg.models"])
        self.assertIn("wrong root set silently inflates unused", p["reason"])

    def test_no_roots_means_no_unused_claim(self):
        cell = run_skeleton(roots=[])
        self.assertEqual(payloads(cell, "extractor.t3.unused.complement"), [])
        p = one_payload(cell, "extractor.t3.roots.selected")
        self.assertEqual(p["roots"], [])


class TestBranchesAndCaps(unittest.TestCase):
    def test_lean_import_cycle_na_branch(self):
        cell = run_lang("lean", roots=["Basic"])
        na = payloads(cell, "extractor.t2.lean.import.cycle.na")
        self.assertTrue(na and "DAG by construction" in na[0]["reason"])
        t3_na = payloads(cell, "extractor.t3.import.cycle.na")
        self.assertTrue(any(p["lang"] == "lean" for p in t3_na))

    def test_go_import_cycle_na_branch(self):
        cell = run_lang("go", roots=["main"])
        t3_na = payloads(cell, "extractor.t3.import.cycle.na")
        self.assertTrue(any(p["lang"] == "go" for p in t3_na))

    def test_johnson_bound_cap_logged(self):
        cell = run_rich()
        cap = one_payload(cell, "extractor.t3.cycle.bound.cap")
        self.assertEqual(cap["lengthBound"], 8)
        self.assertFalse(cap["truncated"])

    def test_ingest_exclusion_cap_logged(self):
        cell = run_skeleton()
        caps = payloads(cell, "extractor.cap.applied")
        excl = [c for c in caps if c["capName"] == "ingest.exclude-names"]
        self.assertTrue(excl and "pkg/__init__.py" in excl[0]["dropped"])


if __name__ == "__main__":
    unittest.main()
