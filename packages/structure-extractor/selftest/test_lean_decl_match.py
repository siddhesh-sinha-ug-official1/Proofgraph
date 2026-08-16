"""[REAL-INPUTS round] driver-decl -> node matching tests (split from
test_lean_ct_dock.py, SUB200 restructure; total test count unchanged).

match_decls — the disambiguated per-file driver-decl -> node assignment.
The pre-round raw-last-component key collided on REAL toolchain source
(Init/Classical.lean: `choose` in `namespace Classical` + top-level
`Exists.choose`): last writer won silently, attestations named the wrong
decl, proof_uses edges crossed nodes.
"""
import unittest

from harness import payloads, run_lang
from lean_ct_common import decl_node as _decl_node
from lean_ct_common import skip_without_lean

from extractor.docks.lean_dock import match_decls


class TestDeclMatching(unittest.TestCase):
    """Pure tests — always run."""

    N_IN_NS = _decl_node("Collide.mark", "n_00000000000000a1", 0)
    N_USES = _decl_node("Collide.uses_mark", "n_00000000000000a2", 20)
    N_TOP = _decl_node("Collide.Extra.mark", "n_00000000000000a3", 40)

    def test_collision_disambiguated_exact_beats_suffix(self):
        by_drv, by_node, dec = match_decls(
            [self.N_IN_NS, self.N_USES, self.N_TOP],
            ["Collide.mark", "Collide.uses_mark", "Extra.mark"], "Collide")
        # each driver decl lands on ITS OWN node — the bug signature inverted
        self.assertIs(by_drv["Collide.mark"], self.N_IN_NS)
        self.assertIs(by_drv["Collide.uses_mark"], self.N_USES)
        self.assertIs(by_drv["Extra.mark"], self.N_TOP)
        self.assertEqual(by_node[self.N_IN_NS.id], "Collide.mark")
        self.assertEqual(by_node[self.N_TOP.id], "Extra.mark")
        methods = {d["decl"]: d["method"] for d in dec
                   if d["outcome"] == "matched"}
        self.assertEqual(methods["Extra.mark"], "exact")     # written dotted
        self.assertEqual(methods["Collide.mark"], "suffix")  # in-namespace

    def test_unique_names_match_as_before(self):
        # the pre-round rule's behavior is PRESERVED wherever it was
        # unambiguous (every pre-round fixture) — same assignments
        a = _decl_node("Verified.base_fact", "n_00000000000000b1", 0)
        b = _decl_node("Verified.uses_base", "n_00000000000000b2", 20)
        by_drv, _, dec = match_decls([a, b], ["base_fact", "uses_base"],
                                     "Verified")
        self.assertIs(by_drv["base_fact"], a)
        self.assertIs(by_drv["uses_base"], b)
        self.assertTrue(all(d["outcome"] == "matched" for d in dec))

    def test_auxiliaries_stay_unowned(self):
        by_drv, _, dec = match_decls(
            [self.N_IN_NS], ["Collide.mark", "Collide.mark.congr_simp",
                             "Collide.propDecidable.match_1"], "Collide")
        self.assertEqual(set(by_drv), {"Collide.mark"})
        outcomes = {d["decl"]: d["outcome"] for d in dec}
        self.assertEqual(outcomes["Collide.mark.congr_simp"], "no-owner")
        self.assertEqual(outcomes["Collide.propDecidable.match_1"], "no-owner")

    def test_duplicate_written_identifiers_attest_nothing(self):
        # two nodes with the SAME written identifier: a decl-side tie —
        # ambiguity attests NOTHING (a wrong attestation is worse than none)
        a = _decl_node("Collide.mark", "n_00000000000000c1", 0)
        b = _decl_node("Collide.mark", "n_00000000000000c2", 20)
        by_drv, by_node, dec = match_decls([a, b], ["Collide.mark"], "Collide")
        self.assertEqual(by_drv, {})
        self.assertEqual(by_node, {})
        self.assertEqual(dec[0]["outcome"], "ambiguous")
        self.assertEqual(dec[0]["candidates"], sorted([a.id, b.id]))

    def test_contended_node_attests_nothing(self):
        # two driver decls tie for one node with EQUAL strength: node-side
        # ambiguity — nothing attested, both refusals typed
        a = _decl_node("Collide.mark", "n_00000000000000d1", 0)
        by_drv, by_node, dec = match_decls(
            [a], ["Ns1.mark", "Ns2.mark"], "Collide")
        self.assertEqual(by_drv, {})
        self.assertEqual(by_node, {})
        for d in dec:
            self.assertEqual(d["outcome"], "ambiguous")
            self.assertEqual(d["contendedNodeId"], a.id)

    def test_outranked_claim_is_typed(self):
        # exact beats suffix on the same node; the loser is a typed refusal
        a = _decl_node("Collide.mark", "n_00000000000000e1", 0)
        by_drv, _, dec = match_decls([a], ["mark", "Ns.mark"], "Collide")
        self.assertIs(by_drv["mark"], a)          # written == resolved: exact
        outcomes = {d["decl"]: d for d in dec}
        self.assertEqual(outcomes["Ns.mark"]["outcome"], "outranked")
        self.assertEqual(outcomes["Ns.mark"]["contendedNodeId"], a.id)


class TestCollisionRegressionLive(unittest.TestCase):
    """[REAL-INPUTS round] fixtures/lean_collision/Collide.lean through the
    REAL pipeline at CT: the distilled Init/Classical.lean collision.  The
    bug signature (crossed attestation / crossed edge) must stay inverted."""

    @classmethod
    def setUpClass(cls):
        skip_without_lean()
        cls.cell = run_lang("lean_collision")
        cls.state = cls.cell.dump()
        cls.nodes = {n["name"]: n for n in cls.state["nodes"]}

    def test_every_attestation_names_the_nodes_own_decl(self):
        want = {"Collide.mark": "decl=Collide.mark",
                "Collide.uses_mark": "decl=Collide.uses_mark",
                "Collide.Extra.mark": "decl=Extra.mark"}
        for name, frag in want.items():
            n = self.nodes[name]
            self.assertEqual(n["fill"]["status"], "green", name)
            self.assertIn(frag, n["fill"]["source"],
                          f"{name} must carry ITS OWN kernel attestation — "
                          f"a crossed decl= is the regressed bug")

    def test_proof_uses_edge_lands_on_the_namespace_decl(self):
        src = self.nodes["Collide.uses_mark"]["id"]
        dst_right = self.nodes["Collide.mark"]["id"]
        dst_wrong = self.nodes["Collide.Extra.mark"]["id"]
        hits = [(e["srcId"], e["dstId"]) for e in self.state["edges"]
                if e["kind"] == "proof_uses"]
        self.assertIn((src, dst_right), hits)
        self.assertNotIn((src, dst_wrong), hits,
                         "the crossed edge — the regressed bug signature")

    def test_match_decisions_probed(self):
        per_decl = {p["decl"]: p for p in
                    payloads(self.cell, "extractor.t2.lean.decl.match")}
        self.assertEqual(per_decl["Collide.mark"]["nodeId"],
                         self.nodes["Collide.mark"]["id"])
        self.assertEqual(per_decl["Collide.mark"]["method"], "suffix")
        self.assertEqual(per_decl["Extra.mark"]["nodeId"],
                         self.nodes["Collide.Extra.mark"]["id"])
        self.assertEqual(per_decl["Extra.mark"]["method"], "exact")


if __name__ == "__main__":
    unittest.main(verbosity=2)
