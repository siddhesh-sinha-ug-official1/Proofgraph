"""V3 connector suite (split 4/4): named failure-class negatives at the
seam + the vessel's own pathing guards (sys-path-shadowing).

Part of the vessels/test_v3_extractor_to_model.py aggregate (SUB200
restructure); shared bundles/helpers live in vessels/v3_seam_shared.py.
"""
from __future__ import annotations

import sys
import types
import unittest
from copy import deepcopy
from pathlib import Path

VESSELS = Path(__file__).resolve().parent
if str(VESSELS) not in sys.path:
    sys.path.insert(0, str(VESSELS))

import pathing                                                 # noqa: E402
import v3_seam_shared as st                                    # noqa: E402
from v3_seam_shared import (bundles, gm_payloads,              # noqa: E402
                            gm_wall_mod, ids, sx_payloads, sx_wall_mod)


def setUpModule():
    st.ensure_bundles()


class TestFailureClassNegatives(unittest.TestCase):
    """Named failure classes at the seam, asserted on the model wall's
    rejection pins WITH the extractor pins proving the original was clean."""

    def test_tampered_edge_id_byte_flip_is_id_mismatch(self):
        for b in bundles():
            with self.subTest(fixture=b.name):
                env = deepcopy(b.env)
                victim = env["edges"][0]
                original_id = victim["id"]
                last = original_id[-1]
                flipped = "0" if last != "0" else "1"     # one byte flipped
                victim["id"] = original_id[:-1] + flipped
                self.assertNotEqual(victim["id"], original_id)

                gm = gm_wall_mod.create_wall()
                with self.assertRaises(gm_wall_mod.WallRejection) as caught:
                    gm.ingest(env["nodes"], env["edges"], env["leads"])
                self.assertEqual(caught.exception.failure_class, "id-mismatch")

                # model pins: the named rejection + the recomputed truth
                rej = gm_payloads(gm, "graph-model.wall.ingest.rejected")
                self.assertTrue(any(p["failureClass"] == "id-mismatch"
                                    for p in rej))
                v = gm_payloads(gm, "graph-model.wall.ingest.verify.edgeIds")[0]
                self.assertFalse(v["pass"])
                mism = [m for m in v["mismatches"]
                        if m["claimed"] == victim["id"]]
                self.assertEqual(len(mism), 1)
                self.assertEqual(mism[0]["recomputed"], original_id)

                # extractor pins prove the ORIGINAL was clean: the assemble
                # pin carried a preimage that recomputes to the original id,
                # and the extractor wall declared the envelope (its face
                # guard validate_envelope passed -> extract.return fired)
                sx_edge_pins = [p for p in sx_payloads(
                    b.sx, "extractor.assemble.edge.id")
                    if p["edgeId"] == original_id]
                self.assertTrue(sx_edge_pins)
                pre = sx_edge_pins[0]["preimage"]   # {kind, srcId, dstId, joined}
                ident = ids.compute_edge_identity(
                    pre["kind"], pre["srcId"], pre["dstId"])
                self.assertEqual(ident["edgeId"], original_id)
                self.assertEqual(
                    ident["preimage"].replace(ids.US, ids.US_ESCAPED),
                    pre["joined"])
                self.assertEqual(
                    len(sx_payloads(b.sx, "extractor.wall.extract.return")), 1)

    def test_moved_lead_into_edges_is_lead_in_edges(self):
        b = st.RICH
        env = deepcopy(b.env)
        moved = env["leads"].pop(0)                 # move, not copy
        env["edges"].append(moved)

        gm = gm_wall_mod.create_wall()
        with self.assertRaises(gm_wall_mod.WallRejection) as caught:
            gm.ingest(env["nodes"], env["edges"], env["leads"])
        self.assertEqual(caught.exception.failure_class, "lead-in-edges")
        rej = gm_payloads(gm, "graph-model.wall.ingest.rejected")
        self.assertTrue(any(p["failureClass"] == "lead-in-edges" for p in rej))

        # extractor pins prove the original was clean: that row was born a
        # lead (normalized resolved=False, placeholder probed) and the
        # extractor's envelope kept it in leads[], never edges[]
        norm = [p for p in sx_payloads(b.sx, "extractor.assemble.edge.normalize")
                if p["schemaEdge"]["id"] == moved["id"]]
        self.assertTrue(norm)
        self.assertIs(norm[0]["schemaEdge"]["resolved"], False)
        placeholders = {p["placeholderId"] for p in sx_payloads(
            b.sx, "extractor.assemble.edge.unresolved.placeholder")}
        self.assertIn(moved["dstId"], placeholders)
        self.assertIn(moved["id"], {l["id"] for l in b.env["leads"]})
        self.assertNotIn(moved["id"], {e["id"] for e in b.env["edges"]})


class TestPathingGuards(unittest.TestCase):
    """The vessel's own infrastructure failure class (sys-path-shadowing):
    composing Python cells in one process must fail LOUDLY on module-name
    collisions, never silently mix cytoplasm."""

    def test_walls_are_distinct_modules_under_unique_aliases(self):
        self.assertIsNot(sx_wall_mod, gm_wall_mod)
        self.assertEqual(sx_wall_mod.WALL_VERSION,
                         "structure-extractor-wall/1.0.0")
        self.assertEqual(gm_wall_mod.WALL_VERSION, "graph-model-wall/1.0.0")
        self.assertIn("proofgraph_wall_structure_extractor", sys.modules)
        self.assertIn("proofgraph_wall_graph_model", sys.modules)
        # idempotent: re-wiring returns the SAME module objects
        self.assertIs(pathing.load_wall("structure-extractor"), sx_wall_mod)
        self.assertIs(pathing.load_wall("graph-model"), gm_wall_mod)

    def test_design_invariant_two_cells_one_top_package_refused(self):
        pathing.CELL_TOP_PACKAGES["fake-cell"] = ("src",)   # claims gm's top
        try:
            with self.assertRaises(pathing.SysPathShadowingError) as caught:
                pathing.ensure_cell_on_path("graph-model")
            self.assertEqual(caught.exception.failure_class,
                             "sys-path-shadowing")
        finally:
            del pathing.CELL_TOP_PACKAGES["fake-cell"]

    def test_runtime_invariant_foreign_module_refused(self):
        self.assertNotIn("capability", sys.modules,
                         "precondition: capability-layer not wired in V3")
        foreign = types.ModuleType("capability")
        foreign.__file__ = str(Path(__file__).resolve())   # a foreign origin
        sys.modules["capability"] = foreign
        try:
            with self.assertRaises(pathing.SysPathShadowingError) as caught:
                pathing.ensure_cell_on_path("capability-layer")
            self.assertEqual(caught.exception.failure_class,
                             "sys-path-shadowing")
        finally:
            del sys.modules["capability"]


if __name__ == "__main__":
    unittest.main(verbosity=2)
