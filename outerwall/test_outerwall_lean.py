"""OUTER-WALL suite part 3 — LEAN verdict arrival (SUB200 split of
test_outerwall.py; tests verbatim, sessions from ow_test_shared; the
class's rings/guards half continues in test_outerwall_lean_rings.py —
8 lean tests total, unchanged).

VERDICT ARRIVAL (green-flow round): the first REAL kernel greens at the
outer wall.  Every test here was REWRITTEN from the pre-LEAN-DOCK
honest-ceiling expectations (which asserted absence: edges==[], all
unknown, stub fallback) — reason per assertion below; round ref:
REPORT-LEANDOCK.md "Impact assessment" + the green-flow brief.  The
unknown-never-green story SURVIVES on Test04TypstHonestCeiling.
Run standalone or via the test_outerwall.py aggregator.
"""
from __future__ import annotations

import unittest

import ow_test_shared as shared
from ow_test_shared import names_of

GREEN_DECLS = ("unused_hyp.base_fact", "unused_hyp.uses_base",
               "unused_hyp.lonely")

LEAN: dict


def setUpModule():
    global LEAN
    LEAN = shared.session("LEAN")


class Test03LeanVerdictArrival(unittest.TestCase):

    def test_kernel_clean_decls_green_with_attested_provenance(self):
        """REWRITTEN from test_all_unknown_literally_zero_green: the
        acceptance lean fixture is kernel-clean, so the verdict-arrival world
        makes its decls GREEN — but ONLY with the full attestation chain
        (origin checked + lean-kernel source + measured CT capability), and
        the module node STAYS unknown (not a kernel-judged unit)."""
        a = LEAN["analysis"]
        by_name = {n["name"]: n for n in a["graph"]["nodes"]}
        for name in GREEN_DECLS:
            n = by_name[name]
            self.assertEqual(n["fill"]["status"], "green", name)
            self.assertEqual(n["origin"], "checked", name)     # never assumed
            self.assertTrue(n["fill"]["source"].startswith("lean-kernel:"),
                            n["fill"]["source"])
            self.assertIn("kernelAccepted", n["fill"]["source"])
            self.assertIn("run=", n["fill"]["source"])   # runSha resolvable
            # provenance riding the node row: resolved, never anonymous
            self.assertTrue(n["provenance"]["resolved"])
            self.assertTrue(n["provenance"]["extractor"])
        # the module is NOT kernel-judged: unknown, honestly
        mod = by_name["unused_hyp"]
        self.assertEqual(mod["fill"]["status"], "unknown")
        self.assertEqual(mod["origin"], "assumed")
        # capability provenance: lean is MEASURED CT (cell 2, CAP-LEAN) —
        # the stub-fallback expectation moved to typst (Test04)
        cap = a["provenance"]["capability"]["lean"]
        self.assertEqual(cap["measuredBy"], "capability-layer")
        self.assertEqual(cap["tier"], "CT")
        self.assertEqual(cap["measuredTierPin"]["measuredTier"], "CT")
        # PINS alongside faces: the model wall's ingest greenGuard admitted
        # every REAL green (attested); no green decl was ever rejected.
        # (Filtered by node id — test_unbacked_green_rejected_at_the_wall
        # legitimately adds a refusal pin for the DOCTORED node later.)
        green_ids = {by_name[name]["id"] for name in GREEN_DECLS}
        guard_events = [e for e in LEAN["modelWall"].pins.history()
                        if e.get("probeId")
                        == "graph-model.wall.ingest.greenGuard"
                        and e["payload"].get("nodeId") in green_ids]
        self.assertTrue(guard_events)
        self.assertTrue(all(e["payload"].get("allowedGreen") is True
                            for e in guard_events))
        rejected = [e for e in LEAN["modelWall"].pins.history()
                    if e.get("probeId") == "graph-model.wall.ingest.rejected"
                    and any(gid in str(e["payload"]) for gid in green_ids)]
        self.assertEqual(rejected, [])

    def test_resolved_proof_uses_edge_and_no_leads(self):
        """REWRITTEN from test_nodes_and_leads_only (edges==[] asserted the
        G-tier absence): the kernel-resolved proof_uses edge EXISTS now and
        the former candidate leads are resolved/probed away."""
        g = LEAN["analysis"]["graph"]
        names = names_of(LEAN)
        self.assertTrue(g["nodes"])
        self.assertEqual(len(g["edges"]), 1)
        e = g["edges"][0]
        self.assertEqual(e["kind"], "proof_uses")
        self.assertEqual(names[e["srcId"]], "unused_hyp.uses_base")
        self.assertEqual(names[e["dstId"]], "unused_hyp.base_fact")
        self.assertIs(e["resolved"], True)
        self.assertEqual(e["resolver"], "lean-kernel")
        self.assertEqual(e["provenance"]["extractor"], "lean-driver")
        self.assertEqual(g["leads"], [])    # resolved world: zero leads out
        # provenance rows for the edge exist (no holes — asserted globally
        # too, but the arriving edge is the point of this round)
        self.assertIsNotNone(
            LEAN["analysis"]["provenance"]["edges"][e["id"]]["resolved"])

    def test_incomplete_bases_empty_in_resolved_world(self):
        """REWRITTEN from test_incomplete_bases_populated_for_nodes_with_
        leads_out: the former G-tier leads became resolved edges / probed
        rejections, so NO lean node has a lead out of its base any more —
        incompleteBases is honestly EMPTY (nothing is lead-capped)."""
        gap = LEAN["analysis"]["gapAnalysis"]
        self.assertEqual(gap["incompleteBases"], {})
        self.assertEqual(LEAN["analysis"]["graph"]["leads"], [])

    def test_undeclared_markers_never_inferred(self):
        """KEPT verbatim (semantics unchanged by verdict arrival): roots are
        still undeclared on this input — reachability refuses honestly."""
        gap = LEAN["analysis"]["gapAnalysis"]
        self.assertTrue(gap["undeclared"])
        self.assertEqual(gap["unused"], [])
        self.assertEqual(gap["unreferenced"], [])
        self.assertTrue(gap["reachability"]["undeclared"])
        self.assertEqual(gap["reachability"]["wallRefusal"],
                         "roots-undeclared")
        refusals = LEAN["outerLog"].events("outerwall.gap.refusal")
        self.assertTrue(refusals)


if __name__ == "__main__":
    unittest.main(verbosity=2)
