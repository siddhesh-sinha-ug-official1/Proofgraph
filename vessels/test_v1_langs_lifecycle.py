"""V1 connector suite (split 2/2): lean (measured CT), latex (refusal ->
recorded stub fallback), unknown language, and the lifecycle sweep.

Part of the vessels/test_v1.py aggregate (SUB200 restructure); the shared
feed/extraction stack lives in vessels/v1_seam_shared.py.  test_z owns the
EXPLICIT feed shutdown (runs LAST — the aggregate orders this module after
test_v1_live_python and the methods sort c1..z within the class).
"""
from __future__ import annotations

import os
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import v1_seam_shared as st                                    # noqa: E402
from v1_seam_shared import (GUARD_PIN, RESPONSE_PIN,           # noqa: E402
                            UnknownLanguageError, _events, _node_pids)
from v1_capability_extractor import FeedShutdownError          # noqa: E402


class V1ConnectorLangsLifecycle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        st.ensure_stack()

    # ------------------------------------------------------------------ lean
    # LEAN-DOCK round: cell 2 MEASURES lean since CAP-LEAN (no refusal, no
    # stub fallback) and cell 3's dock drives the real kernel driver at the
    # measured CT.  The refusal/fallback mechanism these tests used to pin on
    # lean is preserved verbatim on latex (test_c3) — a language cell 2 still
    # refuses.
    def test_c1_lean_measured_ct_carried_byte_equal(self):
        prov = st.feed.provenance["lean"]
        self.assertEqual(prov["measuredBy"], "capability-layer",
                         "cell 2 measures lean since CAP-LEAN — a refusal "
                         "here means the lake battery died; re-read gate 17")
        cell2_tier = prov["measuredTierPin"]["measuredTier"]   # cell 2 PIN
        self.assertEqual(cell2_tier, "CT",
                         "cell 2's live lean measurement changed — the vessel "
                         "carries whatever it measures; re-read the P2 evidence")
        resp = [e for e in _events(st.hist_lean, RESPONSE_PIN)
                if e["payload"]["lang"] == "lean"]              # cell 3 PIN
        self.assertEqual(len(resp), 1)
        self.assertEqual(resp[0]["payload"]["tier"], cell2_tier)
        self.assertEqual(resp[0]["payload"]["tier"].encode("utf-8"),
                         cell2_tier.encode("utf-8"))
        self.assertIn("capability-layer:", resp[0]["payload"]["handleKind"])
        self.assertIn("MEASURED tier", resp[0]["payload"]["handleKind"])

    def test_c2_lean_verdicts_arrive_without_false_green(self):
        # the Mathlib-importing fixture cannot elaborate single-file: the
        # kernel driver runs FOR REAL at the measured CT and honestly yields
        # zero resolved edges and zero green (errors → red/unknown only)
        self.assertTrue(st.env_lean["nodes"], "lean T1 structure must exist")
        self.assertEqual(st.env_lean["edges"], [],
                         "an unelaboratable fixture resolved an edge — forged")
        emit = _events(st.hist_lean, "extractor.assemble.graph.emit")[-1]
        self.assertEqual(emit["payload"]["resolvedEdges"], 0)
        self.assertEqual(_events(st.hist_lean, GUARD_PIN), [])
        for n in st.env_lean["nodes"]:
            self.assertNotEqual(n["fill"]["status"], "green",
                                "green may never come from a failed elaboration")
        # the driver really ran (invocation probed), and the ceiling declares
        # the CT driver surface, fabricating nothing green
        self.assertTrue(_events(st.hist_lean, "extractor.t2.lean.driver.invoke"))
        ceiling = st.env_lean["honestCeilings"].get("lean")
        self.assertIsNotNone(ceiling)
        self.assertTrue(ceiling.get("driverLimits"),
                        "the driver's declared limits must ride the ceiling")

    def test_c3_latex_refusal_recorded_stub_fallback(self):
        # the refusal → RECORDED local-stub fallback mechanism, verbatim from
        # the pre-CAP-LEAN lean pinning, on a language cell 2 still refuses
        prov = st.feed.provenance["latex"]
        self.assertEqual(prov["measuredBy"], "local-stub")
        self.assertEqual(prov["tier"], "G")
        refusal = prov["refusal"]
        self.assertEqual(refusal["failureClass"], "unknown-language")
        self.assertEqual(refusal["pinEvents"][-1]["lang"], "latex")
        self.assertEqual(refusal["pinEvents"][-1]["failureClass"],
                         "unknown-language")
        resp = [e for e in _events(st.hist_tex, RESPONSE_PIN)
                if e["payload"]["lang"] == "latex"]
        self.assertEqual(len(resp), 1)
        self.assertEqual(resp[0]["payload"]["tier"], "G")
        self.assertIn("local-stub FALLBACK", resp[0]["payload"]["handleKind"])
        self.assertIn("unknown-language", resp[0]["payload"]["handleKind"])
        # reduced stays reduced: zero resolved edges through the G fallback
        self.assertEqual(st.env_tex["edges"], [])
        self.assertTrue(st.env_tex["leads"])
        self.assertEqual(_events(st.hist_tex, GUARD_PIN), [])

    # --------------------------------------------------------------- unknown
    def test_d_unknown_language_refused_by_both_walls(self):
        with self.assertRaises(UnknownLanguageError):
            st.feed.capability_fn("klingon")
        prov = st.feed.provenance["klingon"]
        self.assertEqual(prov["measuredBy"], "refused")
        self.assertIsNone(prov["tier"], "a fabricated tier leaked through")
        # cell 2 PIN (tap-captured refusal lead)
        self.assertEqual(prov["refusal"]["pinEvents"][-1]["failureClass"],
                         "unknown-language")
        # cell 3 PIN: its own wall refuses the same lang, same class
        with self.assertRaises(UnknownLanguageError):
            st.wall_py.honestCeiling("klingon")
        refusals = _events(st.wall_py.pins.history(), "extractor.wall.refusal")
        self.assertEqual(refusals[-1]["payload"]["failureClass"],
                         "unknown-language")

    # ------------------------------------------------------------- lifecycle
    def test_z_vessel_owns_shutdown_no_orphans(self):
        clients = st.feed.live_clients()
        self.assertTrue(clients, "cell 2 handed over no live LSP child?")
        pins = st.feed.shutdown()
        # cell 2 PIN: the wall shutdown lead says terminated
        self.assertTrue(pins)
        self.assertTrue(all(p["terminated"] for p in pins))
        for lang, client in clients:
            self.assertIsNotNone(client.proc.poll(),
                                 f"{lang}: LSP child still alive after shutdown")
        if os.name == "nt":
            deadline = time.time() + 20
            leaked = _node_pids() - st.node_before
            while leaked and time.time() < deadline:
                time.sleep(1)
                leaked = _node_pids() - st.node_before
            self.assertEqual(leaked, set(),
                             f"orphaned node.exe processes: {leaked}")
        # [H11] AFTER shutdown: cached handles must NOT be handed out (dead
        # children).  capability_fn refuses with the typed FeedShutdownError,
        # live_clients() returns [] (caches cleared), and the shutdown pin
        # payload is still queryable (idempotent shutdown).
        self.assertEqual(st.feed.live_clients(), [],
                         "cached walls not cleared on shutdown — capability_fn "
                         "would still serve stale handles (H11 regression)")
        with self.assertRaises(FeedShutdownError):
            st.feed.capability_fn("python")
        with self.assertRaises(FeedShutdownError):
            st.feed.capability_fn("lean")
        # idempotent + no re-tap: second shutdown returns the same pin list
        again = st.feed.shutdown()
        self.assertEqual(again, list(pins))


if __name__ == "__main__":
    unittest.main(verbosity=2)
