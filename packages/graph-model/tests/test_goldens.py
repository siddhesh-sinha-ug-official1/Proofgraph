"""Appendix B executable golden: exact preimages, exact ids, exact flat table."""
import unittest

from context import (A_ID, B_ID, C_ID, EDGE_AB_ID, GOLDEN_SAMPLE_SHA,
                     MODULE_ID, only, payloads, run_cell)

US = "\x1f"
EXPECTED_PREIMAGES = {
    MODULE_ID: US.join(["node:v0", "python", "module", "sample",
                        "fixtures/sample.py", "sample"]),
    A_ID: US.join(["node:v0", "python", "function", "sample.A",
                   "fixtures/sample.py", "sample::A"]),
    B_ID: US.join(["node:v0", "python", "function", "sample.B",
                   "fixtures/sample.py", "sample::B"]),
    C_ID: US.join(["node:v0", "python", "function", "sample.C",
                   "fixtures/sample.py", "sample::C"]),
}


class TestAppendixBGoldens(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell()

    def test_fixture_bytes(self):
        p = only(self.cell, "graph-model.ingest.source.read")["payload"]
        self.assertEqual((p["byteLen"], p["sha256"]), (72, GOLDEN_SAMPLE_SHA))

    def test_node_preimages_verbatim(self):
        pres = payloads(self.cell, "graph-model.node.id.preimage")
        hashes = payloads(self.cell, "graph-model.node.id.hash")
        got = {h["nodeId"]: p["preimageString"] for p, h in zip(pres, hashes)}
        self.assertEqual(got, EXPECTED_PREIMAGES)

    def test_edge_preimage_and_id(self):
        inputs = only(self.cell, "graph-model.edge.id.inputs")["payload"]
        self.assertEqual(inputs, {"kind": "calls", "srcId": A_ID, "dstId": B_ID,
                                  "domainTag": "edge:v0"})
        h = only(self.cell, "graph-model.edge.id.hash")["payload"]
        self.assertEqual(h["edgeId"], EDGE_AB_ID)

    def test_flat_table_b6(self):
        rows = only(self.cell, "graph-model.project.flat.emit")["payload"]["rows"]
        table = [(r["id"], r["kind"], r["name"], r["fill"]["status"], r["tier"],
                  r["reachable"], r["unused"]) for r in rows]
        self.assertEqual(table, [
            (MODULE_ID, "module", "sample", "unknown", "T1", None, None),
            (A_ID, "function", "sample.A", "unknown", "T1", True, False),
            (B_ID, "function", "sample.B", "unknown", "T1", True, False),
            (C_ID, "function", "sample.C", "unknown", "T1", False, True),
        ])

    def test_ref_at_byte_20_is_b(self):
        p = only(self.cell, "graph-model.ingest.ref.raw")["payload"]
        self.assertEqual(p, {"fromDecl": "sample.A", "refName": "B",
                             "kind": "calls", "atByte": 20})
        src = only(self.cell, "graph-model.ingest.source.read")
        self.assertEqual(self.cell.dump()["state"]["source"]["text"][20], "B")
        self.assertIsNotNone(src)


if __name__ == "__main__":
    unittest.main()
