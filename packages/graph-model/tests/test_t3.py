"""S5 gates: the ONE T3 property (reachability-from-roots), the two-library
agreement, condensation-is-DAG, soundness honesty, and no silent caps."""
import unittest

from context import A_ID, B_ID, C_ID, MODULE_ID, only, run_cell


class TestT3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell()

    def test_universe_excludes_module_container(self):
        p = only(self.cell, "graph-model.t3.universe")["payload"]
        self.assertEqual(sorted(p["declNodeIds"]), sorted([A_ID, B_ID, C_ID]))
        self.assertEqual(p["excluded"], [MODULE_ID])
        self.assertIn("not containers", p["reason"])

    def test_roots_declared(self):
        p = only(self.cell, "graph-model.t3.roots")["payload"]
        self.assertEqual(p, {"rootIds": [A_ID], "source": "declared"})

    def test_only_resolved_edges_entered(self):
        p = only(self.cell, "graph-model.t3.rustworkx.build.edgesIn")["payload"]
        self.assertTrue(p["usedOnlyResolved"])
        self.assertEqual(p["edgeCount"], 1)

    def test_property_correctness_c_is_unused(self):
        # the whole point of the fixture: hand-labeled expectation {C}
        unused = only(self.cell, "graph-model.t3.rustworkx.unused")["payload"]
        self.assertEqual(unused["unusedSet"], [C_ID])
        reachable = only(self.cell, "graph-model.t3.rustworkx.reachable")["payload"]
        self.assertEqual(sorted(reachable["reachableSet"]), sorted([A_ID, B_ID]))

    def test_two_library_agreement(self):
        # failure-class=t3-library-disagreement
        p = only(self.cell, "graph-model.t3.crosscheck.reachable")["payload"]
        self.assertTrue(p["agree"])
        self.assertEqual(p["symmetricDiff"], [])
        self.assertEqual(sorted(p["rustworkx"]), sorted(p["networkx"]))
        nx_unused = only(self.cell, "graph-model.t3.networkx.unused")["payload"]
        self.assertEqual(nx_unused["unusedSet"], [C_ID])

    def test_scc_and_condensation(self):
        # failure-class=condensation-not-dag; acyclic fixture => all singletons
        rw = only(self.cell, "graph-model.t3.scc.rustworkx")["payload"]["sccs"]
        nx = only(self.cell, "graph-model.t3.scc.networkx")["payload"]["sccs"]
        self.assertEqual(rw, nx)
        self.assertEqual(rw, sorted([[A_ID], [B_ID], [C_ID]]))
        p = only(self.cell, "graph-model.t3.condensation.isDAG")["payload"]
        self.assertTrue(p["isDAG"])

    def test_soundness_honesty(self):
        t3 = only(self.cell, "graph-model.t3.result")["payload"]
        self.assertEqual(t3["blindSpots"],
                         ["dynamic dispatch", "reflection", "dynamic import"])
        self.assertIn("only as complete as the resolved edge set",
                      t3["soundnessNote"])
        self.assertEqual(t3["property"], "reachability-from-roots")
        self.assertEqual(t3["library"], "rustworkx")
        self.assertEqual(t3["crosscheck"],
                         {"library": "networkx", "agrees": True, "symmetricDiff": []})
        self.assertTrue(t3["scc"]["condensationIsDAG"])

    def test_no_silent_caps(self):
        # rule 8: bounds are logged even when null
        p = only(self.cell, "graph-model.t3.cap")["payload"]
        self.assertIn("johnsonLengthBound", p)
        self.assertIn("nodeCap", p)
        self.assertIsNone(p["johnsonLengthBound"])
        self.assertIsNone(p["nodeCap"])
        self.assertTrue(p["note"])

    def test_t3result_matches_appendix_b5(self):
        t3 = self.result["t3Result"]
        self.assertEqual(t3["roots"], [A_ID])
        self.assertEqual(sorted(t3["reachable"]), sorted([A_ID, B_ID]))
        self.assertEqual(t3["unused"], [C_ID])
        self.assertEqual(t3["caps"], {"johnsonLengthBound": None, "nodeCap": None})


if __name__ == "__main__":
    unittest.main()
