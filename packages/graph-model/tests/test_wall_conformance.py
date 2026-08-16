"""Wall conformance (Phase 1): pins vs face.

Drives the wall (ingest/query/project/verdictOf), then reads the PINS — the
cell's own probe stream and dump — and asserts the pin-level truth equals what
the wall declared.  Declared behavior may never diverge from probed behavior.

Companions (split by cohesion): test_wall_standsup.py (construction + additive
catalog), test_wall_rejections.py (named failure classes); shared helpers in
wall_testkit.py.
"""
import unittest

from context import A_ID, B_ID, C_ID, MODULE_ID, CELL_ROOT, only, run_cell

from wall import WALL_VERSION, WallRejection, create_wall
from wall_testkit import wall_events, wall_only


class TestWallConformance(unittest.TestCase):
    """Ingest the cell's own canonical-minted graph, then assert every wall
    answer equals the pin-stream/dump truth (both the cell's original T3 pins
    and the wall's own wall.* pins)."""

    @classmethod
    def setUpClass(cls):
        cls.cell, result = run_cell()          # the pin-level source of truth
        cls.graph = result["graph"]            # canonical-minted envelope
        cls.wall = create_wall(CELL_ROOT)
        cls.ingest_result = cls.wall.ingest(
            cls.graph["nodes"], cls.graph["edges"], cls.graph["leads"],
            roots=[A_ID])

    def test_ingest_accepted_pin_equals_face(self):
        p = wall_only(self.wall, "graph-model.wall.ingest.accepted")["payload"]
        self.assertEqual(p["nodeCount"], self.ingest_result["nodeCount"])
        self.assertEqual(p["edgeCount"], self.ingest_result["edgeCount"])
        self.assertEqual(p["leadCount"], self.ingest_result["leadCount"])
        self.assertEqual(p["rootIds"], [A_ID])
        self.assertEqual(self.ingest_result["accepted"], True)
        self.assertEqual((p["nodeCount"], p["edgeCount"], p["leadCount"]), (4, 1, 0))
        # the verify pins fired and passed
        for pid in ("graph-model.wall.ingest.verify.nodeIds",
                    "graph-model.wall.ingest.verify.edgeIds",
                    "graph-model.wall.ingest.verify.leads"):
            self.assertTrue(wall_only(self.wall, pid)["payload"]["pass"])

    def test_query_unused_equals_cell_pin_truth(self):
        declared = self.wall.query("unused")
        # face == the CELL's own t3 probe truth for the same graph
        cell_pin = only(self.cell, "graph-model.t3.rustworkx.unused")["payload"]
        self.assertEqual(declared["unused"], cell_pin["unusedSet"])
        self.assertEqual(declared["unused"], [C_ID])
        # face == the WALL's own pin (declared may never diverge from probed)
        wall_pin = wall_events(self.wall, "graph-model.wall.query")[-1]["payload"]
        self.assertEqual(wall_pin["kind"], "unused")
        self.assertEqual(wall_pin["result"], declared)
        # the honest soundness caveat is carried inline, as in T3Result
        self.assertIn("soundnessNote", declared)
        self.assertIn("blindSpots", declared)

    def test_query_reachable_equals_cell_pin_truth(self):
        declared = self.wall.query("reachable")
        cell_pin = only(self.cell, "graph-model.t3.rustworkx.reachable")["payload"]
        self.assertEqual(declared["reachable"], cell_pin["reachableSet"])
        self.assertEqual(sorted(declared["reachable"]), sorted([A_ID, B_ID]))
        wall_pin = wall_events(self.wall, "graph-model.wall.query")[-1]["payload"]
        self.assertEqual(wall_pin["result"], declared)
        self.assertTrue(declared["crosscheck"]["agrees"])

    def test_sccs_and_condensation_equal_cell_pins(self):
        sccs = self.wall.query("sccs")
        cell_scc = only(self.cell, "graph-model.t3.scc.rustworkx")["payload"]
        self.assertEqual(sccs["sccs"], cell_scc["sccs"])
        cond = self.wall.query("condensation")
        cell_cond = only(self.cell, "graph-model.t3.condensation.isDAG")["payload"]
        self.assertEqual(cond["isDAG"], cell_cond["isDAG"])
        self.assertEqual(cond["condensationEdges"], cell_cond["condensationEdges"])
        self.assertTrue(cond["isDAG"])

    def test_verdict_equals_dump_and_pin(self):
        declared = self.wall.verdictOf(A_ID)
        # == the wall pin
        pin = wall_events(self.wall, "graph-model.wall.verdict")[-1]["payload"]
        self.assertEqual(pin["nodeId"], A_ID)
        self.assertEqual({"fill": pin["fill"], "outline": pin["outline"]}, declared)
        # == dump()'s node fill (pins.dump carries the ingested truth)
        dumped = self.wall.pins.dump()["wall"]["ingested"]["nodes"]
        node = next(n for n in dumped if n["id"] == A_ID)
        self.assertEqual(declared["fill"], node["fill"])
        self.assertEqual(declared["outline"], node["outline"])
        # honest ceiling: unknown stays unknown, outline null passes through
        self.assertEqual(declared["fill"]["status"], "unknown")
        self.assertIsNone(declared["outline"])
        # == the ORIGINAL cell's fill pin for the same node
        cell_fill = [e["payload"] for e in self.cell.history()
                     if e["probeId"] == "graph-model.fill.assign"
                     and e["payload"]["nodeId"] == A_ID]
        self.assertEqual(cell_fill[0]["status"], declared["fill"]["status"])

    def test_project_graph_is_canonical_and_byte_id_preserving(self):
        out = self.wall.project("graph")
        self.assertEqual(out["schemaVersion"], "v0")
        self.assertEqual(sorted(n["id"] for n in out["nodes"]),
                         sorted(n["id"] for n in self.graph["nodes"]))
        self.assertEqual([e["id"] for e in out["edges"]],
                         [e["id"] for e in self.graph["edges"]])
        self.assertEqual(out["leads"], [])
        # projection is a snapshot, not a live reference
        out["nodes"][0]["name"] = "tampered"
        self.assertNotEqual(self.wall.project("graph")["nodes"][0]["name"],
                            "tampered")

    def test_project_flat_labels_match_t3_pins_never_fill(self):
        rows = self.wall.project("flat")
        by_id = {r["id"]: r for r in rows}
        self.assertEqual(len(rows), 4)
        self.assertIsNone(by_id[MODULE_ID]["reachable"])  # container: no claim
        self.assertTrue(by_id[A_ID]["reachable"])
        self.assertTrue(by_id[B_ID]["reachable"])
        self.assertTrue(by_id[C_ID]["unused"])
        self.assertFalse(by_id[C_ID]["reachable"])
        for r in rows:  # T3-derived labels never leak into fill
            self.assertEqual(r["fill"]["status"], "unknown")

    def test_text_projection_honestly_refused(self):
        # failure-class=projection-unavailable-no-source: never a fake reprint
        with self.assertRaises(WallRejection) as caught:
            self.wall.project("text")
        self.assertEqual(caught.exception.failure_class,
                         "projection-unavailable-no-source")
        pins = wall_events(self.wall, "graph-model.wall.projection.refused")
        self.assertEqual(pins[-1]["payload"]["kind"], "text")
        self.assertEqual(pins[-1]["payload"]["failureClass"],
                         "projection-unavailable-no-source")

    def test_pins_quartet_reachable_through_wall(self):
        pins = self.wall.pins
        self.assertEqual(len(pins.probeCatalog()), 116)
        self.assertGreater(len(pins.history()), 0)
        d = pins.dump()
        self.assertEqual(d["cellId"], "graph-model")           # cell dump intact
        self.assertEqual(d["wall"]["wallVersion"], WALL_VERSION)
        seen = []
        unsubscribe = pins.tap("graph-model.wall.verdict",
                               lambda ev: seen.append(ev["payload"]["nodeId"]))
        self.wall.verdictOf(B_ID)
        self.assertEqual(seen, [B_ID])
        unsubscribe()
        self.wall.verdictOf(B_ID)
        self.assertEqual(seen, [B_ID])


if __name__ == "__main__":
    unittest.main()
