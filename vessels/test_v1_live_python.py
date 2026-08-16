"""V1 connector suite (split 1/2): the live python CT path + awk.

Part of the vessels/test_v1.py aggregate (SUB200 restructure); the shared
feed/extraction stack lives in vessels/v1_seam_shared.py.  Every assertion
reads BOTH cells' pins across the boundary — never a return value alone.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import v1_seam_shared as st                                    # noqa: E402
from v1_seam_shared import (GUARD_PIN, REQUEST_PIN,            # noqa: E402
                            RESPONSE_PIN, UnknownLanguageError, _events)


class V1ConnectorPythonAwk(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        st.ensure_stack()

    # ---------------------------------------------------------------- python
    def test_a1_python_tier_byte_equal_across_the_seam(self):
        prov = st.feed.provenance["python"]
        self.assertEqual(prov["measuredBy"], "capability-layer")
        cell2_tier = prov["measuredTierPin"]["measuredTier"]   # cell 2 PIN
        resp = [e for e in _events(st.hist_py, RESPONSE_PIN)
                if e["payload"]["lang"] == "python"]           # cell 3 PIN
        self.assertEqual(len(resp), 1)
        cell3_tier = resp[0]["payload"]["tier"]
        self.assertEqual(cell3_tier, cell2_tier)
        self.assertEqual(cell3_tier.encode("utf-8"), cell2_tier.encode("utf-8"),
                         "tier strings must be BYTE-equal across the seam")
        # the wall-construct pin (cell 2) agrees too
        self.assertEqual(prov["constructPin"]["tier"], cell2_tier)
        # the request pin fired before the response pin (cell 3)
        self.assertTrue(_events(st.hist_py, REQUEST_PIN))
        # provenance is stamped INTO cell 3's pin surface via handleKind
        self.assertIn("capability-layer:", resp[0]["payload"]["handleKind"])
        self.assertIn("MEASURED tier", resp[0]["payload"]["handleKind"])

    def test_a2_resolved_edges_only_because_measured_CT(self):
        tier = st.feed.provenance["python"]["tier"]
        self.assertEqual(tier, "CT",
                         "cell 2's live measurement changed — the vessel must "
                         "carry whatever it measures; re-read the P2 evidence")
        # resolved edges exist (the moat path is alive) ...
        self.assertTrue(st.env_py["edges"])
        self.assertTrue(all(e["resolved"] is True for e in st.env_py["edges"]))
        self.assertTrue(all(e["resolved"] is False for e in st.env_py["leads"]))
        # ... and the envelope equals the assemble pin (cell 3)
        emit = _events(st.hist_py, "extractor.assemble.graph.emit")[-1]
        self.assertEqual(emit["payload"]["resolvedEdges"], len(st.env_py["edges"]))
        # tier-inflation guard pin SILENT on the honest CT run
        self.assertEqual(_events(st.hist_py, GUARD_PIN), [])

    def test_a3_reduced_tier_means_zero_resolved_edges(self):
        # the labelled S double: same fixture, same live backend config
        self.assertEqual(st.env_s["edges"], [],
                         "an S tier produced resolved edges — tier inflation")
        self.assertTrue(st.env_s["leads"], "candidates must survive as leads")
        emit = _events(st.hist_s, "extractor.assemble.graph.emit")[-1]
        self.assertEqual(emit["payload"]["resolvedEdges"], 0)
        # the dock SAID why: the tier-gate cap pin fired with actual == "S"
        caps = [e for e in _events(st.hist_s, "extractor.cap.applied")
                if e["payload"].get("capName") == "python.pyright.tier-gate"]
        self.assertEqual(len(caps), 1)
        self.assertEqual(caps[0]["payload"]["actual"], "S")
        # guard silent BECAUSE the dock obeyed (the guard's firing on a forged
        # resolved-at-S edge is proven in cell 3's own conformance suite)
        self.assertEqual(_events(st.hist_s, GUARD_PIN), [])

    def test_a4_duplicated_subprocess_bound_is_logged(self):
        bounds = {b["bound"] for b in st.feed.bounds}
        self.assertIn("duplicated-subprocess", bounds)
        self.assertIn("no-grammar-floor", bounds)
        # cell 3 really did run its OWN backend (the pin proves the duplication)
        resp = _events(st.hist_py, "extractor.backend.pyright.resp")
        self.assertTrue(resp, "cell 3's own pyright backend never answered")
        self.assertTrue(all(e["payload"]["mode"] == "live-lsp" for e in resp))

    # ------------------------------------------------------------------- awk
    def test_b1_awk_measured_G_and_extractor_stays_honest(self):
        prov = st.feed.provenance["awk"]
        self.assertEqual(prov["measuredBy"], "capability-layer")
        self.assertEqual(prov["measuredTierPin"]["measuredTier"], "G")  # cell 2 PIN
        self.assertEqual(st.awk_handle.tier, "G")
        self.assertEqual(st.awk_handle.tier.encode("utf-8"), b"G")
        self.assertFalse(st.awk_handle.allows_resolution())
        # cell 3 pins: the .awk file was SEEN but no language was detected,
        # no capability consulted, nothing extracted — honest emptiness
        files = [e for e in _events(st.hist_awk, "extractor.ingest.file")
                 if e["payload"]["path"] == "main.awk"]
        self.assertEqual(len(files), 1)
        detected = _events(st.hist_awk, "extractor.ingest.lang.detected")
        self.assertEqual(detected, [])
        self.assertEqual(_events(st.hist_awk, RESPONSE_PIN), [],
                         "no tier may enter the extractor for a language it "
                         "cannot ingest")
        self.assertEqual(st.env_awk["nodes"], [])
        self.assertEqual(st.env_awk["edges"], [])
        self.assertEqual(_events(st.hist_awk, GUARD_PIN), [])

    def test_b2_awk_honest_ceiling_is_a_typed_refusal(self):
        with self.assertRaises(UnknownLanguageError):
            st.wall_awk.honestCeiling("awk")
        refusals = _events(st.wall_awk.pins.history(), "extractor.wall.refusal")
        self.assertTrue(refusals)
        self.assertEqual(refusals[-1]["payload"]["failureClass"],
                         "unknown-language")


if __name__ == "__main__":
    unittest.main(verbosity=2)
