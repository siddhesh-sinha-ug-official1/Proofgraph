"""Standalone envelope-validator gate (split from test_schema_package.py, SUB200)."""
import sys
import unittest
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from context import SCHEMA_OBJ  # noqa: E402

import ids  # noqa: E402
from validate import validate_graph  # noqa: E402


def _node(node_id, name):
    return {
        "id": node_id, "kind": "function", "lang": "python", "name": name,
        "signature": None,
        "span": {"file": "fixtures/sample.py", "byteStart": 0, "byteEnd": 8},
        "fill": {"status": "unknown", "source": ""},
        "outline": None,
        "origin": "checked",
        "provenance": {"tier": "T1", "extractor": "schema-package-test",
                       "resolved": True},
    }


def _edge(edge_id, kind, src_id, dst_id, resolved, resolver, tier):
    return {
        "id": edge_id, "kind": kind, "srcId": src_id, "dstId": dst_id,
        "resolved": resolved, "resolver": resolver,
        "provenance": {"tier": tier, "extractor": "schema-package-test"},
    }


def _sample_graph():
    n1 = ids.compute_node_identity("python", "function", "sample", "A",
                                   "fixtures/sample.py")["nodeId"]
    n2 = ids.compute_node_identity("python", "function", "sample", "B",
                                   "fixtures/sample.py")["nodeId"]
    e1 = ids.compute_edge_identity("calls", n1, n2)["edgeId"]
    lead_dst = "unresolved:helper"
    l1 = ids.compute_edge_identity("proof_uses", n1, lead_dst)["edgeId"]
    return {
        "schemaVersion": "v0",
        "nodes": [_node(n1, "sample.A"), _node(n2, "sample.B")],
        "edges": [_edge(e1, "calls", n1, n2, True, "t2-test", "T2")],
        "leads": [_edge(l1, "proof_uses", n1, lead_dst, False, "", "T1")],
    }


class TestValidateGraph(unittest.TestCase):
    """The standalone validator: accepts the canonical envelope, rejects drift."""

    def test_accepts_minimal_canonical_envelope(self):
        ok, errors = validate_graph(_sample_graph(), SCHEMA_OBJ)
        self.assertTrue(ok, f"canonical envelope rejected: {errors}")

    def test_rejects_resolved_false_edge_inside_edges(self):
        graph = _sample_graph()
        graph["edges"].append(graph.pop("leads")[0])
        ok, errors = validate_graph(graph, SCHEMA_OBJ)
        self.assertFalse(ok)
        self.assertTrue(any("lead" in e for e in errors), errors)

    def test_rejects_resolved_true_edge_inside_leads(self):
        graph = _sample_graph()
        graph["leads"][0]["resolved"] = True
        ok, errors = validate_graph(graph, SCHEMA_OBJ)
        self.assertFalse(ok)
        self.assertTrue(any("leads[0]" in e for e in errors), errors)

    def test_rejects_t3_style_24_hex_node_id(self):
        graph = _sample_graph()
        graph["nodes"][0]["id"] = "n:" + "a1b2c3d4e5f60718293a" + "bcde"  # 24 hex, T3 mint
        ok, errors = validate_graph(graph, SCHEMA_OBJ)
        self.assertFalse(ok)
        self.assertTrue(any("pattern" in e for e in errors), errors)

    def test_rejects_missing_schema_version(self):
        graph = _sample_graph()
        del graph["schemaVersion"]
        ok, errors = validate_graph(graph, SCHEMA_OBJ)
        self.assertFalse(ok)
        self.assertTrue(any("schemaVersion" in e for e in errors), errors)


if __name__ == "__main__":
    unittest.main()
