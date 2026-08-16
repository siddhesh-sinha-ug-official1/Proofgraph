"""Wall refusals (Phase 1): every rejection carries a NAMED failure class and
is probed BEFORE the raise.  Also proves the honest ceiling propagates (no
roots -> no unused claim; node-preimage verification honestly out of reach
from Node fields alone).  Split out of test_wall_conformance.py; shared
helpers in wall_testkit.py.
"""
import unittest

from context import A_ID, B_ID, C_ID, MODULE_ID, CELL_ROOT, run_cell

from src.ids import compute_edge_identity
from wall import (PROJECT_KINDS, QUERY_KINDS, WallRejection, create_wall)
from wall_testkit import make_lead, make_node, wall_events, wall_only


class TestWallRejections(unittest.TestCase):
    """Every refusal: NAMED failure class, probed BEFORE the raise."""

    @classmethod
    def setUpClass(cls):
        _, result = run_cell()
        cls.graph = result["graph"]

    def _fresh(self):
        return create_wall(CELL_ROOT), ([dict(n) for n in self.graph["nodes"]],
                                        [dict(e) for e in self.graph["edges"]])

    def assert_rejects(self, wall, failure_class, fn, *args, **kw):
        with self.assertRaises(WallRejection) as caught:
            fn(*args, **kw)
        self.assertEqual(caught.exception.failure_class, failure_class)
        return caught.exception

    def test_edge_id_mismatch_verify_not_mint(self):
        wall, (nodes, edges) = self._fresh()
        edges[0]["id"] = "e_" + "0" * 16  # format-valid, preimage-false
        self.assert_rejects(wall, "id-mismatch", wall.ingest, nodes, edges)
        p = wall_only(wall, "graph-model.wall.ingest.rejected")["payload"]
        self.assertEqual(p["failureClass"], "id-mismatch")
        v = wall_only(wall, "graph-model.wall.ingest.verify.edgeIds")["payload"]
        self.assertFalse(v["pass"])
        self.assertEqual(len(v["mismatches"]), 1)

    def test_lead_in_edges_segregation(self):
        wall, (nodes, edges) = self._fresh()
        edges.append(make_lead("calls", A_ID, "ghost"))  # resolved=false in edges[]
        self.assert_rejects(wall, "lead-in-edges", wall.ingest, nodes, edges)

    def test_resolved_edge_hidden_in_leads(self):
        wall, (nodes, edges) = self._fresh()
        self.assert_rejects(wall, "lead-in-edges", wall.ingest,
                            nodes, [], leads=edges)  # resolved=true in leads[]

    def test_lead_placeholder_violation(self):
        wall, (nodes, edges) = self._fresh()
        bad = make_lead("calls", A_ID, "ghost")
        bad["dstId"] = B_ID  # a lead pointing at a real node id: no placeholder
        bad["id"] = compute_edge_identity("calls", A_ID, B_ID)["edgeId"]
        self.assert_rejects(wall, "lead-placeholder-violation", wall.ingest,
                            nodes, edges, leads=[bad])

    def test_valid_lead_accepted_and_kept_out_of_queries(self):
        wall, (nodes, edges) = self._fresh()
        res = wall.ingest(nodes, edges, leads=[make_lead("calls", C_ID, "ghost")],
                          roots=[A_ID])
        self.assertEqual(res["leadCount"], 1)
        # the lead never enters the T3 graph: unused truth unchanged
        self.assertEqual(wall.query("unused")["unused"], [C_ID])
        self.assertEqual(len(wall.project("graph")["leads"]), 1)

    def test_fake_green_rejected_attested_green_allowed(self):
        # a green fill with no attested verdict source = the fake-green S4 forbids
        wall, _ = self._fresh()
        fake = make_node("n_" + "a" * 16, name="fake",
                         fill={"status": "green", "source": "skeleton:no-compiler-attached"})
        self.assert_rejects(wall, "fake-green", wall.ingest, [fake], [])
        g = wall_only(wall, "graph-model.wall.ingest.greenGuard")["payload"]
        self.assertTrue(g["requestedGreen"])
        self.assertFalse(g["allowedGreen"])
        # green WITH a checked origin and an attesting source passes the guard
        wall2 = create_wall(CELL_ROOT)
        ok = make_node("n_" + "b" * 16, name="proved", origin="checked",
                       fill={"status": "green", "source": "lean:kernel-verdict"})
        res = wall2.ingest([ok], [])
        self.assertTrue(res["accepted"])
        g2 = wall_only(wall2, "graph-model.wall.ingest.greenGuard")["payload"]
        self.assertTrue(g2["allowedGreen"])
        self.assertEqual(wall2.verdictOf("n_" + "b" * 16)["fill"]["status"], "green")

    def test_nonconformant_envelope_rejected(self):
        wall, (nodes, edges) = self._fresh()
        nodes[0]["id"] = "not-a-node-id"  # schema pattern violation
        self.assert_rejects(wall, "graphjson-nonconformant", wall.ingest,
                            nodes, edges)

    def test_node_id_collision(self):
        wall, (nodes, edges) = self._fresh()
        nodes.append(dict(nodes[1]))  # duplicate id: two nodes silently merging
        self.assert_rejects(wall, "id-collision", wall.ingest, nodes, edges)
        v = wall_only(wall, "graph-model.wall.ingest.verify.nodeIds")["payload"]
        self.assertFalse(v["pass"])
        self.assertEqual(v["duplicates"], [nodes[1]["id"]])

    def test_node_preimage_honest_bound_documented_not_faked(self):
        # Full node-preimage verification is IMPOSSIBLE from Node fields alone:
        # a format-valid id whose preimage no longer matches its (renamed) node
        # is ACCEPTED at the wall, by documented honest bound — the Phase-2
        # seam test closes it via extractor.t1.node.id probes. Never faked.
        wall, (nodes, edges) = self._fresh()
        nodes[1] = dict(nodes[1], name="renamed.beyond.recognition")
        res = wall.ingest(nodes, edges, roots=[A_ID])
        self.assertTrue(res["accepted"])
        v = wall_only(wall, "graph-model.wall.ingest.verify.nodeIds")["payload"]
        self.assertTrue(v["pass"])  # format+uniqueness only — the honest claim

    def test_unknown_root_rejected(self):
        wall, (nodes, edges) = self._fresh()
        self.assert_rejects(wall, "unknown-root", wall.ingest, nodes, edges,
                            roots=["n_" + "f" * 16])
        # the module container is not a valid root either (not a decl)
        wall2, (nodes2, edges2) = self._fresh()
        self.assert_rejects(wall2, "unknown-root", wall2.ingest, nodes2, edges2,
                            roots=[MODULE_ID])

    def test_no_roots_no_unused_claim(self):
        # roots are DECLARED, never inferred
        wall, (nodes, edges) = self._fresh()
        wall.ingest(nodes, edges)  # no roots declared
        self.assert_rejects(wall, "roots-undeclared", wall.query, "unused")
        self.assert_rejects(wall, "roots-undeclared", wall.query, "reachable")
        p = wall_events(wall, "graph-model.wall.query.rejected")[-1]["payload"]
        self.assertEqual(p["failureClass"], "roots-undeclared")
        # flat projection makes NO reachable/unused claim without roots
        for row in wall.project("flat"):
            self.assertIsNone(row["reachable"])
            self.assertIsNone(row["unused"])
        # but structure queries still work (no roots needed)
        self.assertTrue(wall.query("condensation")["isDAG"])

    def test_query_roots_arg_still_validated(self):
        wall, (nodes, edges) = self._fresh()
        wall.ingest(nodes, edges)
        declared = wall.query("reachable", roots=[A_ID])  # declared at query time
        self.assertEqual(sorted(declared["reachable"]), sorted([A_ID, B_ID]))
        self.assert_rejects(wall, "unknown-root", wall.query, "reachable",
                            roots=["n_" + "e" * 16])

    def test_no_graph_ingested(self):
        wall = create_wall(CELL_ROOT)
        self.assert_rejects(wall, "no-graph-ingested", wall.query, "sccs")
        self.assert_rejects(wall, "no-graph-ingested", wall.verdictOf, A_ID)
        self.assert_rejects(wall, "no-graph-ingested", wall.project, "flat")

    def test_unknown_kinds_named(self):
        wall, (nodes, edges) = self._fresh()
        wall.ingest(nodes, edges)
        self.assert_rejects(wall, "unknown-query", wall.query, "cycles")
        self.assert_rejects(wall, "unknown-projection", wall.project, "dot")
        self.assert_rejects(wall, "unknown-node", wall.verdictOf, "n_" + "d" * 16)
        self.assertEqual(QUERY_KINDS, ("reachable", "unused", "sccs", "condensation"))
        self.assertEqual(PROJECT_KINDS, ("graph", "flat", "text"))


if __name__ == "__main__":
    unittest.main()
