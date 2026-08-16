"""MEMBRANE TEST — the adopted assembly rulings (split from
test_schema_sync.py, SUB200 restructure; total test count unchanged):

  * ruling 6 — "unresolved:" + rawRefName placeholder, REQUIRED on leads
  * ruling 2 — DEPTH_ALLOWS_RESOLVED_EDGES: CT only
  * ruling 3 — Graph envelope separates edges[] from leads[]
"""
import json
import tempfile
import unittest
from pathlib import Path

from harness import run_lang, run_skeleton
from schema_sync_common import capability_constants, schema_constants

from extractor import capability as cell_capability
from extractor import schema as cell_schema


class TestPlaceholderRuling(unittest.TestCase):
    def test_placeholder_is_raw_name(self):
        # Assembly ruling 6: prefix + rawRefName, NEVER hashed.
        self.assertEqual(cell_schema.unresolved_placeholder("η_helper"),
                         "unresolved:η_helper")
        self.assertTrue(schema_constants.is_unresolved_placeholder(
            cell_schema.unresolved_placeholder("η_helper")))

    def test_validate_requires_placeholder_on_unresolved_dst(self):
        # Ruling 6 closes the cell's own triage gap: SchemaEdge.validate now
        # REQUIRES the placeholder prefix on unresolved dstIds.
        bad = cell_schema.SchemaEdge(
            id="e_00000000000000aa", kind="calls", srcId="n_00000000000000aa",
            dstId="bare_name_no_prefix", resolved=False, resolver="",
            provenance={"tier": "T2", "extractor": "test"})
        with self.assertRaises(cell_schema.SchemaViolation):
            bad.validate()
        good = cell_schema.SchemaEdge(
            id="e_00000000000000ab", kind="calls", srcId="n_00000000000000aa",
            dstId="unresolved:bare_name", resolved=False, resolver="",
            provenance={"tier": "T2", "extractor": "test"})
        good.validate()  # must not raise


class TestCapabilitySync(unittest.TestCase):
    def test_depth_table_in_sync(self):
        self.assertEqual(cell_capability.DEPTH_ALLOWS_RESOLVED_EDGES,
                         capability_constants.DEPTH_ALLOWS_RESOLVED_EDGES)
        self.assertEqual(cell_capability.DEPTH_TIERS,
                         capability_constants.DEPTH_TIERS)

    def test_allows_resolution_is_ct_only(self):
        # Assembly ruling 2: S-tier may NOT emit resolved edges.
        for tier, allowed in capability_constants.DEPTH_ALLOWS_RESOLVED_EDGES.items():
            handle = cell_capability.CapabilityHandle("python", tier, "x")
            self.assertEqual(handle.allows_resolution(), allowed, tier)
        self.assertEqual(
            {t for t, a in cell_capability.DEPTH_ALLOWS_RESOLVED_EDGES.items() if a},
            {"CT"})

    def test_dead_tier_max_grades_removed(self):
        # Reconcile-verified dead code removed with the swap.
        self.assertFalse(hasattr(cell_capability, "TIER_MAX_GRADES"))


class TestEnvelopeRuling(unittest.TestCase):
    def test_graph_envelope_separates_leads(self):
        # Assembly ruling 3: {schemaVersion:"v0", nodes, edges, leads} —
        # resolved:false lives ONLY in leads[].
        for runner, kwargs in ((run_skeleton, {}), (run_lang, {"sub": "lean"})):
            with tempfile.TemporaryDirectory() as td:
                if runner is run_lang:
                    runner(kwargs["sub"], out_dir=Path(td))
                else:
                    runner(out_dir=Path(td))
                envelope = json.loads((Path(td) / "graph.json").read_text(encoding="utf8"))
                self.assertEqual(envelope["schemaVersion"], "v0")
                self.assertEqual(sorted(envelope.keys()),
                                 ["edges", "leads", "nodes", "schemaVersion"])
                for e in envelope["edges"]:
                    self.assertIs(e["resolved"], True)
                for l in envelope["leads"]:
                    self.assertIs(l["resolved"], False)
                    self.assertTrue(l["dstId"].startswith("unresolved:"))


if __name__ == "__main__":
    unittest.main()
