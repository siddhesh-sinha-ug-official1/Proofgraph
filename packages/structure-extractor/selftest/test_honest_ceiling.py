"""The load-bearing gates: honest ceiling, faked-edge invariant, tier caps,
lead exclusion from T3.  'Green may never be faked' made executable."""
import unittest

from harness import one_payload, payloads, run_lang, run_rich, run_skeleton

from extractor.assemble import FakedEdgeError, TierInflationError, assemble
from extractor.capability import CapabilityHandle, stub_capability
from extractor.docks.base import (CandidateEdge, DockResult, HonestCeiling,
                                  ResolverDecision)
from extractor.probe import make_bus
from extractor.schema import SchemaEdge


class TestHonestCeiling(unittest.TestCase):
    def test_resolved_edges_equal_resolved_decisions(self):
        cell = run_rich()
        state = cell.dump()
        for lang, decisions in state["decisions"].items():
            resolved_decisions = [d for d in decisions if d["outcome"] == "resolved"]
            resolved_edges = [e for e in state["edges"]
                              if e["resolved"] and self._edge_lang(e, state) == lang]
            self.assertEqual(len(resolved_edges), len(resolved_decisions),
                             f"{lang}: §5.4 invariant broken")
            keys = {(d["candidate"]["kind"], d["candidate"]["srcId"], d["boundDstId"])
                    for d in resolved_decisions}
            for e in resolved_edges:
                self.assertIn((e["kind"], e["srcId"], e["dstId"]), keys,
                              "resolved edge without a matching resolved decision = faked")

    @staticmethod
    def _edge_lang(edge, state):
        node_lang = {n["id"]: n["lang"] for n in state["nodes"]}
        return node_lang.get(edge["srcId"])

    def test_every_dock_emits_a_ceiling(self):
        # lean is pinned to G here to keep this ceiling-emission check
        # driver-free; the CT lean ceiling is asserted in test_lean_ct_dock.py
        from harness import force_tier_g
        for sub, probe in (("python", "extractor.t2.py.honest_ceiling"),
                           ("lean", "extractor.t2.lean.honest_ceiling"),
                           ("latex", "extractor.t2.latex.honest_ceiling"),
                           ("typst", "extractor.t2.typst.honest_ceiling")):
            kw = {"capability_fn": force_tier_g} if sub == "lean" else {}
            cell = run_lang(sub, **kw) if sub != "python" else run_skeleton()
            ceiling = one_payload(cell, probe)
            for field in ("resolves", "cannotResolve", "resolverGrade", "blindSpots"):
                self.assertIn(field, ceiling, f"{sub} ceiling missing {field}")

    def test_stub_docks_emit_zero_resolved(self):
        # lean pinned to G: at CT it is no longer a stub (the kernel driver
        # resolves for real); the G/placeholder guarantee is what this test
        # pins, and the CT guarantees live in test_lean_ct_dock.py
        from harness import force_tier_g
        for sub in ("lean", "latex", "typst"):
            kw = {"capability_fn": force_tier_g} if sub == "lean" else {}
            cell = run_lang(sub, **kw)
            edges = cell.dump()["edges"]
            self.assertTrue(all(not e["resolved"] for e in edges),
                            f"{sub} design-stub dock claimed a resolved edge")
            self.assertTrue(all(e["resolver"] == "" for e in edges), sub)

    def test_every_decision_has_a_reason(self):
        cell = run_rich()
        for decisions in cell.dump()["decisions"].values():
            for d in decisions:
                self.assertTrue(d["reason"],
                                "ResolverDecision.reason is the honest-ceiling substrate")

    def test_reason_histogram_probed(self):
        cell = run_rich()
        hist = one_payload(cell, "extractor.resolve.reason.histogram")["perDock"]
        self.assertIn("python", hist)
        self.assertGreater(hist["python"]["resolved"], 0)
        self.assertTrue(hist["python"]["rejected"], "builtin rejections expected")

    def test_leads_never_fed_to_t3(self):
        cell = run_rich()
        state = cell.dump()
        leads = sum(1 for e in state["edges"] if not e["resolved"])
        excl = one_payload(cell, "extractor.t3.graph.exclude.unresolved")
        self.assertEqual(excl["excludedCount"], leads)
        t3_input = one_payload(cell, "extractor.t3.graph.input")
        self.assertEqual(t3_input["resolvedEdgeCount"],
                         sum(1 for e in state["edges"] if e["resolved"]))

    def test_unresolved_placeholders_are_queryable_and_never_nodes(self):
        cell = run_rich()
        state = cell.dump()
        node_ids = {n["id"] for n in state["nodes"]}
        for e in state["edges"]:
            if not e["resolved"]:
                self.assertTrue(e["dstId"].startswith("unresolved:"))
                self.assertNotIn(e["dstId"], node_ids,
                                 "a lead's placeholder must never be a real node")


