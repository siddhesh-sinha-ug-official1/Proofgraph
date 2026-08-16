"""Hub suite (split 1/9): /health + pipeline seam + /graph canonical bytes.

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
from test_hub_base import (extractor_events, http_get,         # noqa: E402
                           http_get_json, model_events, model_wall)

import pipeline as hub_pipeline  # noqa: E402


def setUpModule():
    hb.ensure_stack()


# ==============================================================================
# 1. /health + pipeline seam (extract -> ingest, pins x pins)
# ==============================================================================

class Test01HealthAndPipelineSeam(unittest.TestCase):

    def test_health(self):
        status, body = http_get_json("/health")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["hubVersion"], hub_pipeline.HUB_VERSION)
        self.assertEqual(body["schemaPin"]["schemaVersion"], "v0")
        self.assertEqual(body["schemaPin"]["schemaHash"],
                         hub_pipeline.SCHEMA_PIN_HASH)
        self.assertTrue(body["pipelineLoaded"])
        self.assertEqual(body["wallVersions"]["structure-extractor"],
                         "structure-extractor-wall/1.0.0")
        self.assertEqual(body["wallVersions"]["graph-model"],
                         "graph-model-wall/1.0.0")
        self.assertIn("/lsp", body["lsp"]["url"])

    def test_extract_ingest_seam_pins_agree(self):
        """extractor.wall.extract.return counts == graph-model.wall.ingest.accepted
        counts == the envelope — BOTH cells' pins across the V3-shaped seam."""
        env = hb.SERVER.pipeline["envelope"]
        ex_returns = extractor_events("extractor.wall.extract.return")
        self.assertTrue(ex_returns)
        ex_pin = ex_returns[-1]["payload"]
        gm_accepts = model_events("graph-model.wall.ingest.accepted")
        self.assertTrue(gm_accepts)
        gm_pin = gm_accepts[-1]["payload"]
        self.assertEqual(ex_pin["nodes"], len(env["nodes"]))
        self.assertEqual(ex_pin["edges"], len(env["edges"]))
        self.assertEqual(ex_pin["leads"], len(env["leads"]))
        self.assertEqual(gm_pin["nodeCount"], len(env["nodes"]))
        self.assertEqual(gm_pin["edgeCount"], len(env["edges"]))
        self.assertEqual(gm_pin["leadCount"], len(env["leads"]))
        # id verification pin on the model side covered every node
        verify = model_events("graph-model.wall.ingest.verify.nodeIds")[-1]["payload"]
        self.assertTrue(verify["pass"])
        self.assertEqual(verify["checked"], len(env["nodes"]))
        # hub log saw the pipeline round-trip
        self.assertTrue(hb.LOG.events("hub.pipeline.return"))

    def test_node_ids_byte_identical_across_seam(self):
        """Every ingested node id appears byte-identically in the extractor's
        t1 id-mint pins (extractor.t1.node.id carries the preimage) — the
        end-to-end probe-trace seed."""
        minted = {e["payload"]["id"]
                  for e in extractor_events("extractor.t1.node.id")}
        env_ids = {n["id"] for n in hb.SERVER.pipeline["envelope"]["nodes"]}
        served_ids = {n["id"] for n in
                      model_wall().project("graph")["nodes"]}
        self.assertEqual(env_ids, served_ids)
        self.assertTrue(env_ids)
        self.assertLessEqual(env_ids, minted)


# ==============================================================================
# 2. /graph — canonical bytes + serializer-edge-drop guard seed
# ==============================================================================

