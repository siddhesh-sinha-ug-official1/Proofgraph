"""WALL FACE — honest ceiling propagation, version/PIN, the exported envelope
guard, and the pins quartet THROUGH the wall (split from
test_wall_conformance.py, SUB200 restructure; total test count unchanged):

  * honest ceiling propagates: declared == pin payload verbatim; undeclared
    surfaces as undeclared; unknown language is a typed refusal;
  * the wall refuses to stand on a drifted schema (construction AND re-run);
  * the pins quartet stays reachable through the wall, and the probe catalog
    only ever GREW (143 pre-wall entries: 131 at wall promotion + 11 LEAN-DOCK
    + 1 REAL-INPUTS decl.match — census in wall_test_common.py).
"""
import unittest

from harness import FIXTURES
from wall_test_common import PRE_WALL_CATALOG_COUNT, SKELETON_CFG, _one, _payloads

from extractor import schema as cell_schema

from wall import (FAILURE_CLASSES, ExtractorWall, IdMismatchError,
                  LeadInEdgesError, UnknownLanguageError,
                  WALL_VERSION, WallSchemaPinMismatch, extract_wall,
                  validate_envelope)


class TestHonestCeilingFace(unittest.TestCase):
    def test_unknown_language_is_a_typed_refusal(self):
        wall = extract_wall()
        with self.assertRaises(UnknownLanguageError) as ctx:
            wall.honestCeiling("klingon")
        self.assertEqual(ctx.exception.failure_class, "unknown-language")
        # vocabulary consistent with the capability wall: depth tiers, no fabrication
        self.assertIn("CT/S/G/P", str(ctx.exception))
        refusal = _one(wall, "extractor.wall.refusal")
        self.assertEqual(refusal["failureClass"], "unknown-language")
        req = _one(wall, "extractor.wall.honest_ceiling.request")
        self.assertEqual(req["outcome"], "refused-unknown-language")

    def test_known_but_undeclared_language_surfaces_as_undeclared(self):
        wall = extract_wall(SKELETON_CFG)
        wall.extract(FIXTURES / "python")
        ceiling = wall.honestCeiling("go")   # schema lang, but no go sources ran
        self.assertIs(ceiling["declared"], False)
        self.assertIsNone(ceiling["tier"], "a tier must never be fabricated")
        self.assertEqual(ceiling["resolves"], [])
        self.assertTrue(ceiling["resolverGrade"].startswith("none"))
        self.assertEqual(_one(wall, "extractor.wall.honest_ceiling.request")["outcome"],
                         "undeclared")
        # before any run, every schema lang is undeclared (never green, never a tier)
        fresh = extract_wall()
        pre = fresh.honestCeiling("python")
        self.assertIs(pre["declared"], False)
        self.assertIsNone(pre["tier"])


class TestWallVersionAndPin(unittest.TestCase):
    def test_wall_version_exported_and_probed(self):
        self.assertEqual(WALL_VERSION, "structure-extractor-wall/1.0.0")
        wall = extract_wall()
        self.assertEqual(wall.WALL_VERSION, WALL_VERSION)
        v = _one(wall, "extractor.wall.version")
        self.assertEqual(v["wallVersion"], WALL_VERSION)
        self.assertEqual(v["pinnedSchemaVersion"], cell_schema.PINNED_SCHEMA_VERSION)
        self.assertEqual(v["pinnedSchemaHash"], cell_schema.PINNED_SCHEMA_HASH)

    def test_pin_check_probed_ok(self):
        wall = extract_wall()
        check = _one(wall, "extractor.wall.pin.check")
        self.assertIs(check["ok"], True)
        self.assertEqual(check["canonicalVersion"], "v0")
        self.assertEqual(check["canonicalHash"], cell_schema.PINNED_SCHEMA_HASH)

    def test_wall_refuses_to_stand_on_a_drifted_schema(self):
        real = cell_schema.PINNED_SCHEMA_HASH
        cell_schema.PINNED_SCHEMA_HASH = "0" * 64
        try:
            with self.assertRaises(WallSchemaPinMismatch) as ctx:
                ExtractorWall()
        finally:
            cell_schema.PINNED_SCHEMA_HASH = real
        self.assertEqual(ctx.exception.failure_class, "schema-pin-mismatch")

    def test_pin_reasserted_before_every_extract(self):
        wall = extract_wall(SKELETON_CFG)   # pin check #1 (construction)
        real = cell_schema.PINNED_SCHEMA_HASH
        cell_schema.PINNED_SCHEMA_HASH = "0" * 64
        try:
            with self.assertRaises(WallSchemaPinMismatch):
                wall.extract(FIXTURES / "python")   # drift AFTER birth still refuses
        finally:
            cell_schema.PINNED_SCHEMA_HASH = real
        checks = _payloads(wall, "extractor.wall.pin.check")
        self.assertEqual([c["ok"] for c in checks], [True, False])


