"""OUTER-WALL suite part 6 — system pins + hub /analysis (SUB200 split of
test_outerwall.py; classes + tests verbatim, sessions from ow_test_shared).

System pins: the outermost diagnostic surface.  Hub: GET /analysis ==
analyze() canonical bytes (live server round-trip).
Run standalone or via the test_outerwall.py aggregator.
"""
from __future__ import annotations

import json
import sys
import unittest
import urllib.error
import urllib.request

import ow_test_shared as shared
from ow_test_shared import PROOFGRAPH_ROOT

import outerwall
from outerwall import system_pins

MOAT: dict
LEAN: dict


def setUpModule():
    global MOAT, LEAN
    MOAT = shared.session("MOAT")
    LEAN = shared.session("LEAN")


class Test07SystemPins(unittest.TestCase):

    def test_catalog_outermost_header_aggregates_every_source(self):
        pins = system_pins(MOAT)
        cat = pins.probeCatalog()
        self.assertEqual(cat["cellId"], "system.outerwall")
        for src in ("outerwall", "hub", "structure-extractor", "graph-model",
                    "capability-layer"):
            self.assertIn(src, cat["sources"])
        # live python measurement -> cell 2's stream really aggregated
        self.assertIn("python", cat["sources"]["capability-layer"])
        sources_present = {e["source"] for e in cat["entries"]}
        self.assertIn("capability-layer", sources_present)
        # adversarial-round audit: breakdown re-measured (catalogs grew
        # additively across rounds; the 300 floor and assertion unchanged):
        # 25 outerwall + 40 hub + 149 extractor + 116 model + 92 capability
        self.assertGreater(cat["entryCount"], 300)   # = 422 measured

    def test_dump_and_history_bounds_logged_not_silent(self):
        pins = system_pins(MOAT, stream_tail_bound=5, payload_byte_bound=64)
        hist = pins.history()
        self.assertEqual(hist["cellId"], "system.outerwall")
        self.assertTrue(hist["boundsApplied"])
        truncated_payloads = [
            e["payload"] for s in hist["streams"].values()
            for e in s["events"]
            if isinstance(e["payload"], dict) and e["payload"].get("truncated")]
        self.assertTrue(truncated_payloads)
        for t in truncated_payloads:
            self.assertIn("sha256", t)     # bounded, checkable, never silent
            self.assertIn("byteLen", t)
        bound_events = MOAT["outerLog"].events("outerwall.bound.logged")
        self.assertTrue(bound_events)
        dump = pins.dump()
        self.assertEqual(dump["cellId"], "system.outerwall")
        self.assertTrue(dump["boundsApplied"])

    def test_tap_routing_across_streams(self):
        pins = system_pins(MOAT)
        seen_model, seen_outer = [], []
        pins.tap("graph-model.wall.query", seen_model.append)
        untap = pins.tap("outerwall.system.trace", seen_outer.append)
        MOAT["modelWall"].query("sccs")
        pins.trace(next(iter(MOAT["analysis"]["verdicts"])))
        self.assertTrue(seen_model)
        self.assertEqual(seen_model[-1]["payload"]["kind"], "sccs")
        self.assertTrue(seen_outer)
        untap()
        with self.assertRaises(outerwall.OuterwallError):
            pins.tap("nobody.owns.this", lambda e: None)

    def test_gap_extractorT3_marks_skip_when_no_extractor_roots(self):
        """[Wave-B D4] The extractor's S4.t3 stage runs only if the
        extractor is configured with roots (config["extractor"]["roots"]).
        Sessions without extractor.roots (LEAN/CEILING/XYZ here) previously
        got an empty cycles["extractorT3"]={} — indistinguishable from 'T3
        ran and found nothing', contradicting the module doc claim that
        module-level cycles surface there.  D4 makes the empty case honest:
        {skipped:true, reason, coversModuleLevelCycles:false} from the
        cell's own extractor.t3.roots.selected pin.  MOAT (extractor.roots
        declared) still carries the populated t3 dict — never regressed."""
        # LEAN's extractor config has no roots -> skipped, marker present
        lean_gap = LEAN["analysis"]["gapAnalysis"]
        lean_t3 = lean_gap["cycles"]["extractorT3"]
        self.assertTrue(lean_t3.get("skipped") is True,
                        f"LEAN extractorT3 should mark skipped, got {lean_t3}")
        self.assertFalse(lean_t3.get("coversModuleLevelCycles"))
        self.assertIn("roots", lean_t3.get("reason", "").lower(),
                      f"reason must name the cause, got {lean_t3.get('reason')!r}")
        # bound log carries the same, not a bare empty-cycles claim
        bound_events = LEAN["outerLog"].events(
            "outerwall.gap.declUniverse.bound")
        self.assertTrue(bound_events)
        payload = bound_events[-1]["payload"]
        self.assertTrue(payload.get("extractorT3Skipped"))
        self.assertIsNotNone(payload.get("extractorT3SkipReason"))
        # MOAT has extractor.roots -> populated dict, no skipped marker
        moat_t3 = MOAT["analysis"]["gapAnalysis"]["cycles"]["extractorT3"]
        self.assertFalse(moat_t3.get("skipped", False),
                         "MOAT declares extractor.roots — T3 should have run")
        self.assertIn("cycles", moat_t3)

    def test_capability_tap_names_snapshot_only_failure_class(self):
        """[Wave-B D3] capability.* leads ARE catalogued at this surface
        (aggregated from the per-lang snapshots taken before shutdown),
        so the pre-D3 'uncatalogued lead is a bug' rejection misled.
        The tap now surfaces a TYPED refusal — capability-tap-snapshot-
        only — that names the honest reason (bus is not live post-analyze
        return); the message points callers at capability.tap (the cell)
        for live observation."""
        pins = system_pins(MOAT)
        # capability.* IDs really are catalogued at the outer surface
        cap_ids = [row["probeId"] for row in pins.probeCatalog()["entries"]
                   if row["source"] == "capability-layer"]
        self.assertTrue(cap_ids, "no capability.* leads catalogued — MOAT "
                        "should carry a real python measurement")
        example = cap_ids[0]
        self.assertTrue(example.startswith("capability."))
        with self.assertRaises(outerwall.OuterwallError) as ctx:
            pins.tap(example, lambda e: None)
        msg = str(ctx.exception)
        self.assertIn("capability-tap-snapshot-only", msg)
        # NOT the misleading pre-D3 message
        self.assertNotIn("uncatalogued lead is a bug", msg)

    def test_trace_moat_node_byte_identical(self):
        pins = system_pins(MOAT)
        unused_id = MOAT["analysis"]["gapAnalysis"]["unused"][0]
        trace = pins.trace(unused_id)
        self.assertTrue(trace["hops"])
        self.assertTrue(trace["byteIdenticalEverywhere"])
        self.assertIsNone(trace["seed"])   # not the V4 seed node — honest


