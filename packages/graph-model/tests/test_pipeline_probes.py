"""S1–S2 self-tests, all asserting on probe output: ingest coverage, hash
reproducibility, and node creation taps.  (S3–S4 probe tests — edges, leads,
the rejected-candidate path, and the honest ceiling — live in
test_pipeline_probes_edges_fill.py.)"""
import hashlib
import unittest

from context import (A_ID, B_ID, C_ID, GOLDEN_SAMPLE_SHA, MODULE_ID,
                     events, only, payloads, run_cell)


class TestIngest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell()

    def test_source_read(self):
        p = only(self.cell, "graph-model.ingest.source.read")["payload"]
        self.assertEqual(p["byteLen"], 72)
        self.assertEqual(p["sha256"], GOLDEN_SAMPLE_SHA)
        self.assertEqual(p["file"], "fixtures/sample.py")

    def test_roots_are_declared_not_inferred(self):
        p = only(self.cell, "graph-model.ingest.roots.declared")["payload"]
        self.assertEqual(p["roots"], ["sample.A"])
        self.assertEqual(p["source"], "fixture-manifest")

    def test_coverage_precheck_tiles_full_range(self):
        # failure-class=coverage-gap (the dropped-trivia connector that dies)
        p = only(self.cell, "graph-model.ingest.coverage.precheck")["payload"]
        self.assertTrue(p["coversFullRange"])
        self.assertEqual(p["gaps"], [])
        self.assertEqual(p["overlaps"], [])

    def test_trivia_captured(self):
        texts = [p["text"] for p in payloads(self.cell, "graph-model.ingest.trivia.span")]
        self.assertEqual(texts, ["\n\n", "\n\n"])

    def test_counts(self):
        p = only(self.cell, "graph-model.ingest.count")["payload"]
        self.assertEqual(p, {"declCount": 3, "refCount": 1, "triviaCount": 2})


class TestNodeBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell()

    def test_every_node_created_with_provenance(self):
        creates = payloads(self.cell, "graph-model.node.create")
        decl_count = only(self.cell, "graph-model.ingest.count")["payload"]["declCount"]
        self.assertEqual(len(creates), decl_count + 1)  # +1 = the module
        for p in creates:
            prov = p["node"]["provenance"]
            self.assertEqual(prov, {"tier": "T1", "extractor": "skeleton.handwritten",
                                    "resolved": True})
        self.assertEqual(len(events(self.cell, "graph-model.node.provenance")),
                         len(creates))

    def test_hash_reproducibility(self):
        # the id is a pure function of the probed preimage — recompute by hand
        preimages = payloads(self.cell, "graph-model.node.id.preimage")
        hashes = payloads(self.cell, "graph-model.node.id.hash")
        self.assertEqual(len(preimages), len(hashes))
        for pre, h in zip(preimages, hashes):
            self.assertEqual(pre["encoding"], "utf-8")
            self.assertEqual(pre["delimiter"], "\\x1f")
            self.assertIn("\x1f", pre["preimageString"])
            full = hashlib.sha256(pre["preimageString"].encode("utf-8")).hexdigest()
            self.assertEqual(h["fullHex"], full)
            self.assertEqual(h["nodeId"], "n_" + full[:16])
            self.assertEqual(h["algo"], "sha256")

    def test_golden_ids(self):
        ids = [p["nodeId"] for p in payloads(self.cell, "graph-model.node.id.hash")]
        self.assertEqual(ids, [MODULE_ID, A_ID, B_ID, C_ID])

    def test_normalized_span_is_structural_not_bytes(self):
        for p in payloads(self.cell, "graph-model.node.normalizedSpan"):
            self.assertEqual(set(p["normalizedSpan"].keys()), {"file", "path"})
            self.assertNotIn("byteStart", p["normalizedSpan"])

    def test_no_collisions(self):
        # failure-class=id-collision
        for p in payloads(self.cell, "graph-model.node.id.collision"):
            self.assertFalse(p["collided"])
            self.assertIsNone(p["dupOrdinal"])

    def test_node_table(self):
        p = only(self.cell, "graph-model.node.table")["payload"]
        self.assertEqual(p["count"], 4)
        self.assertEqual(p["byName"]["sample.A"], A_ID)
        self.assertEqual(p["byName"]["sample"], MODULE_ID)


if __name__ == "__main__":
    unittest.main()
