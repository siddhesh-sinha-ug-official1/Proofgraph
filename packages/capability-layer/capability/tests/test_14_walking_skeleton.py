"""The walking-skeleton gate (build prompt §8 mandated two languages; this
gate drives THREE): one capability() function, three fixture languages, three
DIFFERENT MEASURED tiers (CT / G / S) — a shallow language can never
masquerade as CT. Plus the firehose spot-checks that make the cell probe-able.
"""

import unittest

from capability.tests import common


class TestWalkingSkeletonCT(unittest.TestCase):
    def test_yaddabinggiberish_reaches_compiler_truth(self):
        cap = common.get_run("ct")
        self.assertEqual(cap.tier, "CT")
        self.assertEqual(cap.handle.kind, "lsp")
        self.assertTrue(cap.handle.alive)
        self.assertTrue(cap.provenance["extractor"].startswith("ybg-lsp@ybc-"))
        self.assertTrue(cap.provenance["resolved"])
        self.assertIn("compiler", cap.honestCeiling)

    def test_live_handle_answers_requests(self):
        cap = common.get_run("ct")
        # hover the unannotated `let y = 2` through the returned handle
        resp = cap.handle.request(
            "textDocument/hover",
            {"textDocument": {"uri": [u for u in cap.handle._client.docs
                                      if u.endswith("main.ybg")][0]},
             "position": {"line": 4, "character": 4}})
        self.assertIn("y: Int", str(resp.get("result")))

    def test_handle_also_carries_the_floor(self):
        cap = common.get_run("ct")
        tree = cap.handle.parse("let a: Int = 1\n")
        self.assertEqual(tree.root_node.type, "source_file")
        self.assertEqual(tree.count("ERROR"), 0)

    def test_discovery_walked_the_diy_path(self):
        cap = common.get_run("ct")
        queries = common.events_of(cap, "capability.discovery.source.query")
        self.assertEqual(len(queries), 10, "all ten index sources must be consulted")
        for e in queries:  # each sweep query carries request AND response
            p = e["payload"]
            for key in ("source", "url", "query", "response"):
                self.assertIn(key, p, f"source.query payload missing {key}")
            self.assertEqual(p["query"], "yaddabinggiberish")
            self.assertIn("hits", p["response"])
            self.assertIn("raw", p["response"])
        self.assertEqual(len(common.events_of(cap, "capability.discovery.none")), 1)
        modes = [e["payload"] for e in
                 common.events_of(cap, "capability.discovery.compilerMode")]
        self.assertIn("check --format=json", modes)
        self.assertNotIn("lsp", modes)
        # the decisive --help call is itself a lead, request and response
        helps = common.events_of(cap, "capability.discovery.compilerHelp")
        self.assertEqual(len(helps), 1)
        self.assertEqual(helps[0]["payload"]["exitCode"], 0)
        self.assertIn("check", helps[0]["payload"]["stdout"])

    def test_wire_firehose_is_dense(self):
        cap = common.get_run("ct")
        msgs = common.events_of(cap, "capability.probe.msg")
        self.assertTrue(msgs, "the capability.probe.msg firehose never fired")
        directions = {e["payload"]["direction"] for e in msgs}
        self.assertEqual(directions, {"send", "recv"},
                         "both wire directions must be on the firehose")
        sent_ids = [e["payload"]["message"]["id"] for e in msgs
                    if e["payload"]["direction"] == "send"
                    and "id" in e["payload"]["message"]]
        recv_ids = {e["payload"]["message"].get("id") for e in msgs
                    if e["payload"]["direction"] == "recv"}
        self.assertTrue(sent_ids)
        for mid in sent_ids:
            self.assertIn(mid, recv_ids,
                          f"request id {mid} has no response on the firehose")
        # the shim-side firehose fired too: framing reads and verbatim sends
        self.assertTrue(common.events_of(cap, "capability.shim.readMsg"))
        self.assertTrue(common.events_of(cap, "capability.shim.send"))

    def test_scip_and_inventory_thickening(self):
        cap = common.get_run("ct")
        ingest = common.events_of(cap, "capability.scip.ingest")
        self.assertEqual(len(ingest), 1)
        self.assertGreaterEqual(ingest[0]["payload"]["docs"], 4)
        self.assertGreaterEqual(ingest[0]["payload"]["symbols"], 5)
        ondemand = common.events_of(cap, "capability.lib.ondemand")
        self.assertEqual(len(ondemand), 1)
        labels = {i["label"] for i in ondemand[0]["payload"]["response"]}
        self.assertIn("parse", labels)

    def test_tap_observed_live_check_calls(self):
        common.get_run("ct")
        self.assertTrue(common.TAPPED_CHECK_CALLS,
                        "tap('capability.shim.check.call') saw no live events")

    def test_encoding_was_negotiated_utf8(self):
        cap = common.get_run("ct")
        neg = common.events_of(cap, "capability.shim.encoding.negotiate")
        self.assertTrue(neg)
        self.assertEqual(neg[0]["payload"]["chosen"], "utf-8")
        self.assertEqual(cap.handle.positionEncoding, "utf-8")


class TestWalkingSkeletonFloor(unittest.TestCase):
    def test_awk_lands_on_the_grammar_floor(self):
        cap = common.get_run("awk")
        self.assertEqual(cap.tier, "G")
        self.assertEqual(cap.handle.kind, "treesitter")
        self.assertFalse(cap.provenance["resolved"])
        self.assertTrue(cap.provenance["extractor"].startswith("tree-sitter-awk"))
        self.assertIn("green forbidden", cap.honestCeiling)

    def test_floor_handle_parses_and_enumerates(self):
        cap = common.get_run("awk")
        tree = cap.handle.parse("function f(x) {\n  print x\n}\n")
        self.assertEqual(tree.root_node.type, "program")
        anon = [t["type"] for t in cap.handle.nodeTypes if not t["named"]]
        self.assertIn("function", anon)   # keywords enumerable with no running code
        with self.assertRaises(RuntimeError):
            cap.handle.request("textDocument/hover", {})  # no LSP surface — honest

    def test_goto_heuristic_is_a_lead_not_an_edge(self):
        cap = common.get_run("awk")
        ev = common.events_of(cap, "capability.floor.gotoHeuristic")
        self.assertTrue(ev)
        self.assertIs(ev[0]["payload"]["resolved"], False)

    def test_floor_tier_mapping_lead(self):
        cap = common.get_run("awk")
        ev = common.events_of(cap, "capability.floor.tier")
        self.assertEqual(ev[0]["payload"], {"depthTier": "G", "schemaTier": "T1"})


class TestTierContrast(unittest.TestCase):
    def test_same_function_different_measured_tiers(self):
        tiers = {key: common.get_run(key).tier
                 for key in ("ct", "awk", "zigish")}
        self.assertEqual(tiers,
                         {"ct": "CT", "awk": "G", "zigish": "S"})


if __name__ == "__main__":
    unittest.main()
