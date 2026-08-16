"""WALL CONFORMANCE — pins vs face (Phase 1, WALL-CONVENTIONS.md rule 5).

Drives the cell THROUGH wall.py, then reads the cell's PINS and asserts the
pin-level truth equals what the wall declared.  Declared behavior may never
diverge from probed behavior:

  * the wall envelope equals the assemble-stage probe payloads
    (extractor.assemble.* pins), split edges[]/leads[];
  * zero resolved edges from any non-CT tier (tier-inflation guard visible
    through the wall — a forged resolved edge at S raises THROUGH extract());
  * every lead dstId carries the "unresolved:" prefix;
  * edge-id recompute matches the canonical ids mint (packages/schema/ids.py).

SUB200 restructure: the honest-ceiling face, version/pin, envelope-guard and
pins-quartet tests live in test_wall_face.py.  Total test count unchanged.
"""
import unittest

from harness import FIXTURES
from wall_test_common import (FACE_KEYS, SKELETON_CFG, _one, _payloads,
                              canonical_ids)

import extractor.pipeline as pipeline_mod
from extractor.capability import CapabilityHandle
from extractor.docks.base import (CandidateEdge, DockResult, HonestCeiling,
                                  ResolverDecision)
from extractor.schema import SchemaEdge

from wall import TierInflationError, extract_wall


class TestWallEnvelopeEqualsPins(unittest.TestCase):
    """Face == assemble-stage pins, for the shipped dock AND a stub dock."""

    def _assert_conformance(self, wall, env):
        # face shape: canonical envelope + ceilings, NOTHING else (t3/summary stay pins)
        self.assertEqual(sorted(env.keys()), FACE_KEYS)
        self.assertEqual(env["schemaVersion"], "v0")

        # (1) envelope == the assemble-stage probe payloads, deduped like assemble
        normalize = _payloads(wall, "extractor.assemble.edge.normalize")
        kept, seen = [], set()
        for p in normalize:
            e = p["schemaEdge"]
            if e["id"] not in seen:
                seen.add(e["id"])
                kept.append(e)
        self.assertEqual(env["edges"], [e for e in kept if e["resolved"]])
        self.assertEqual(env["leads"], [e for e in kept if not e["resolved"]])
        emit = _one(wall, "extractor.assemble.graph.emit")
        self.assertEqual(emit["nodeCount"], len(env["nodes"]))
        self.assertEqual(emit["edgeCount"], len(env["edges"]) + len(env["leads"]))
        self.assertEqual(emit["resolvedEdges"], len(env["edges"]))
        self.assertEqual(emit["unresolvedLeads"], len(env["leads"]))
        wall_return = _one(wall, "extractor.wall.extract.return")
        self.assertEqual(wall_return["edges"], len(env["edges"]))
        self.assertEqual(wall_return["leads"], len(env["leads"]))

        # ...and == the dump() pin, split by resolved
        state = wall.pins.dump()
        self.assertEqual(env["nodes"], state["nodes"])
        self.assertEqual(env["edges"], [e for e in state["edges"] if e["resolved"]])
        self.assertEqual(env["leads"], [e for e in state["edges"] if not e["resolved"]])

        # (2) every lead dstId carries the placeholder prefix
        for l in env["leads"]:
            self.assertTrue(l["dstId"].startswith("unresolved:"), l)
            self.assertIs(l["resolved"], False)
        for e in env["edges"]:
            self.assertIs(e["resolved"], True)

        # (3) edge-id recompute matches the CANONICAL ids mint
        for e in env["edges"] + env["leads"]:
            canon = canonical_ids.compute_edge_identity(e["kind"], e["srcId"], e["dstId"])
            self.assertEqual(e["id"], canon["edgeId"])

        # (4) honest ceiling: face == pin payload VERBATIM
        report = _one(wall, "extractor.output.honest_ceiling.report")["perDock"]
        self.assertEqual(env["honestCeilings"], report)
        for lang, ceiling in report.items():
            self.assertEqual(wall.honestCeiling(lang), ceiling)

    def test_python_dock_conformance(self):
        wall = extract_wall(SKELETON_CFG)
        env = wall.extract(FIXTURES / "python")
        self._assert_conformance(wall, env)
        self.assertGreater(len(env["edges"]), 0, "CT python run should resolve edges")
        # t3/summary stay PINS: not on the face, reachable through the pins
        self.assertNotIn("t3", env)
        self.assertNotIn("summary", env)
        self.assertIsNotNone(wall.pins.dump()["t3"])
        self.assertTrue(_payloads(wall, "extractor.output.summary"))

    def test_stub_dock_conformance(self):
        # tier pinned to G: this asserts the STUB-dock face (the default stub
        # now reports lean -> CT; the CT face is asserted in test_lean_ct_dock)
        from harness import force_tier_g
        wall = extract_wall()
        env = wall.extract(FIXTURES / "lean", capability_fn=force_tier_g)
        self._assert_conformance(wall, env)
        self.assertEqual(env["edges"], [], "a design-stub (G) dock may emit leads only")
        self.assertGreater(len(env["leads"]), 0)

    def test_wall_face_is_deterministic(self):
        e1 = extract_wall(SKELETON_CFG).extract(FIXTURES / "python")
        w2 = extract_wall(SKELETON_CFG)
        e2 = w2.extract(FIXTURES / "python")
        self.assertEqual(e1, e2)
        w3 = extract_wall(SKELETON_CFG)
        w3.extract(FIXTURES / "python")
        self.assertEqual(w2.pins.history(strip_wall=True),
                         w3.pins.history(strip_wall=True))


