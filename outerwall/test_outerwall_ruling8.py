"""OUTER-WALL suite part 5 — ruling 8 + failure classes (SUB200 split of
test_outerwall.py; class + tests verbatim, fixtures from ow_test_shared).

RULING 8 semantics + named failure classes (synthetic, build-failing).
Run standalone or via the test_outerwall.py aggregator.
"""
from __future__ import annotations

import unittest

import ow_test_shared as shared
from ow_test_shared import ACCEPTANCE

import outerwall
from outerwall import (OutlineVocabularyLeak, UnknownRootDeclared,
                       analyze_session)
from outerwall import outline as outline_mod


def _mk_node(nid, kind, fill):
    return {"id": nid, "kind": kind, "fill": {"status": fill}}


class Test06Ruling8AndFailureClasses(unittest.TestCase):

    def test_ruling8_token_derivation_and_status_composition(self):
        log = outerwall.OuterLog()
        state = {
            "nodes": [_mk_node("nA", "theorem", "green"),
                      _mk_node("nB", "function", "green"),
                      _mk_node("nC", "function", "red"),
                      _mk_node("nD", "function", "unknown"),
                      _mk_node("nE", "function", "blue"),
                      _mk_node("nF", "theorem", "green")],
            "edges": [{"srcId": "nE", "dstId": "nA", "id": "eEA"},
                      {"srcId": "nB", "dstId": "nD", "id": "eBD"}],
            "leads": [{"srcId": "nF", "id": "eLF"}],
        }
        res = outline_mod.fill_outlines(state, log)
        o = res["outlines"]
        # green theorem alone: lemma token, green status (reflexive base)
        self.assertEqual(o["nA"], {"status": "green", "worstOf": ["lemma"]})
        # red alone: red token, red status
        self.assertEqual(o["nC"], {"status": "red", "worstOf": ["red"]})
        # unknown alone: STATUS-only — worstOf ['none'], status unknown
        self.assertEqual(o["nD"], {"status": "unknown", "worstOf": ["none"]})
        # blue -> lemma base: worst token blue, no unknown in base -> blue
        self.assertEqual(o["nE"],
                         {"status": "blue", "worstOf": ["blue", "lemma"]})
        # green -> unknown base: definition token (status blue) composed with
        # unknown — blue is WORSE than unknown on the ruling-8 fill scale
        # (red < amber < blue < unknown < green), so blue stands:
        self.assertEqual(o["nB"],
                         {"status": "blue", "worstOf": ["definition"]})
        # lead OUT of the base: a would-be-green ring (lemma) is CAPPED at
        # unknown (never better than unknown; worse statuses keep standing)
        # + the node lands in incompleteBases
        self.assertEqual(o["nF"], {"status": "unknown", "worstOf": ["lemma"]})
        self.assertEqual(res["incompleteBases"], {"nF": ["eLF"]})

    def test_ruling8_green_world_amber_base_composition(self):
        """Green-flow round: the verdict-arrival composition the LEANCT
        fixture would produce if a clean theorem DEPENDED on a sorry decl —
        a green theorem over an amber (sorry) base must ring AMBER, never
        green (worstOf ['amber','lemma'] in the frozen worst-first order)."""
        log = outerwall.OuterLog()
        state = {
            "nodes": [_mk_node("nClean", "theorem", "green"),
                      _mk_node("nSorry", "theorem", "amber")],
            "edges": [{"srcId": "nClean", "dstId": "nSorry", "id": "eCS"}],
            "leads": [],
        }
        res = outline_mod.fill_outlines(state, log)
        self.assertEqual(res["outlines"]["nClean"],
                         {"status": "amber", "worstOf": ["amber", "lemma"]})
        # the sorry decl itself rings amber (reflexive)
        self.assertEqual(res["outlines"]["nSorry"],
                         {"status": "amber", "worstOf": ["amber"]})
        self.assertEqual(res["incompleteBases"], {})

    def test_outline_vocabulary_leak_is_build_failing(self):
        with self.assertRaises(OutlineVocabularyLeak):
            outline_mod.assert_vocabulary(["none/green"])   # the banned fused token
        with self.assertRaises(OutlineVocabularyLeak):
            outline_mod.assert_vocabulary(["chartreuse"])
        log = outerwall.OuterLog()
        state = {"nodes": [_mk_node("nZ", "function", "chartreuse")],
                 "edges": [], "leads": []}
        with self.assertRaises(OutlineVocabularyLeak):
            outline_mod.fill_outlines(state, log)

    def test_worse_fill_severity_order_ruling8(self):
        self.assertEqual(outline_mod.worse_fill("green", "unknown"), "unknown")
        self.assertEqual(outline_mod.worse_fill("blue", "unknown"), "blue")
        self.assertEqual(outline_mod.worse_fill("red", "green"), "red")
        self.assertEqual(outline_mod.worse_fill("amber", "blue"), "amber")

    def test_unknown_root_never_guessed(self):
        with self.assertRaises(UnknownRootDeclared):
            analyze_session(ACCEPTANCE / "moatpkg",
                            roots=["definitely.not.a.node"],
                            config={"extractor": {"pyright_mode": "none",
                                                  "python_package": "moatpkg"}})

    def test_module_id_root_with_zero_decl_members_raises(self):
        """Round W7 (Wave B): a declared root that is the NODE ID of a
        module with zero decl members must raise UnknownRootDeclared —
        matching the module-NAME branch's behavior byte-for-byte.

        Before the round: the module-id branch skipped the empty-members
        guard and silently returned resolved=[] for an all-module-id root
        set — analyze_run.py's `if declared:` then skipped ingest.roots
        and the run degraded to roots-undeclared, while spelling the same
        root by NAME raised.  The two branches now share ONE helper
        (_expand_module_members) so the guard fires uniformly.
        """
        from outerwall import analyze_roots as _ar
        log = outerwall.OuterLog()
        envelope = {
            "nodes": [
                # A module node — the id matches _NODE_ID_RE (n_ + 16 hex).
                {"id": "n_0000000000000001", "kind": "module",
                 "name": "emptypkg.empty"},
                # A decl in a DIFFERENT module — so it isn't a member of
                # emptypkg.empty.
                {"id": "n_0000000000000002", "kind": "function",
                 "name": "other.pkg.fn"},
            ],
            "edges": [], "leads": [],
        }
        # module-id branch: raises
        with self.assertRaises(UnknownRootDeclared):
            _ar._resolve_roots(envelope, ["n_0000000000000001"], log)
        # module-NAME branch: same input, spelled by name — same raise (the
        # equivalence the two branches must maintain per this round).
        with self.assertRaises(UnknownRootDeclared):
            _ar._resolve_roots(envelope, ["emptypkg.empty"],
                               outerwall.OuterLog())

    def test_module_id_root_expands_to_members_when_present(self):
        """Positive control alongside the guard: a module-id root with
        decl members still expands (module-id-expanded outcome preserved).
        """
        from outerwall import analyze_roots as _ar
        log = outerwall.OuterLog()
        envelope = {
            "nodes": [
                {"id": "n_0000000000000010", "kind": "module",
                 "name": "livepkg.core"},
                {"id": "n_0000000000000011", "kind": "function",
                 "name": "livepkg.core.main"},
                {"id": "n_0000000000000012", "kind": "function",
                 "name": "livepkg.core.side"},
            ],
            "edges": [], "leads": [],
        }
        out = _ar._resolve_roots(envelope, ["n_0000000000000010"], log)
        self.assertEqual(sorted(out),
                         ["n_0000000000000011", "n_0000000000000012"])
        events = log.events("outerwall.roots.resolve")
        # last resolve event carries the module-id-expanded decision
        decisions = events[-1]["payload"]["decisions"]
        self.assertEqual(decisions[-1]["outcome"], "module-id-expanded")


class Test06E1IngestOnceOuterSide(unittest.TestCase):
    """Wave D E1 (pre-GitHub): analyze() must fire the model wall's
    ingest.accepted pin EXACTLY TWICE per session — once from hub.pipeline
    (empty roots) and once from the outer wall's outline-filled verify with
    declared roots.  The former intermediate roots-only ingest is retired.
    """

    def test_moat_model_wall_ingest_accepted_fires_twice_not_three_times(self):
        moat = shared.session("MOAT")
        wall = moat["modelWall"]
        accepted = [e for e in wall.pins.history()
                    if e["probeId"] == "graph-model.wall.ingest.accepted"]
        self.assertEqual(len(accepted), 2, [e["payload"] for e in accepted])
        reingest = moat["outerLog"].events("outerwall.outline.reingest")
        self.assertEqual(len(reingest), 1, reingest)


if __name__ == "__main__":
    unittest.main(verbosity=2)