class Test08HubAnalysisEndpoint(unittest.TestCase):

    def test_analysis_served_equals_analyze_canonical_bytes(self):
        sys.path.insert(0, str(PROOFGRAPH_ROOT / "hub"))
        import pipeline as hub_pipeline
        import server as hub_server
        server = hub_server.HubServer(MOAT["pipeline"],
                                      log=MOAT["hubLog"]).start()
        try:
            base = f"http://127.0.0.1:{server.http_port}"

            def get(path):
                try:
                    with urllib.request.urlopen(base + path) as r:
                        return r.status, r.read()
                except urllib.error.HTTPError as err:
                    return err.code, err.read()

            # (a) typed refusal before attach
            status, body = get("/analysis")
            self.assertEqual(status, 503)
            self.assertEqual(json.loads(body)["failureClass"],
                             "no-analysis-computed")
            # (b) attach the REAL analysis -> canonical bytes, byte-for-byte
            server.attach_analysis(MOAT["analysis"], note="outerwall suite")
            status, body = get("/analysis")
            self.assertEqual(status, 200)
            self.assertEqual(
                body, hub_pipeline.canonical_json_bytes(MOAT["analysis"]))
            served = json.loads(body.decode("utf-8"))
            self.assertEqual(sorted(served),
                             ["gapAnalysis", "graph", "provenance",
                              "verdicts"])
            # (c) /graph (same wall) now serves the outline-FILLED envelope
            status, gbody = get("/graph")
            self.assertEqual(status, 200)
            g = json.loads(gbody.decode("utf-8"))
            for n in g["nodes"]:
                self.assertIsNotNone(n["outline"])
                self.assertEqual(n["outline"]["status"], "unknown")
            # hub pins carry the serve event (face vs pins)
            self.assertTrue([e for e in MOAT["hubLog"].history()
                             if e["probeId"] == "hub.serve.analysis"])
        finally:
            server.stop()


if __name__ == "__main__":
    unittest.main(verbosity=2)
