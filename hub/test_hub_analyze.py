"""Hub suite (split 4/9): POST /analyze re-runs + pipeline root handling.

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
from test_hub_base import (FIXTURE, SKELETON_CONFIG,           # noqa: E402
                           extractor_events, http_get, http_get_json,
                           http_post_json, model_events, model_wall)

import pipeline as hub_pipeline  # noqa: E402


def setUpModule():
    hb.ensure_stack()


# ==============================================================================
# 6. POST /analyze — serialized re-runs; pipeline-busy
# ==============================================================================

class Test06Analyze(unittest.TestCase):

    def test_analyze_rerun_swaps_pipeline_and_stays_consistent(self):
        before_wall = model_wall()
        status, body = http_post_json("/analyze", {
            "root": str(FIXTURE), "extractorConfig": SKELETON_CONFIG})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["nodes"], 3)
        self.assertEqual(body["edges"], 1)
        self.assertEqual(body["leads"], 0)
        self.assertIsNot(model_wall(), before_wall)   # fresh walls stood up
        # served graph == NEW wall projection, byte-exact
        _, _, served = http_get("/graph")
        self.assertEqual(served, hub_pipeline.canonical_json_bytes(
            model_wall().project("graph")))
        # BOTH cells' pins on the new walls agree again
        ex_pin = extractor_events("extractor.wall.extract.return")[-1]["payload"]
        gm_pin = model_events("graph-model.wall.ingest.accepted")[-1]["payload"]
        self.assertEqual(ex_pin["nodes"], gm_pin["nodeCount"])
        self.assertEqual(ex_pin["edges"], gm_pin["edgeCount"])
        self.assertEqual(ex_pin["leads"], gm_pin["leadCount"])
        self.assertTrue(hb.LOG.events("hub.analyze.accepted"))

    def test_analyze_busy_refused_by_name(self):
        acquired = hb.SERVER._pipeline_lock.acquire(blocking=False)
        self.assertTrue(acquired)
        try:
            pipeline_before = hb.SERVER.pipeline
            status, body = http_post_json("/analyze", {
                "root": str(FIXTURE), "extractorConfig": SKELETON_CONFIG})
            self.assertEqual(status, 409)
            self.assertEqual(body["failureClass"], "pipeline-busy")
            self.assertIs(hb.SERVER.pipeline, pipeline_before)  # untouched
            rejected = hb.LOG.events("hub.analyze.rejected")[-1]["payload"]
            self.assertEqual(rejected["failureClass"], "pipeline-busy")
        finally:
            hb.SERVER._pipeline_lock.release()

    def test_analyze_bad_request(self):
        status, body = http_post_json("/analyze", raw=b"not json {{{")
        self.assertEqual(status, 400)
        self.assertEqual(body["failureClass"], "hub-bad-request")
        status, body = http_post_json("/analyze", {})
        self.assertEqual(status, 400)
        self.assertEqual(body["failureClass"], "hub-bad-request")

    def test_unknown_endpoint(self):
        status, body = http_get_json("/nope")
        self.assertEqual(status, 404)
        self.assertEqual(body["failureClass"], "unknown-endpoint")


# ==============================================================================
# 7. Pipeline root handling (declared, never inferred)
# ==============================================================================

class Test07PipelineRoots(unittest.TestCase):

    def test_unresolvable_root_name_refused_by_hub(self):
        log = hub_pipeline.HubLog()
        with self.assertRaises(hub_pipeline.HubError) as ctx:
            hub_pipeline.run_pipeline(FIXTURE, roots=["no_such_decl"],
                                      extractor_config=SKELETON_CONFIG, log=log)
        self.assertEqual(ctx.exception.failure_class, "unknown-root")
        rejected = log.events("hub.pipeline.rejected")
        self.assertTrue(rejected)
        self.assertEqual(rejected[-1]["payload"]["failureClass"], "unknown-root")

    def test_module_id_root_refused_by_model_wall_both_pins(self):
        """A module node id passes the hub's resolution (it IS an envelope id)
        but the MODEL WALL refuses it: roots must be decl nodes.  Both the
        hub log and the cell pin carry the refusal."""
        log = hub_pipeline.HubLog()
        probe = hub_pipeline.run_pipeline(FIXTURE,
                                          extractor_config=SKELETON_CONFIG,
                                          log=hub_pipeline.HubLog())
        module_id = probe["envelope"]["nodes"][0]["id"]
        with self.assertRaises(Exception) as ctx:
            hub_pipeline.run_pipeline(FIXTURE, roots=[module_id],
                                      extractor_config=SKELETON_CONFIG, log=log)
        self.assertEqual(getattr(ctx.exception, "failure_class", None),
                         "unknown-root")
        hub_rejected = log.events("hub.pipeline.rejected")[-1]["payload"]
        self.assertEqual(hub_rejected["failureClass"], "unknown-root")


if __name__ == "__main__":
    unittest.main(verbosity=2)
