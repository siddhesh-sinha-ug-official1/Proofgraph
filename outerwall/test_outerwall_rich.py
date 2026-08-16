"""OUTER-WALL suite part 2 — RICH (SUB200 split of test_outerwall.py;
class + tests verbatim, sessions from ow_test_shared).

Cycles + the importlib blind spot + the V4 trace, extended.
Run standalone or via the test_outerwall.py aggregator.
"""
from __future__ import annotations

import json
import unittest

import ow_test_shared as shared
from ow_test_shared import TRACE_SEED, id_of, names_of

from outerwall import system_pins

RICH: dict


def setUpModule():
    global RICH
    RICH = shared.session("RICH")


class Test02Rich(unittest.TestCase):

    def test_cycle_visible_in_gap_cycles(self):
        cycles = RICH["analysis"]["gapAnalysis"]["cycles"]
        # model-wall universe (decl nodes): crosschecked, condensation a DAG
        self.assertTrue(cycles["isDAG"])
        self.assertEqual(cycles["crosscheck"]["agrees"], True)
        self.assertTrue(cycles["condensation"]["isDAG"])
        # the REAL cycle (richpkg.core <-> richpkg.helpers, module level) is
        # visible VERBATIM from cell 3's own crosschecked t3 diagnosis —
        # module nodes are outside the model wall's query universe, a bound
        # this suite requires to be LOGGED, never silent:
        t3_cycles = [sorted(c) for c in cycles["extractorT3"]["cycles"]]
        self.assertIn(sorted(["richpkg.core", "richpkg.helpers"]), t3_cycles)
        self.assertTrue(cycles["extractorT3"]["crossCheck"]["agree"])
        self.assertIn("declUniverseBound", cycles)
        bound_events = RICH["outerLog"].events(
            "outerwall.gap.declUniverse.bound")
        self.assertTrue(bound_events)

    def test_importlib_blind_spot_in_unused_and_blind_spots(self):
        gap = RICH["analysis"]["gapAnalysis"]
        unused_names = {names_of(RICH)[i] for i in gap["unused"]}
        # plugin_entry is ONLY reached via importlib — static reachability
        # honestly flags it unused, and the blind spot is DECLARED:
        self.assertIn("richpkg.plugin.plugin_entry", unused_names)
        self.assertIn("richpkg.dyn.load_plugin", unused_names)
        blind_text = json.dumps(gap["blindSpots"])
        self.assertIn("dynamic import", blind_text)
        sources = {b["source"] for b in gap["blindSpots"]}
        self.assertIn("graph-model.wall.query(unused)", sources)
        self.assertTrue(any("extractor" in s for s in sources))
        self.assertIn("only as complete as", gap["soundnessNote"])

    def test_incomplete_bases_lead_capped(self):
        """dyn.load_plugin carries the dynamic-import LEAD out of its base
        -> ruling 8 caps it at unknown and records it."""
        gap = RICH["analysis"]["gapAnalysis"]
        load_plugin = id_of(RICH, "richpkg.dyn.load_plugin")
        self.assertIn(load_plugin, gap["incompleteBases"])
        lead_ids = {l["id"] for l in RICH["analysis"]["graph"]["leads"]}
        for nid, leads in gap["incompleteBases"].items():
            self.assertTrue(leads)
            self.assertTrue(set(leads) <= lead_ids, nid)
            self.assertEqual(
                RICH["analysis"]["verdicts"][nid]["outline"]["status"],
                "unknown")

    def test_outline_closure_two_library_idiom_logged(self):
        events = RICH["outerLog"].events("outerwall.outline.closure")
        self.assertTrue(events)
        payload = events[-1]["payload"]
        self.assertTrue(payload["agrees"])
        self.assertIn("rustworkx", payload["libraryPrimary"])
        self.assertIn("networkx", payload["crosscheck"])

    def test_trace_reconstructs_and_extends_the_v4_seed(self):
        """system pins trace(): the V4 TRACE node (n_ccb26550281c06b8,
        richpkg.core.alpha) byte-identical at EVERY hop, seed verified."""
        pins = system_pins(RICH)
        node_id = TRACE_SEED["nodeId"]
        trace = pins.trace(node_id)
        self.assertTrue(trace["byteIdenticalEverywhere"])
        self.assertIsNotNone(trace["seed"])
        self.assertTrue(trace["seed"]["byteIdentical"])
        self.assertEqual(trace["idUtf8Bytes"], TRACE_SEED["idUtf8Bytes"])
        hops_by_kind = {h["hop"]: h for h in trace["hops"]}
        self.assertIn("extraction", hops_by_kind)
        self.assertIn("model-ingest", hops_by_kind)
        self.assertIn("analysis-graph", hops_by_kind)
        # the extraction preimage matches the RECORDED V4 preimage exactly
        self.assertEqual(hops_by_kind["extraction"]["preimage"],
                         TRACE_SEED["hops"]["extractorPin"]["preimage"])
        self.assertTrue(hops_by_kind["model-ingest"]["idInRootIds"])
        self.assertTrue(hops_by_kind["analysis-graph"]["idByteOffsets"])
        # trace emission is itself pinned
        self.assertTrue(RICH["outerLog"].events("outerwall.system.trace"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
