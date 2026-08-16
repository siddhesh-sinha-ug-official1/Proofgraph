"""S3–S4 self-tests, all asserting on probe output: edge creation taps, the
unresolved-lead path, the rejected-candidate path, and the honest ceiling
(green may never be faked).  (S1–S2 probe tests live in
test_pipeline_probes.py.)"""
import hashlib
import unittest

from context import (A_ID, B_ID, C_ID, EDGE_AB_ID, MODULE_ID,
                     events, only, payloads, run_cell)


class TestEdgeBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell()

    def test_resolved_edge_created_with_flag(self):
        creates = payloads(self.cell, "graph-model.edge.create")
        self.assertEqual(len(creates), 1)
        edge = creates[0]["edge"]
        self.assertEqual(edge["id"], EDGE_AB_ID)
        self.assertEqual((edge["srcId"], edge["dstId"]), (A_ID, B_ID))
        self.assertTrue(edge["resolved"])
        self.assertEqual(edge["resolver"], "skeleton.nameTable")
        self.assertEqual(edge["provenance"], {"tier": "T2",
                                              "extractor": "skeleton.nameTable"})

    def test_resolve_attempt_decision(self):
        p = only(self.cell, "graph-model.edge.resolve.attempt")["payload"]
        self.assertTrue(p["resolved"])
        self.assertEqual(p["chosenDstId"], B_ID)
        branch = only(self.cell, "graph-model.edge.resolve.resolved")["payload"]
        self.assertEqual(branch, {"srcId": A_ID, "dstId": B_ID,
                                  "resolver": "skeleton.nameTable"})
        self.assertEqual(events(self.cell, "graph-model.edge.resolve.unresolved"), [])

    def test_edge_hash_reproducible(self):
        inputs = only(self.cell, "graph-model.edge.id.inputs")["payload"]
        h = only(self.cell, "graph-model.edge.id.hash")["payload"]
        pre = "\x1f".join([inputs["domainTag"], inputs["kind"],
                           inputs["srcId"], inputs["dstId"]])
        full = hashlib.sha256(pre.encode("utf-8")).hexdigest()
        self.assertEqual(h["fullHex"], full)
        self.assertEqual(h["edgeId"], "e_" + full[:16])

    def test_resolved_set_split(self):
        p = only(self.cell, "graph-model.edge.resolvedSet")["payload"]
        self.assertEqual(len(p["resolvedEdges"]), 1)
        self.assertEqual(p["unresolvedLeads"], [])


class TestUnresolvedLead(unittest.TestCase):
    """Appendix B.8: a resolved=false lead is a LEAD, not an edge — it never
    enters the T3 graph and never sits in Graph.edges."""

    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell("fixtures/unresolved_ref.py",
                                        "fixtures/unresolved_ref.roots.json")

    def test_unresolved_branch_fires(self):
        p = only(self.cell, "graph-model.edge.resolve.unresolved")["payload"]
        self.assertEqual(p["reason"], "no name match")
        self.assertEqual(p["dstPlaceholder"], "unresolved:Z")
        self.assertEqual(p["resolver"], "")

    def test_lead_held_aside(self):
        p = only(self.cell, "graph-model.edge.resolvedSet")["payload"]
        self.assertEqual(p["resolvedEdges"], [])
        self.assertEqual(len(p["unresolvedLeads"]), 1)
        lead = p["unresolvedLeads"][0]
        self.assertFalse(lead["resolved"])
        self.assertEqual(lead["dstId"], "unresolved:Z")
        self.assertEqual(lead["resolver"], "")

    def test_lead_never_enters_t3_graph(self):
        p = only(self.cell, "graph-model.t3.rustworkx.build.edgesIn")["payload"]
        self.assertEqual(p["edges"], [])
        self.assertEqual(p["edgeCount"], 0)
        self.assertTrue(p["usedOnlyResolved"])

    def test_lead_carried_separately_in_graphjson(self):
        graph = self.result["graph"]
        self.assertEqual(graph["edges"], [])
        self.assertEqual(len(graph["leads"]), 1)
        self.assertFalse(graph["leads"][0]["resolved"])

    def test_d_still_reachable_as_root(self):
        t3 = self.result["t3Result"]
        self.assertEqual(len(t3["reachable"]), 1)
        self.assertEqual(t3["unused"], [])


class TestRejectedCandidate(unittest.TestCase):
    """A ref whose src is not a node is REJECTED (with the reason), not created."""

    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell("fixtures/rejected_ref.py",
                                        "fixtures/rejected_ref.roots.json")

    def test_rejected_probe_fires_with_reason(self):
        p = only(self.cell, "graph-model.edge.rejected")["payload"]
        self.assertIn("is not a node", p["reason"])
        self.assertEqual(p["candidate"]["fromDecl"], "rejected_ref.GHOST")
        self.assertEqual(events(self.cell, "graph-model.edge.create"), [])


class TestHonestCeiling(unittest.TestCase):
    """Rule 7: green may never be faked; unknown != green."""

    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell()

    def test_green_is_zero(self):
        # failure-class=fake-green
        counts = only(self.cell, "graph-model.fill.summary")["payload"]["counts"]
        self.assertEqual(counts, {"unknown": 4, "green": 0, "amber": 0,
                                  "red": 0, "blue": 0})
        self.assertNotEqual("unknown", "green")  # unknown != green, explicitly

    def test_no_node_is_green(self):
        for p in payloads(self.cell, "graph-model.node.create"):
            self.assertEqual(p["node"]["fill"]["status"], "unknown")
            self.assertEqual(p["node"]["fill"]["source"],
                             "skeleton:no-compiler-attached")

    def test_green_guard_structurally_forbids(self):
        guards = payloads(self.cell, "graph-model.fill.greenGuard")
        self.assertEqual(len(guards), 4)
        for g in guards:
            self.assertFalse(g["requestedGreen"])
            self.assertFalse(g["allowedGreen"])
            self.assertEqual(g["reason"], "no real verdict source")

    def test_origins(self):
        origins = {p["nodeId"]: p["origin"]
                   for p in payloads(self.cell, "graph-model.fill.origin")}
        self.assertEqual(origins[MODULE_ID], "given")
        for nid in (A_ID, B_ID, C_ID):
            self.assertEqual(origins[nid], "assumed")
        self.assertNotIn("checked", origins.values())

    def test_outline_deliberately_null(self):
        for p in payloads(self.cell, "graph-model.fill.outline"):
            self.assertIsNone(p["outline"])


if __name__ == "__main__":
    unittest.main()