class Test02GraphEndpoint(unittest.TestCase):

    def test_graph_bytes_equal_wall_projection_canonical_json(self):
        status, headers, body = http_get("/graph")
        self.assertEqual(status, 200)
        self.assertIn("application/json", headers.get("Content-Type", ""))
        want = hub_pipeline.canonical_json_bytes(model_wall().project("graph"))
        self.assertEqual(body, want)   # BYTE equality, not just structural

    def test_graph_id_sets_exactly_equal_walls(self):
        """THE cheap-serializer test seed: served node/edge/lead id sets ==
        model wall's == extractor envelope's (both cells' surfaces)."""
        _, _, body = http_get("/graph")
        served = json.loads(body.decode("utf-8"))
        wall_env = model_wall().project("graph")
        ex_env = hb.SERVER.pipeline["envelope"]
        for key in ("nodes", "edges", "leads"):
            served_ids = sorted(r["id"] for r in served[key])
            wall_ids = sorted(r["id"] for r in wall_env[key])
            ex_ids = sorted(r["id"] for r in ex_env[key])
            self.assertEqual(served_ids, wall_ids, key)
            self.assertEqual(served_ids, ex_ids, key)
        self.assertEqual(served["schemaVersion"], "v0")
        # hub pin fired with the same counts
        pin = hb.LOG.events("hub.serve.graph")[-1]["payload"]
        self.assertEqual(pin["nodes"], len(served["nodes"]))
        self.assertEqual(pin["edges"], len(served["edges"]))
        self.assertEqual(pin["leads"], len(served["leads"]))

    def test_graph_serving_is_stable(self):
        _, _, a = http_get("/graph")
        _, _, b = http_get("/graph")
        self.assertEqual(a, b)

    def test_serializer_edge_drop_refused_by_name(self):
        """Inject a cheap serializer that silently drops the last edge —
        the hub must refuse to serve it, by name, and recover after."""
        orig = hb.SERVER._graph_serializer

        def cheap(envelope):
            bad = dict(envelope)
            bad["edges"] = list(envelope["edges"])[:-1]   # the classic drop
            return hub_pipeline.canonical_json_bytes(bad)

        hb.SERVER._graph_serializer = cheap
        try:
            status, body = http_get_json("/graph")
            self.assertEqual(status, 500)
            self.assertEqual(body["failureClass"], "serializer-edge-drop")
            refusal = hb.LOG.events("hub.serve.graph.refused")[-1]["payload"]
            self.assertEqual(refusal["failureClass"], "serializer-edge-drop")
        finally:
            hb.SERVER._graph_serializer = orig
        status, _, after = http_get("/graph")
        self.assertEqual(status, 200)
        self.assertEqual(
            after, hub_pipeline.canonical_json_bytes(model_wall().project("graph")))

    def test_graph_payload_cached_per_pipeline_version_e4(self):
        """E4 pre-GitHub: repeat GET /graph on the SAME pipeline hits the
        cache — serializer called ONCE, not per-request; a pipeline swap
        (id() change) invalidates the cache automatically."""
        hb.SERVER._graph_payload_cache = None                # cold start
        orig = hb.SERVER._graph_serializer
        count = {"n": 0}
        def counting(env):
            count["n"] += 1
            return orig(env)
        hb.SERVER._graph_serializer = counting
        try:
            _, _, a = http_get("/graph")
            _, _, b = http_get("/graph")
            self.assertEqual(a, b)
            self.assertEqual(count["n"], 1)                  # cache HIT on #2
        finally:
            hb.SERVER._graph_serializer = orig
            hb.SERVER._graph_payload_cache = None

    def test_envelope_version_mismatch_refused_by_name(self):
        """A drifted schemaVersion in the served envelope is refused by name."""
        real = hb.SERVER.pipeline

        class TamperedWall:
            def __init__(self, inner):
                self._inner = inner

            def project(self, kind):
                env = self._inner.project(kind)
                env["schemaVersion"] = "v999"   # drift
                return env

            def __getattr__(self, name):
                return getattr(self._inner, name)

        tampered = dict(real)
        tampered["modelWall"] = TamperedWall(real["modelWall"])
        hb.SERVER._pipeline = tampered
        try:
            status, body = http_get_json("/graph")
            self.assertEqual(status, 500)
            self.assertEqual(body["failureClass"], "envelope-version-mismatch")
            refusal = hb.LOG.events("hub.serve.graph.refused")[-1]["payload"]
            self.assertEqual(refusal["failureClass"], "envelope-version-mismatch")
        finally:
            hb.SERVER._pipeline = real


if __name__ == "__main__":
    unittest.main(verbosity=2)
