"""OUTER-WALL suite part 4 — CEILING (typst) + XYZ (SUB200 split of
test_outerwall.py; classes + tests verbatim, sessions from ow_test_shared).

CEILING: the SURVIVING honest ceiling — nodes + dashed leads only, all
unknown, NEVER green (ported from the pre-arrival lean tests; typst is a
language cell 2 still refuses -> recorded local-stub fallback).
XYZ: unknown-language input — typed refusal, no crash, no green.
Run standalone or via the test_outerwall.py aggregator.
"""
from __future__ import annotations

import json
import unittest

import ow_test_shared as shared
from ow_test_shared import all_statuses

CEILING: dict
XYZ: dict


def setUpModule():
    global CEILING, XYZ
    CEILING = shared.session("CEILING")
    XYZ = shared.session("XYZ")


class Test04TypstHonestCeiling(unittest.TestCase):

    def test_nodes_and_leads_only(self):
        g = CEILING["analysis"]["graph"]
        self.assertTrue(g["nodes"])
        self.assertEqual(g["edges"], [])
        self.assertTrue(g["leads"])
        self.assertTrue(all(l["resolved"] is False for l in g["leads"]))

    def test_all_unknown_literally_zero_green(self):
        statuses = all_statuses(CEILING)
        self.assertEqual(set(statuses), {"unknown"})
        self.assertEqual(statuses.count("green"), 0)   # literally zero green

    def test_incomplete_bases_populated_for_nodes_with_leads_out(self):
        gap = CEILING["analysis"]["gapAnalysis"]
        self.assertTrue(gap["incompleteBases"])
        leads_by_src = {}
        for l in CEILING["analysis"]["graph"]["leads"]:
            leads_by_src.setdefault(l["srcId"], []).append(l["id"])
        for src, lead_ids in leads_by_src.items():
            self.assertIn(src, gap["incompleteBases"])
            for lid in lead_ids:
                self.assertIn(lid, gap["incompleteBases"][src])

    def test_undeclared_markers_never_inferred(self):
        gap = CEILING["analysis"]["gapAnalysis"]
        self.assertTrue(gap["undeclared"])
        self.assertEqual(gap["unused"], [])
        self.assertEqual(gap["unreferenced"], [])
        self.assertTrue(gap["reachability"]["undeclared"])
        self.assertEqual(gap["reachability"]["wallRefusal"],
                         "roots-undeclared")
        refusals = CEILING["outerLog"].events("outerwall.gap.refusal")
        self.assertTrue(refusals)

    def test_stub_fallback_recorded_not_silent(self):
        cap = CEILING["analysis"]["provenance"]["capability"]["typst"]
        self.assertEqual(cap["measuredBy"], "local-stub")
        self.assertEqual(cap["tier"], "G")
        self.assertEqual(cap["refusal"]["failureClass"], "unknown-language")
        self.assertTrue(cap["refusal"]["pinEvents"])   # cell 2's refusal pin
        self.assertIn("local-stub FALLBACK", cap["handleKind"])

    def test_single_typst_file_staging_sha_pinned(self):
        staging = CEILING["staging"]
        self.assertIsNotNone(staging)
        self.assertEqual(staging["mode"], "staged")
        self.assertTrue(staging["byteIdentical"])
        self.assertIn("honest_ceiling.typ", staging["files"])


class Test05UnknownLanguage(unittest.TestCase):

    def test_typed_refusal_in_provenance_no_crash_no_green(self):
        a = XYZ["analysis"]
        self.assertEqual(a["graph"]["nodes"], [])
        self.assertEqual(a["graph"]["edges"], [])
        self.assertEqual(a["verdicts"], {})
        refusals = [r for r in a["provenance"]["refusals"]
                    if r.get("file") == "mystery.xyz"]
        self.assertEqual(len(refusals), 1)
        self.assertEqual(refusals[0]["failureClass"], "unknown-language")
        self.assertNotIn("green", json.dumps(a["verdicts"]))
        self.assertTrue(XYZ["outerLog"].events(
            "outerwall.provenance.refusal"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
