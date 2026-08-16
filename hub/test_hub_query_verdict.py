"""Hub suite (split 2/9): /query three-way equality + /verdict honesty.

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
from test_hub_base import (http_get_json, model_events,        # noqa: E402
                           model_wall)


def setUpModule():
    hb.ensure_stack()


# ==============================================================================
# 3. /query — results == wall.query() == wall.query pins; honest refusals
# ==============================================================================

class Test03QueryEndpoints(unittest.TestCase):

    def _assert_query_three_way(self, kind):
        status, served = http_get_json(f"/query?kind={kind}")
        self.assertEqual(status, 200)
        # (1) the model wall pin the SERVER's call just emitted
        pin_events = [e for e in model_events("graph-model.wall.query")
                      if e["payload"]["kind"] == kind]
        self.assertTrue(pin_events)
        pin_result = pin_events[-1]["payload"]["result"]
        self.assertEqual(served, json.loads(json.dumps(pin_result)))
        # (2) a direct wall call agrees
        direct = model_wall().query(kind)
        self.assertEqual(served, json.loads(json.dumps(direct)))
        # (3) the hub's own pin
        hub_pin = [e for e in hb.LOG.events("hub.serve.query")
                   if e["payload"]["kind"] == kind]
        self.assertTrue(hub_pin)

    def test_sccs_three_way(self):
        self._assert_query_three_way("sccs")

    def test_condensation_three_way(self):
        self._assert_query_three_way("condensation")

    def test_unreferenced_alias_is_logged_and_wall_owned(self):
        """`unreferenced` (brief vocabulary) resolves to the wall's `unused` —
        the alias is documented + logged, and the WALL still owns the verdict:
        with no declared roots this refuses honestly (roots-undeclared)."""
        status, body = http_get_json("/query?kind=unreferenced")
        self.assertEqual(status, 409)
        self.assertEqual(body["failureClass"], "roots-undeclared")
        hub_pin = [e for e in hb.LOG.events("hub.serve.query.refused")
                   if e["payload"].get("kind") == "unreferenced"]
        self.assertTrue(hub_pin)

    def test_unused_and_reachable_refuse_without_roots_both_pins(self):
        for kind in ("unused", "reachable"):
            status, body = http_get_json(f"/query?kind={kind}")
            self.assertEqual(status, 409, kind)
            self.assertEqual(body["failureClass"], "roots-undeclared", kind)
            # model-cell pin
            rejected = [e for e in
                        model_events("graph-model.wall.query.rejected")
                        if e["payload"]["kind"] == kind]
            self.assertTrue(rejected, kind)
            self.assertEqual(rejected[-1]["payload"]["failureClass"],
                             "roots-undeclared", kind)
            # hub pin
            hub_pin = [e for e in hb.LOG.events("hub.serve.query.refused")
                       if e["payload"].get("kind") == kind]
            self.assertTrue(hub_pin, kind)
            self.assertEqual(hub_pin[-1]["payload"]["failureClass"],
                             "roots-undeclared", kind)

    def test_reachable_with_module_root_refuses_unknown_root(self):
        module_id = hb.SERVER.pipeline["envelope"]["nodes"][0]["id"]
        status, body = http_get_json(f"/query?kind=reachable&roots={module_id}")
        self.assertEqual(status, 404)
        self.assertEqual(body["failureClass"], "unknown-root")
        rejected = model_events("graph-model.wall.query.rejected")[-1]["payload"]
        self.assertEqual(rejected["failureClass"], "unknown-root")

    def test_unknown_kind_refuses_by_name(self):
        status, body = http_get_json("/query?kind=bogus")
        self.assertEqual(status, 400)
        self.assertEqual(body["failureClass"], "unknown-query")
        rejected = model_events("graph-model.wall.query.rejected")[-1]["payload"]
        self.assertEqual(rejected["failureClass"], "unknown-query")

    def test_missing_kind_is_hub_bad_request(self):
        status, body = http_get_json("/query")
        self.assertEqual(status, 400)
        self.assertEqual(body["failureClass"], "hub-bad-request")


# ==============================================================================
# 4. /verdict — honest unknown through THREE surfaces
# ==============================================================================

class Test04Verdict(unittest.TestCase):

    def test_verdict_honest_unknown_three_surfaces(self):
        """unknown stays unknown: extractor envelope fill == wall verdictOf ==
        served verdict, and both cells' pins carry the same story."""
        env_node = hb.SERVER.pipeline["envelope"]["nodes"][0]
        nid = env_node["id"]
        status, served = http_get_json(f"/verdict/{nid}")
        self.assertEqual(status, 200)
        self.assertEqual(served["fill"]["status"], "unknown")   # honest unknown
        self.assertEqual(served["fill"], env_node["fill"])      # extractor side
        direct = model_wall().verdictOf(nid)
        self.assertEqual(served, json.loads(json.dumps(direct)))
        # model-cell pin: the server's verdictOf emitted graph-model.wall.verdict
        pins = [e for e in model_events("graph-model.wall.verdict")
                if e["payload"]["nodeId"] == nid]
        self.assertTrue(pins)
        self.assertEqual(pins[0]["payload"]["fill"]["status"], "unknown")
        # hub pin
        hub_pins = [e for e in hb.LOG.events("hub.serve.verdict")
                    if e["payload"]["nodeId"] == nid]
        self.assertTrue(hub_pins)
        self.assertEqual(hub_pins[-1]["payload"]["fillStatus"], "unknown")
        # outline passes through as null, never invented
        self.assertIsNone(served["outline"])

    def test_verdicts_alias_route(self):
        nid = hb.SERVER.pipeline["envelope"]["nodes"][0]["id"]
        _, a = http_get_json(f"/verdict/{nid}")
        _, b = http_get_json(f"/verdicts/{nid}")
        self.assertEqual(a, b)

    def test_unknown_node_refuses_by_name(self):
        status, body = http_get_json("/verdict/n_00000000deadbeef")
        self.assertEqual(status, 404)
        self.assertEqual(body["failureClass"], "unknown-node")
        rejected = model_events("graph-model.wall.query.rejected")[-1]["payload"]
        self.assertEqual(rejected["failureClass"], "unknown-node")
        hub_pin = hb.LOG.events("hub.serve.verdict.refused")[-1]["payload"]
        self.assertEqual(hub_pin["failureClass"], "unknown-node")


if __name__ == "__main__":
    unittest.main(verbosity=2)
