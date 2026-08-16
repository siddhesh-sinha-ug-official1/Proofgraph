"""Golden id-vector gate (split from test_schema_package.py, SUB200)."""
import sys
import unittest
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from context import VECTORS  # noqa: E402

import ids  # noqa: E402


class TestIdVectors(unittest.TestCase):
    """ids.py must reproduce every frozen golden vector byte-for-byte."""

    def test_node_vectors(self):
        for vec in [v for v in VECTORS["vectors"] if v["type"] == "node"]:
            inp, exp = vec["input"], vec["expected"]
            identity = ids.compute_node_identity(
                inp["lang"], inp["kind"], inp["moduleName"], inp["rawName"], inp["file"])
            self.assertEqual(identity["canonicalName"], exp["canonicalName"])
            self.assertEqual(identity["path"], exp["path"])
            self.assertEqual(identity["preimage"], exp["preimage"])
            self.assertEqual(identity["nodeId"], exp["id"])
            self.assertRegex(identity["nodeId"], r"^n_[0-9a-f]{16}\Z")

    def test_edge_vectors(self):
        for vec in [v for v in VECTORS["vectors"] if v["type"] == "edge"]:
            inp, exp = vec["input"], vec["expected"]
            identity = ids.compute_edge_identity(inp["kind"], inp["srcId"], inp["dstId"])
            self.assertEqual(identity["preimage"], exp["preimage"])
            self.assertEqual(identity["edgeId"], exp["id"])
            self.assertRegex(identity["edgeId"], r"^e_[0-9a-f]{16}\Z")

    def test_vector_coverage(self):
        vectors = VECTORS["vectors"]
        self.assertGreaterEqual(len(vectors), 6)
        self.assertTrue(any(v["type"] == "node" and v["input"]["kind"] == "module"
                            for v in vectors), "module-kind node vector missing")
        self.assertTrue(any(v["type"] == "edge" and
                            v["input"]["dstId"].startswith("unresolved:")
                            for v in vectors), "unresolved-placeholder edge vector missing")
        self.assertTrue(any(v["type"] == "node" and
                            any(ord(c) > 127 for c in v["input"]["rawName"])
                            for v in vectors), "non-ASCII name vector missing")

    def test_preimages_use_us_delimiter_and_domain_tags(self):
        for vec in VECTORS["vectors"]:
            preimage = vec["expected"]["preimage"]
            self.assertIn("\x1f", preimage)
            tag = "node:v0" if vec["type"] == "node" else "edge:v0"
            self.assertTrue(preimage.startswith(tag + "\x1f"))


if __name__ == "__main__":
    unittest.main()