class TestTierCap(unittest.TestCase):
    def test_grammar_tier_forbids_resolution(self):
        # Tree 2 (stubbed) reports G for python -> even grimp evidence must stay a lead
        def all_g(lang):
            return CapabilityHandle(lang, "G", "tree-sitter-floor")
        cell = run_skeleton(capability_fn=all_g, roots=[])
        state = cell.dump()
        self.assertTrue(all(not e["resolved"] for e in state["edges"]),
                        "tier G dock resolved an edge — tier inflation")
        reasons = {d["reason"] for d in state["decisions"]["python"]
                   if d["outcome"] == "unresolved"}
        self.assertTrue(any("tier G" in r for r in reasons), reasons)

    def test_structure_tier_forbids_resolution(self):
        # Assembly ruling 2: S-tier may NOT emit resolved edges (CT only) —
        # S lost the resolution rights this cell's earlier build granted it.
        def all_s(lang):
            return CapabilityHandle(lang, "S", "structure-only")
        cell = run_skeleton(capability_fn=all_s, roots=[])
        state = cell.dump()
        self.assertTrue(all(not e["resolved"] for e in state["edges"]),
                        "tier S dock resolved an edge — forbidden by ruling 2")
        reasons = {d["reason"] for d in state["decisions"]["python"]
                   if d["outcome"] == "unresolved"}
        self.assertTrue(any("tier cap" in r for r in reasons), reasons)

    def test_forged_resolved_at_tier_s_raises(self):
        # Assembly ruling 2 enforced at the assemble guard too: a dock that
        # claims a resolved edge at S is tier inflation.
        bus = make_bus()
        cand = CandidateEdge("calls", "n_00000000000000aa", "evil", None,
                             {"file": "x.py", "byteStart": 0, "byteEnd": 1}, "forged")
        decision = ResolverDecision(cand, "resolved", "n_00000000000000bb",
                                    "forged bind", "forged")
        edge = SchemaEdge(id="e_00000000000000ff", kind="calls",
                          srcId="n_00000000000000aa", dstId="n_00000000000000bb",
                          resolved=True, resolver="forged",
                          provenance={"tier": "T2", "extractor": "forged"})
        result = DockResult(edges=[edge], decisions=[decision],
                            ceiling=HonestCeiling("python", [], [], "heuristic", []))
        with self.assertRaises(TierInflationError):
            assemble(bus, [], {"python": result},
                     {"python": CapabilityHandle("python", "S", "structure-only")})

    def test_forged_resolved_at_tier_g_raises(self):
        bus = make_bus()
        cand = CandidateEdge("calls", "n:src", "evil", None,
                             {"file": "x.py", "byteStart": 0, "byteEnd": 1}, "forged")
        decision = ResolverDecision(cand, "resolved", "n:dst", "forged bind", "forged")
        edge = SchemaEdge(id="e:1", kind="calls", srcId="n:src", dstId="n:dst",
                          resolved=True, resolver="forged",
                          provenance={"tier": "T2", "extractor": "forged"})
        result = DockResult(edges=[edge], decisions=[decision],
                            ceiling=HonestCeiling("python", [], [], "heuristic", []))
        with self.assertRaises(TierInflationError):
            assemble(bus, [], {"python": result},
                     {"python": CapabilityHandle("python", "G", "floor")})
        violations = bus.events(probeId="extractor.tier.enforcement.violation")
        self.assertEqual(len(violations), 1)

    def test_faked_edge_without_decision_raises(self):
        bus = make_bus()
        edge = SchemaEdge(id="e:1", kind="calls", srcId="n:src", dstId="n:dst",
                          resolved=True, resolver="forged",
                          provenance={"tier": "T2", "extractor": "forged"})
        result = DockResult(edges=[edge], decisions=[],
                            ceiling=HonestCeiling("python", [], [], "heuristic", []))
        with self.assertRaises(FakedEdgeError):
            assemble(bus, [], {"python": result},
                     {"python": stub_capability("python")})


if __name__ == "__main__":
    unittest.main()
