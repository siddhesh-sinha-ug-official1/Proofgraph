"""Reformatting-invariance: reflow the fixture's whitespace and re-ingest —
every Node.id UNCHANGED while Node.span byte offsets move.  This proves the
content-addressing is driven by normalizedSpan (structural), not raw bytes."""
import unittest

from context import (ALL_IDS, A_ID, B_ID, C_ID, MODULE_ID, only, payloads,
                     run_cell)


class TestReformattingInvariance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.orig_cell, cls.orig_result = run_cell()
        # sample_reflowed.py presents the SAME logical file (the manifest
        # declares file=fixtures/sample.py) with reflowed whitespace/indent
        cls.reflow_cell, cls.reflow_result = run_cell(
            "fixtures/sample_reflowed.py", "fixtures/roots.json")

    def _spans(self, cell):
        return {p["node"]["id"]: (p["node"]["span"]["byteStart"],
                                  p["node"]["span"]["byteEnd"])
                for p in payloads(cell, "graph-model.node.create")}

    def test_ids_unchanged(self):
        orig_ids = [p["nodeId"] for p in payloads(self.orig_cell,
                                                  "graph-model.node.id.hash")]
        reflow_ids = [p["nodeId"] for p in payloads(self.reflow_cell,
                                                    "graph-model.node.id.hash")]
        self.assertEqual(orig_ids, reflow_ids)
        self.assertEqual(orig_ids, [MODULE_ID, A_ID, B_ID, C_ID])

    def test_spans_moved(self):
        orig, reflow = self._spans(self.orig_cell), self._spans(self.reflow_cell)
        self.assertEqual(orig[A_ID], (0, 24))
        self.assertEqual(reflow[A_ID], (0, 25))
        self.assertEqual(orig[B_ID], (26, 48))
        self.assertEqual(reflow[B_ID], (28, 50))
        self.assertEqual(orig[C_ID], (50, 72))
        self.assertEqual(reflow[C_ID], (51, 81))

    def test_reflowed_roundtrip_still_passes(self):
        verdict = only(self.reflow_cell, "graph-model.roundtrip.verdict")["payload"]
        self.assertTrue(verdict["pass"])

    def test_reflowed_projections_carry_same_ids(self):
        p = only(self.reflow_cell, "graph-model.project.ids.agree")["payload"]
        self.assertTrue(p["allEqual"])
        self.assertEqual(p["graphIds"], ALL_IDS)

    def test_t3_result_identical(self):
        self.assertEqual(self.orig_result["t3Result"]["unused"],
                         self.reflow_result["t3Result"]["unused"])
        self.assertEqual(sorted(self.orig_result["t3Result"]["reachable"]),
                         sorted(self.reflow_result["t3Result"]["reachable"]))


if __name__ == "__main__":
    unittest.main()
