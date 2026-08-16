"""Wall stand-up (Phase 1): version + schema PIN at construction, and the
ADDITIVE catalog growth proof (all 104 baseline leads intact, 12 wall.* leads
appended).  Split out of test_wall_conformance.py; helpers in wall_testkit."""
import json
import tempfile
import unittest
from pathlib import Path

from context import CELL_ROOT

from src.probe import BASELINE_CATALOG_SIZE, CATALOG
from src.schema_tools import schema_hash
from wall import (SCHEMA_PIN_HASH, SCHEMA_PIN_VERSION, WALL_VERSION,
                  GraphModelWall, WallRejection, create_wall)
from wall_testkit import WALL_LEAD_IDS, wall_only


class TestWallStandsUp(unittest.TestCase):
    def test_version_and_schema_pin_probed(self):
        wall = create_wall(CELL_ROOT)
        p = wall_only(wall, "graph-model.wall.version")["payload"]
        self.assertEqual(p["wallVersion"], WALL_VERSION)
        self.assertEqual(WALL_VERSION, "graph-model-wall/1.0.0")
        self.assertEqual(p["schemaVersion"], SCHEMA_PIN_VERSION)
        self.assertEqual(p["schemaHash"], SCHEMA_PIN_HASH)
        # the pinned hash IS the canonical package's hash — no drift
        canonical = json.loads(
            (CELL_ROOT.parent / "schema" / "schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema_hash(canonical), SCHEMA_PIN_HASH)

    def test_wall_refuses_to_stand_on_drifted_schema(self):
        # failure-class=schema-pin-mismatch: refuse loudly at construction
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "schema").mkdir()
            obj = json.loads(
                (CELL_ROOT / "schema" / "schema.json").read_text(encoding="utf-8"))
            obj["title"] = "tampered constitution"
            (Path(tmp) / "schema" / "schema.json").write_text(
                json.dumps(obj), encoding="utf-8")
            with self.assertRaises(WallRejection) as caught:
                GraphModelWall(cell_root=tmp)
            self.assertEqual(caught.exception.failure_class, "schema-pin-mismatch")

    def test_catalog_grew_additively_baseline_intact(self):
        # all 104 pre-wall leads still present, in place, un-renamed
        self.assertEqual(BASELINE_CATALOG_SIZE, 104)
        baseline = CATALOG[:BASELINE_CATALOG_SIZE]
        self.assertEqual(len(baseline), 104)
        for e in baseline:
            self.assertFalse(e["probeId"].startswith("graph-model.wall."))
        for known in ("graph-model.node.create", "graph-model.t3.rustworkx.unused",
                      "graph-model.roundtrip.verdict", "graph-model.harness.run.end"):
            self.assertIn(known, [e["probeId"] for e in baseline])
        # and the wall section is present, additively
        self.assertEqual(len(WALL_LEAD_IDS), 12)
        self.assertEqual(len(CATALOG), 116)


if __name__ == "__main__":
    unittest.main()
