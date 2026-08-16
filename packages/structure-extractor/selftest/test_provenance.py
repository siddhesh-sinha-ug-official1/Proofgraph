"""Provenance discipline: no anonymous data in the graph — audits, stamps,
and the violation path."""
import unittest

from harness import one_payload, payloads, run_rich, run_skeleton

from extractor.assemble import assemble
from extractor.capability import stub_capability
from extractor.probe import make_bus
from extractor.schema import SchemaNode, SchemaViolation, Span


class TestProvenance(unittest.TestCase):
    def test_audit_totals_match(self):
        for cell in (run_skeleton(), run_rich()):
            audit = one_payload(cell, "extractor.assemble.provenance.audit")
            self.assertEqual(audit["withProvenance"],
                             audit["totalNodes"] + audit["totalEdges"])

    def test_every_node_and_edge_stamped(self):
        cell = run_rich()
        state = cell.dump()
        for n in state["nodes"]:
            self.assertEqual(n["provenance"]["tier"], "T1")
            self.assertEqual(n["provenance"]["extractor"], "tree-sitter")
            # Assembly ruling 7: provenance.resolved = "extractor successfully
            # bound this element's identity" — TRUE for every well-formed
            # structural node (was stamped False under the old local reading).
            self.assertIs(n["provenance"]["resolved"], True)
        for e in state["edges"]:
            self.assertEqual(e["provenance"]["tier"], "T2")
            self.assertTrue(e["provenance"]["extractor"])
        stamps = payloads(cell, "extractor.provenance.node.stamp")
        self.assertEqual(len(stamps), len(state["nodes"]))
        estamps = payloads(cell, "extractor.provenance.edge.stamp")
        self.assertEqual(len(estamps), len(state["edges"]))

    def test_anonymous_violation_never_fires_in_normal_runs(self):
        for cell in (run_skeleton(), run_rich()):
            self.assertEqual(
                payloads(cell, "extractor.provenance.anonymous.violation"), [])

    def test_anonymous_node_fails_the_build(self):
        bus = make_bus()
        anon = SchemaNode(id="n:anon", kind="module", lang="python", name="x",
                          signature=None, span=Span("x.py", 0, 1), provenance={})
        with self.assertRaises(SchemaViolation):
            assemble(bus, [anon], {}, {"python": stub_capability("python")})
        self.assertTrue(bus.events(probeId="extractor.provenance.anonymous.violation"))

    def test_fill_never_green_and_outline_null(self):
        # (message updated, adversarial claim-audit round: since LEAN-DOCK the
        # lean CT path CAN mint attested greens — this python-fixture run must
        # stay green-free; the assertion itself is unchanged)
        cell = run_rich()
        for n in cell.dump()["nodes"]:
            self.assertNotEqual(n["fill"]["status"], "green",
                                "green may never be faked — the python dock "
                                "cannot produce green (attested lean kernel "
                                "greens are covered in test_lean_ct_dock)")
            self.assertEqual(n["fill"]["status"], "unknown")
            self.assertIsNone(n["outline"], "outline is the LAST gap-analysis round")


if __name__ == "__main__":
    unittest.main()
