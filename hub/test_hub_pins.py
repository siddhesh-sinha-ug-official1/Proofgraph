"""Hub suite (split 3/9): /pins — the aggregated SYSTEM diagnostic surface.

Part of the hub/test_hub.py aggregate (SUB200 restructure); shared stack and
helpers live in hub/test_hub_base.py.  Runnable standalone too.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import test_hub_base as hb                                     # noqa: E402
from test_hub_base import (extractor_wall, http_get_json,      # noqa: E402
                           model_wall)

import pipeline as hub_pipeline  # noqa: E402


def setUpModule():
    hb.ensure_stack()


# ==============================================================================
# 5. /pins — the aggregated SYSTEM diagnostic surface
# ==============================================================================

class Test05Pins(unittest.TestCase):

    def test_pins_catalog_aggregated_counts_intact(self):
        status, body = http_get_json("/pins/catalog")
        self.assertEqual(status, 200)
        # hub section
        self.assertEqual(body["hub"]["catalogSize"],
                         len(hub_pipeline.HUB_PROBE_CATALOG))
        # cells: catalog census intact (walls never shrink catalogs)
        # Green-flow round: cell 3's catalog grew 137 -> 148 ADDITIVELY in
        # LEAN-DOCK (9 CT-driver + 2 green-guard probes, REPORT-LEANDOCK.md).
        # REAL-INPUTS round: 148 -> 149 ADDITIVELY (extractor.t2.lean.decl.
        # match — the disambiguated driver-decl -> node assignment, measured
        # collision on real toolchain source).  The census updates to the
        # grown size; shrinking would still fail.
        self.assertTrue(body["cells"]["structure-extractor"]["available"])
        self.assertEqual(body["cells"]["structure-extractor"]["catalogSize"], 149)
        self.assertTrue(body["cells"]["graph-model"]["available"])
        self.assertEqual(body["cells"]["graph-model"]["catalogSize"], 116)
        # direct wall reads agree (both surfaces)
        self.assertEqual(len(extractor_wall().pins.probeCatalog()), 149)
        self.assertEqual(len(model_wall().pins.probeCatalog()), 116)
        # capability layer: honest absence, never fabricated
        cap = body["cells"]["capability-layer"]
        self.assertFalse(cap["available"])
        self.assertIn("stub", cap["reason"])

    def test_pins_history_aggregated(self):
        status, body = http_get_json("/pins/history")
        self.assertEqual(status, 200)
        hub_ids = {e["probeId"] for e in body["hub"]["events"]}
        self.assertIn("hub.pipeline.return", hub_ids)
        gm_ids = {e["probeId"] for e in
                  body["cells"]["graph-model"]["events"]}
        self.assertIn("graph-model.wall.ingest.accepted", gm_ids)
        ex_ids = {e["probeId"] for e in
                  body["cells"]["structure-extractor"]["events"]}
        self.assertIn("extractor.wall.extract.return", ex_ids)
        self.assertFalse(body["cells"]["capability-layer"]["available"])

    def test_pins_history_truncation_logged_not_silent(self):
        status, body = http_get_json("/pins/history?limit=1")
        self.assertEqual(status, 200)
        for section in (body["hub"], body["cells"]["graph-model"],
                        body["cells"]["structure-extractor"]):
            self.assertTrue(section["truncated"])
            self.assertEqual(len(section["events"]), 1)
            self.assertGreater(section["total"], 1)
            self.assertEqual(section["bound"], 1)
        trunc_events = hb.LOG.events("hub.pins.history.truncated")
        self.assertTrue(trunc_events)
        self.assertIn("graph-model",
                      trunc_events[-1]["payload"]["streamsTruncated"])

    def test_capability_pins_attach_plumbing(self):
        """Aggregation PLUMBING only, with an explicitly-labeled test double —
        no cell truth is faked (the double's stream says what it is).  V1
        attaches the real capability wall pins through this same socket."""
        class AggregationPlumbingDouble:
            note = "TEST DOUBLE for /pins aggregation plumbing — not a cell"

            def probeCatalog(self):
                return [{"probeId": "test.double.marker", "kind": "state"}]

            def history(self):
                return [{"probeId": "test.double.marker",
                         "payload": {"note": self.note}, "logicalClock": 1}]

        hb.SERVER.attach_capability_pins(AggregationPlumbingDouble(),
                                         note="test double (plumbing only)")
        try:
            _, body = http_get_json("/pins/history")
            cap = body["cells"]["capability-layer"]
            self.assertTrue(cap["available"])
            self.assertEqual(cap["events"][0]["probeId"], "test.double.marker")
            attach_events = hb.LOG.events("hub.capability.attach")
            self.assertIn("test double", attach_events[-1]["payload"]["note"])
        finally:
            hb.SERVER.attach_capability_pins(None,
                                            note="detach after plumbing test")
            _, body = http_get_json("/pins/history")
            self.assertFalse(body["cells"]["capability-layer"]["available"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