class TestWallTierGuard(unittest.TestCase):
    """Ruling 2 stays visible through the wall: no non-CT tier ever surfaces
    a resolved edge on the face, and a forged one raises tier-inflation."""

    @staticmethod
    def _all_s(lang):
        return CapabilityHandle(lang, "S", "structure-only")

    def test_all_s_run_zero_resolved_through_wall(self):
        wall = extract_wall({"python_package": "pkg", "pyright_mode": "none"})
        env = wall.extract(FIXTURES / "python", capability_fn=self._all_s)
        self.assertEqual(env["edges"], [],
                         "an S-tier run surfaced a resolved edge through the wall")
        self.assertGreater(len(env["leads"]), 0)
        tally = _one(wall, "extractor.assemble.resolved.tally")["perDock"]
        for lang, t in tally.items():
            self.assertEqual(t["resolved"], 0, lang)
        # face never contradicts the tier the pins negotiated
        for c in _payloads(wall, "extractor.ingest.capability.response"):
            self.assertEqual(c["tier"], "S")

    def test_forged_resolved_at_s_raises_through_wall(self):
        cand = CandidateEdge("calls", "n_00000000000000aa", "evil", None,
                             {"file": "x.py", "byteStart": 0, "byteEnd": 1}, "forged")
        decision = ResolverDecision(cand, "resolved", "n_00000000000000bb",
                                    "forged bind", "forged")
        forged_edge = SchemaEdge(
            id="e_00000000000000ff", kind="calls", srcId="n_00000000000000aa",
            dstId="n_00000000000000bb", resolved=True, resolver="forged",
            provenance={"tier": "T2", "extractor": "forged"})

        class ForgedDock:
            lang = "python"

            def __init__(self, **kw):
                self.pyright_backend = None

            def extract(self, source, handle, nodes, anchors, bus, cause=None):
                return DockResult(edges=[forged_edge], decisions=[decision],
                                  ceiling=HonestCeiling("python", [], [], "forged", []))

        wall = extract_wall({"python_package": "pkg", "pyright_mode": "none"})
        orig = pipeline_mod.ALL_DOCKS["python"]
        pipeline_mod.ALL_DOCKS["python"] = ForgedDock
        try:
            with self.assertRaises(TierInflationError):
                wall.extract(FIXTURES / "python", capability_fn=self._all_s)
        finally:
            pipeline_mod.ALL_DOCKS["python"] = orig
        # the guard's refusal is probed, and readable through the wall's pins
        violations = _payloads(wall, "extractor.tier.enforcement.violation")
        self.assertEqual(len(violations), 1)
        self.assertEqual(violations[0]["tier"], "S")
        self.assertTrue(_payloads(wall, "extractor.error.caught"))


if __name__ == "__main__":
    unittest.main()
