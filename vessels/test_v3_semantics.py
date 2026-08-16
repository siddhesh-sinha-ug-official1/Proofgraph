"""V3 connector suite (split 3/4): the composed moat story, verdicts stay
unknown, and the root-vocabulary honesty finding.

Part of the vessels/test_v3_extractor_to_model.py aggregate (SUB200
restructure); shared bundles/helpers live in vessels/v3_seam_shared.py.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

VESSELS = Path(__file__).resolve().parent
if str(VESSELS) not in sys.path:
    sys.path.insert(0, str(VESSELS))

import v3_seam_shared as st                                    # noqa: E402
from v3_seam_shared import (bundles, gm_payloads,              # noqa: E402
                            gm_wall_mod, sx_payloads)


def setUpModule():
    st.ensure_bundles()


class TestComposedMoatStory(unittest.TestCase):
    """Cell 3's documented §5.10 blind-spot moat story, now visible through
    TWO walls: richpkg.plugin is loaded ONLY via importlib, the dynamic-import
    edge cannot exist, so the plugin surfaces as unused — WITH the soundness
    caveat carried inline, never lost.

    Documented bound (cell semantics, MEMBRANE-SPEC graph-model): the model
    wall's query universe EXCLUDES module containers, so through the model
    wall the plugin module's story surfaces via its sole decl
    (richpkg.plugin.plugin_entry); the module-level claim itself
    (richpkg.plugin) stays visible on the extractor's own T3 pins."""

    def test_unused_through_two_walls_with_soundness_surface(self):
        b = st.RICH
        result = b.gm.query("unused")
        unused = set(result["unused"])
        expect_unused = {b.node_id_by_name[n] for n in (
            "richpkg.plugin.plugin_entry",     # THE moat: importlib-only load
            "richpkg.dyn.load_plugin",
            "richpkg.core.fact",
            "richpkg.models.Child")}
        self.assertEqual(unused, expect_unused)
        self.assertIn(b.node_id_by_name["richpkg.plugin.plugin_entry"], unused)
        # reachable side sanity: the entry's callees are NOT unused
        for reachable_name in ("richpkg.core.alpha", "richpkg.core.beta",
                               "richpkg.helpers.gamma", "richpkg.core.Base"):
            self.assertNotIn(b.node_id_by_name[reachable_name], unused)

        # soundness note + blind spots surface THROUGH the model wall's t3
        # result (never lost), and the wall.query pin carries the same result
        self.assertEqual(result["soundnessNote"],
                         "reachability-based 'unused' is only as complete as "
                         "the resolved edge set")
        self.assertIn("dynamic import", result["blindSpots"])
        q = [p for p in gm_payloads(b.gm, "graph-model.wall.query")
             if p["kind"] == "unused"]
        self.assertEqual(len(q), 1)
        self.assertEqual(q[0]["result"], result)

        # extractor pins carry the SAME story at module level (both cells'
        # pins across the boundary — cell 3's own T3 is diagnostic surface)
        sx_unused = sx_payloads(b.sx, "extractor.t3.unused.complement")[0]["unusedSet"]
        self.assertIn("richpkg.plugin", sx_unused)
        self.assertIn("richpkg.plugin.plugin_entry", sx_unused)
        sx_blind = sx_payloads(b.sx, "extractor.t3.soundness.blindspots")
        self.assertTrue(sx_blind, "unused claim without blind-spots pin")
        self.assertIn("dynamic imports",
                      sx_blind[0]["missingEdgeClasses"])


class TestVerdictFlowStaysUnknown(unittest.TestCase):
    """No compiler is attached anywhere on this seam: every node arrives
    fill=unknown and verdictOf() through the model wall stays unknown —
    the honest ceiling through two membranes; NEVER green."""

    def test_verdict_unknown_through_two_membranes(self):
        for b in bundles():
            with self.subTest(fixture=b.name):
                # extractor pin surface: every node's fill is unknown
                for n in b.sx.pins.dump()["nodes"]:
                    self.assertEqual(n["fill"]["status"], "unknown")
                env_fill = {n["id"]: n["fill"] for n in b.env["nodes"]}
                env_outline = {n["id"]: n["outline"] for n in b.env["nodes"]}
                for nid in env_fill:
                    verdict = b.gm.verdictOf(nid)
                    self.assertEqual(verdict["fill"]["status"], "unknown")
                    self.assertNotEqual(verdict["fill"]["status"], "green")
                    # pass-through byte-for-byte, never upgraded or invented
                    self.assertEqual(verdict["fill"], env_fill[nid])
                    self.assertEqual(verdict["outline"], env_outline[nid])
                    self.assertIsNone(verdict["outline"])
                # model pin surface: wall.verdict pins mirror the answers
                verdict_pins = gm_payloads(b.gm, "graph-model.wall.verdict")
                self.assertEqual(len(verdict_pins), len(env_fill))
                for p in verdict_pins:
                    self.assertEqual(p["fill"]["status"], "unknown")


class TestSkeletonRootsVocabularyHonesty(unittest.TestCase):
    """Seam finding (root-vocabulary-mismatch): extractor T3 roots are
    canonical NAMES (modules allowed: 'pkg.a'); model-wall roots are decl
    node IDS (modules refused).  The skeleton fixture is ALL modules, so no
    decl root exists at the model wall: reachable/unused honestly REFUSE
    (roots-undeclared) instead of inventing a claim, while the extractor's
    own module-level T3 claim stays visible on ITS pins."""

    def test_no_decl_roots_no_claim_and_module_root_refused(self):
        b = st.SKELETON
        # extractor pins: cell-level T3 ran on module names, moat intact
        roots_pin = sx_payloads(b.sx, "extractor.t3.roots.selected")[0]
        self.assertEqual(roots_pin["roots"], ["pkg.a"])
        sx_unused = sx_payloads(b.sx, "extractor.t3.unused.complement")[0]
        self.assertEqual(sx_unused["unusedSet"], ["pkg.c"])

        # model wall: no roots declared -> refuses reachable/unused claims
        with self.assertRaises(gm_wall_mod.WallRejection) as caught:
            b.gm.query("unused")
        self.assertEqual(caught.exception.failure_class, "roots-undeclared")
        rej = gm_payloads(b.gm, "graph-model.wall.query.rejected")
        self.assertTrue(any(p["failureClass"] == "roots-undeclared"
                            for p in rej))

        # declaring the MODULE as root is refused: roots are decl node ids
        gm2 = gm_wall_mod.create_wall()
        module_id = b.node_id_by_name["pkg.a"]
        with self.assertRaises(gm_wall_mod.WallRejection) as caught2:
            gm2.ingest(b.env["nodes"], b.env["edges"], b.env["leads"],
                       roots=[module_id])
        self.assertEqual(caught2.exception.failure_class, "unknown-root")
        rej2 = gm_payloads(gm2, "graph-model.wall.ingest.rejected")
        self.assertTrue(any(p["failureClass"] == "unknown-root" for p in rej2))


if __name__ == "__main__":
    unittest.main(verbosity=2)
