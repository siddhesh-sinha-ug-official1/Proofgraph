"""S6/S7 gates: three projections with identical ids, schema conformance, flat
keeps T3 and fill separate, and the C1 round-trip fixpoint (the merge bar)."""
import json
import unittest

from context import (ALL_IDS, A_ID, B_ID, C_ID, CELL_ROOT, GOLDEN_SAMPLE_SHA,
                     MODULE_ID, only, run_cell)

from src.validate import validate_graph


class TestProjections(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell()

    def test_three_projections_identical_ids(self):
        # failure-class=projection-id-drift — assert it, do not eyeball it
        p = only(self.cell, "graph-model.project.ids.agree")["payload"]
        self.assertTrue(p["allEqual"], f"id drift: {p['diffs']}")
        self.assertEqual(p["textIds"], ALL_IDS)
        self.assertEqual(p["graphIds"], ALL_IDS)
        self.assertEqual(p["flatIds"], ALL_IDS)

    def test_graphjson_conforms_to_schema(self):
        # failure-class=graphjson-nonconformant
        p = only(self.cell, "graph-model.project.graphjson.emit")["payload"]
        self.assertTrue(p["conformsToSchema"])
        schema_obj = json.loads(
            (CELL_ROOT / "schema" / "schema.json").read_text(encoding="utf-8"))
        conforms, errors = validate_graph(json.loads(p["json"]), schema_obj)
        self.assertTrue(conforms, errors)

    def test_validator_actually_rejects_nonconformance(self):
        """The conformance wire itself is a connector — prove it can say no
        (fleet-review regressions: open outline sub-schema; trailing-newline
        ids sneaking past the anchored pattern)."""
        schema_obj = json.loads(
            (CELL_ROOT / "schema" / "schema.json").read_text(encoding="utf-8"))
        good = json.loads(
            only(self.cell, "graph-model.project.graphjson.emit")["payload"]["json"])

        def mutated(fn):
            g = json.loads(json.dumps(good))
            fn(g)
            return validate_graph(g, schema_obj)[0]

        self.assertFalse(mutated(lambda g: g["nodes"][0].update(outline={})))
        self.assertFalse(mutated(
            lambda g: g["nodes"][0].update(outline={"status": "red"})))
        self.assertFalse(mutated(lambda g: g["nodes"][0].update(
            outline={"status": "red", "worstOf": [], "junk": 1})))
        self.assertTrue(mutated(lambda g: g["nodes"][0].update(
            outline={"status": "red", "worstOf": ["lemma"]})))
        self.assertFalse(mutated(
            lambda g: g["nodes"][0].update(id=good["nodes"][0]["id"] + "\n")))
        self.assertFalse(mutated(lambda g: g["nodes"][0].update(kind="widget")))
        self.assertFalse(mutated(lambda g: g["nodes"][0].update(extra=1)))
        self.assertFalse(mutated(lambda g: g["nodes"][0].pop("provenance")))
        self.assertFalse(mutated(lambda g: g["edges"][0].update(id="e_short")))
        # Assembly ruling 3 (canonical validate.py, adopted): resolved:false
        # lives ONLY in leads[] — the validator itself now enforces the
        # leads-segregation invariant, beyond raw JSON-Schema conformance.
        self.assertFalse(mutated(
            lambda g: g["edges"][0].update(resolved=False, resolver="")))
        self.assertFalse(mutated(
            lambda g: g["leads"].append(dict(g["edges"][0], resolved=True))))

    def test_graphjson_shape_appendix_b7(self):
        graph = self.result["graph"]
        self.assertEqual(graph["schemaVersion"], "v0")
        self.assertEqual(len(graph["nodes"]), 4)
        self.assertEqual(len(graph["edges"]), 1)
        self.assertEqual(graph["leads"], [])
        edges_p = only(self.cell, "graph-model.project.graphjson.edges")["payload"]
        self.assertTrue(edges_p["resolvedOnly"])
        self.assertTrue(edges_p["leadsCarriedSeparately"])

    def test_flat_keeps_t3_and_fill_separate(self):
        rows = only(self.cell, "graph-model.project.flat.emit")["payload"]["rows"]
        by_id = {r["id"]: r for r in rows}
        # T3-derived flags live in their own labeled columns…
        self.assertEqual((by_id[A_ID]["reachable"], by_id[A_ID]["unused"]), (True, False))
        self.assertEqual((by_id[B_ID]["reachable"], by_id[B_ID]["unused"]), (True, False))
        self.assertEqual((by_id[C_ID]["reachable"], by_id[C_ID]["unused"]), (False, True))
        # …the module is a container: not in the reachability universe
        self.assertIsNone(by_id[MODULE_ID]["reachable"])
        self.assertIsNone(by_id[MODULE_ID]["unused"])
        # …and fill is NEVER contaminated by T3
        for r in rows:
            self.assertEqual(set(r["fill"].keys()), {"status", "source"})
            self.assertEqual(r["fill"]["status"], "unknown")
            self.assertEqual(r["tier"], "T1")

    def test_text_projection_is_source(self):
        p = only(self.cell, "graph-model.project.text.emit")["payload"]
        self.assertEqual(p["byteLen"], 72)
        self.assertEqual(p["sha256"], GOLDEN_SAMPLE_SHA)
        carried = only(self.cell, "graph-model.project.text.idsCarried")["payload"]
        self.assertEqual(carried["spanToNodeId"]["0-24"], A_ID)
        self.assertEqual(carried["spanToNodeId"]["24-26"], "trivia")
        self.assertEqual(carried["spanToNodeId"]["50-72"], C_ID)


class TestRoundtrip(unittest.TestCase):
    """The C1 fixpoint — the merge gate."""

    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell()

    def test_byte_exact(self):
        # failure-class=c1-fixpoint-broken
        verdict = only(self.cell, "graph-model.roundtrip.verdict")["payload"]
        self.assertTrue(verdict["pass"])
        self.assertIsNone(verdict["failureClass"])
        self.assertTrue(only(self.cell, "graph-model.roundtrip.compare.len")
                        ["payload"]["equal"])
        h = only(self.cell, "graph-model.roundtrip.compare.hash")["payload"]
        self.assertTrue(h["equal"])
        self.assertEqual(h["reprintSha256"], GOLDEN_SAMPLE_SHA)

    def test_first_divergence_is_null(self):
        p = only(self.cell, "graph-model.roundtrip.firstDivergence")["payload"]
        self.assertIsNone(p["index"])
        diff = only(self.cell, "graph-model.roundtrip.diff")["payload"]
        self.assertEqual(diff["byteDiff"], [])
        self.assertEqual(diff["count"], 0)

    def test_id_stability_across_round_trip(self):
        # failure-class=id-instability
        p = only(self.cell, "graph-model.roundtrip.reingest.idsMatch")["payload"]
        self.assertTrue(p["equal"])
        self.assertEqual(p["originalIds"], ALL_IDS)
        self.assertEqual(p["reingestedIds"], ALL_IDS)

    def test_stronger_fixpoint_idempotence(self):
        p = only(self.cell, "graph-model.roundtrip.fixpoint2")["payload"]
        self.assertTrue(p["modelStable"])

    def test_divergence_locator_actually_locates(self):
        """The diff machinery itself is a connector — test it on a broken pair."""
        from src.stages.s7_roundtrip import first_divergence
        self.assertIsNone(first_divergence(b"abc", b"abc"))
        self.assertEqual(first_divergence(b"abc", b"abX"), 2)
        self.assertEqual(first_divergence(b"abc", b"ab"), 2)  # truncation
        self.assertEqual(first_divergence(b"", b"x"), 0)


if __name__ == "__main__":
    unittest.main()