class TestWallEnvelopeGuard(unittest.TestCase):
    """The exported face guard raises named failure classes."""

    def _lead(self, dst="unresolved:evil"):
        eid, _ = cell_schema.edge_id("calls", "n_00000000000000aa", dst)
        return {"id": eid, "kind": "calls", "srcId": "n_00000000000000aa",
                "dstId": dst, "resolved": False, "resolver": "",
                "provenance": {"tier": "T2", "extractor": "t"}}

    def test_lead_in_edges_named_class(self):
        bad = {"schemaVersion": "v0", "nodes": [],
               "edges": [self._lead()], "leads": []}
        with self.assertRaises(LeadInEdgesError) as ctx:
            validate_envelope(bad)
        self.assertEqual(ctx.exception.failure_class, "lead-in-edges")

    def test_unprefixed_lead_named_class(self):
        lead = self._lead()
        lead["dstId"] = "bare_name"          # placeholder prefix lost
        bad = {"schemaVersion": "v0", "nodes": [], "edges": [], "leads": [lead]}
        with self.assertRaises(LeadInEdgesError):
            validate_envelope(bad)

    def test_id_mismatch_named_class(self):
        lead = self._lead()
        lead["id"] = "e_0000000000000000"     # not the canonical mint of its fields
        bad = {"schemaVersion": "v0", "nodes": [], "edges": [], "leads": [lead]}
        with self.assertRaises(IdMismatchError) as ctx:
            validate_envelope(bad)
        self.assertEqual(ctx.exception.failure_class, "id-mismatch")

    def test_failure_class_registry_complete(self):
        self.assertEqual(sorted(FAILURE_CLASSES), [
            "faked-edge", "id-mismatch", "lead-in-edges",
            "schema-pin-mismatch", "tier-inflation", "unbacked-green",
            "unknown-language"])


class TestPinsThroughTheWall(unittest.TestCase):
    """Rule 1 + 3: additive only; the diagnostic quartet stays reachable."""

    def test_catalog_grew_and_never_shrank(self):
        wall = extract_wall()
        catalog = wall.pins.probeCatalog()
        non_wall = [c for c in catalog
                    if not c["probeId"].startswith("extractor.wall.")]
        self.assertEqual(len(non_wall), PRE_WALL_CATALOG_COUNT,
                         "a membrane never deletes a pin")
        wall_ids = {c["probeId"] for c in catalog} - {c["probeId"] for c in non_wall}
        self.assertEqual(wall_ids, {
            "extractor.wall.version", "extractor.wall.pin.check",
            "extractor.wall.extract.call", "extractor.wall.extract.return",
            "extractor.wall.honest_ceiling.request", "extractor.wall.refusal"})

    def test_quartet_reachable_and_live(self):
        wall = extract_wall(SKELETON_CFG)
        env = wall.extract(FIXTURES / "python")
        self.assertTrue(wall.pins.history())
        self.assertEqual(wall.pins.dump()["nodes"], env["nodes"])
        seen = []
        wall.pins.tap("extractor.wall.honest_ceiling.request", seen.append)
        wall.honestCeiling("python")
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0].payload["outcome"], "declared")

    def test_plain_cell_runs_never_fire_wall_probes(self):
        # the wall is additive: the cell's own behavior is unchanged
        from harness import run_skeleton
        cell = run_skeleton()
        fired = set(cell.bus.fired_probe_ids())
        self.assertFalse({p for p in fired if p.startswith("extractor.wall.")})


if __name__ == "__main__":
    unittest.main()
