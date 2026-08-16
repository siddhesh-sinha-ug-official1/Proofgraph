"""Hub suite (split 6/9): /graph/truth (pin-surface leg) + GET /analysis.

Part of the hub/test_hub.py aggregate (SUB200 restructure); shared stack and
helpers live in hub/test_hub_base.py.  Runnable standalone too.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import test_hub_base as hb                                     # noqa: E402
from test_hub_base import http_get, model_wall                 # noqa: E402

import pipeline as hub_pipeline  # noqa: E402


def setUpModule():
    hb.ensure_stack()


# ==============================================================================
# 9. /graph/truth (V4's second leg: the model wall's pin-surface truth)
# ==============================================================================

class Test09GraphTruth(unittest.TestCase):

    def test_truth_serves_pin_surface_and_bypasses_serializer_seam(self):
        """/graph/truth == canonical json of the model wall's PIN surface
        (pins.dump()['wall']['ingested']) — and it stays honest even while a
        cheap serializer corrupts /graph (the seam it deliberately bypasses)."""
        status, headers, body = http_get("/graph/truth")
        self.assertEqual(status, 200)
        self.assertIn("application/json", headers.get("Content-Type", ""))
        ingested = model_wall().pins.dump()["wall"]["ingested"]
        want = hub_pipeline.canonical_json_bytes(
            {"schemaVersion": "v0", "nodes": ingested["nodes"],
             "edges": ingested["edges"], "leads": ingested["leads"]})
        self.assertEqual(body, want)   # BYTE equality against the pin surface
        # healthy path: /graph and /graph/truth serve byte-identical payloads
        _, _, graph_body = http_get("/graph")
        self.assertEqual(body, graph_body)
        # hub pin fired with matching counts (hub log side of the seam)
        pin = hb.LOG.events("hub.serve.truth")[-1]["payload"]
        self.assertEqual(pin["nodes"], len(ingested["nodes"]))
        self.assertEqual(pin["edges"], len(ingested["edges"]))
        self.assertEqual(pin["leads"], len(ingested["leads"]))

    def test_truth_immune_to_cheap_graph_serializer(self):
        """The tampering /graph can drop rows; /graph/truth cannot be reached
        by that seam — the divergence IS the client-side detection signal."""
        orig = hb.SERVER._graph_serializer

        def cheap(envelope):
            bad = dict(envelope)
            bad["edges"] = list(envelope["edges"])[:-1]
            return hub_pipeline.canonical_json_bytes(bad)

        hb.SERVER._graph_serializer = cheap
        try:
            status, _, truth_body = http_get("/graph/truth")
            self.assertEqual(status, 200)
            served_truth = json.loads(truth_body.decode("utf-8"))
            ingested = model_wall().pins.dump()["wall"]["ingested"]
            self.assertEqual(
                sorted(e["id"] for e in served_truth["edges"]),
                sorted(e["id"] for e in ingested["edges"]))
        finally:
            hb.SERVER._graph_serializer = orig


class Test10AnalysisEndpoint(unittest.TestCase):
    """Phase 3 additive: GET /analysis — the outer wall's analyze() result,
    canonical bytes; typed refusal (no-analysis-computed) before attach.
    Both sides asserted: HTTP body AND the hub's own probe stream."""

    def test_analysis_refused_then_served_canonical_bytes(self):
        # (a) nothing attached -> typed refusal, logged by name.  App-shell
        # round: POST /analyze now ATTACHES the outer-wall analysis (Test06
        # ran before this class), so the refusal path is exercised by an
        # explicit detach — the pre-attach behavior, not the fixture default.
        hb.SERVER._analysis_payload = None
        status, _, body = http_get("/analysis")
        self.assertEqual(status, 503)
        parsed = json.loads(body.decode("utf-8"))
        self.assertEqual(parsed["failureClass"], "no-analysis-computed")
        refusals = [e for e in hb.LOG.history()
                    if e["probeId"] == "hub.serve.analysis.refused"]
        self.assertTrue(refusals)
        self.assertEqual(refusals[-1]["payload"]["failureClass"],
                         "no-analysis-computed")

        # (b) attach a (stand-in) analysis object -> served bytes are EXACTLY
        # canonical_json(analysis); the real outer-wall round-trip is proven
        # end-to-end in outerwall/test_outerwall.py on a full analyze() run.
        analysis = {"graph": {"schemaVersion": "v0", "nodes": [], "edges": [],
                              "leads": []},
                    "verdicts": {}, "provenance": {"nodes": {}, "edges": {}},
                    "gapAnalysis": {"unused": [], "undeclared": True}}
        try:
            hb.SERVER.attach_analysis(analysis, note="test stand-in")
            attach_events = [e for e in hb.LOG.history()
                             if e["probeId"] == "hub.analysis.attach"]
            self.assertTrue(attach_events)
            status, _, body = http_get("/analysis")
            self.assertEqual(status, 200)
            self.assertEqual(body, hub_pipeline.canonical_json_bytes(analysis))
            served = [e for e in hb.LOG.history()
                      if e["probeId"] == "hub.serve.analysis"]
            self.assertTrue(served)
            self.assertEqual(served[-1]["payload"]["bytes"], len(body))
        finally:
            hb.SERVER._analysis_payload = None   # leave the fixture as found

    def test_hub_log_tap_additive(self):
        """Phase 3 additive HubLog.tap: catalogued probes tap-able (system
        surface routing); uncatalogued tap refused by name."""
        seen = []
        untap = hb.LOG.tap("hub.serve.analysis", seen.append)
        try:
            analysis = {"ok": True}
            hb.SERVER.attach_analysis(analysis, note="tap probe")
            status, _, _ = http_get("/analysis")
            self.assertEqual(status, 200)
            self.assertTrue(seen)
            self.assertEqual(seen[-1]["probeId"], "hub.serve.analysis")
        finally:
            untap()
            hb.SERVER._analysis_payload = None
        with self.assertRaises(hub_pipeline.HubError) as ctx:
            hb.LOG.tap("hub.not.a.probe", seen.append)
        self.assertEqual(ctx.exception.failure_class, "hub-bad-request")


if __name__ == "__main__":
    unittest.main(verbosity=2)
