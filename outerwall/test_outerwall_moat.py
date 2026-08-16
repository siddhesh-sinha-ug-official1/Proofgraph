"""OUTER-WALL suite part 1 — MOAT (SUB200 split of test_outerwall.py;
class + tests verbatim, sessions from ow_test_shared).

The python moat case (live pyright, real V1 measurement).
Run standalone or via the test_outerwall.py aggregator.
"""
from __future__ import annotations

import unittest
from copy import deepcopy
from pathlib import Path

import ow_test_shared as shared
from ow_test_shared import ACCEPTANCE, id_of, names_of

import outerwall
from outerwall import ProvenanceHole
from outerwall import provenance as prov_mod

MOAT: dict
LEAN: dict


def setUpModule():
    global MOAT, LEAN
    MOAT = shared.session("MOAT")
    LEAN = shared.session("LEAN")


class Test01Moat(unittest.TestCase):

    def test_unused_is_exactly_unused_fn(self):
        gap = MOAT["analysis"]["gapAnalysis"]
        self.assertFalse(gap["undeclared"])
        self.assertEqual(gap["unused"],
                         [id_of(MOAT, "moatpkg.helpers.unused_fn")])
        self.assertEqual(gap["unreferenced"], gap["unused"])
        # decl node, not the module — the moat story's exact target
        node = next(n for n in MOAT["analysis"]["graph"]["nodes"]
                    if n["id"] == gap["unused"][0])
        self.assertEqual(node["kind"], "function")

    def test_core_used_fn_reachable(self):
        reach = MOAT["analysis"]["gapAnalysis"]["reachability"]
        reachable_names = {names_of(MOAT)[i] for i in reach["reachable"]}
        self.assertIn("moatpkg.helpers.used_fn", reachable_names)
        self.assertIn("moatpkg.core.main", reachable_names)
        self.assertIn("moatpkg.core.side_calc", reachable_names)
        self.assertEqual(dict(reach["crosscheck"])["agrees"], True)

    def test_module_root_expanded_and_logged(self):
        """Roots ['moatpkg.core'] (module vocabulary) -> the module's direct
        decl members, per the V3 root-vocabulary translation — LOGGED."""
        want = sorted([id_of(MOAT, "moatpkg.core.main"),
                       id_of(MOAT, "moatpkg.core.side_calc")])
        self.assertEqual(sorted(MOAT["declaredRoots"]), want)
        events = MOAT["outerLog"].events("outerwall.roots.resolve")
        self.assertTrue(events)
        decisions = events[-1]["payload"]["decisions"]
        self.assertEqual(decisions[0]["outcome"], "module-name-expanded")
        self.assertEqual(sorted(decisions[0]["members"]), want)

    def test_outline_filled_unknown_everywhere_honest(self):
        """No compiler verdict is attached this round (the extractor NEVER
        computes fill; pyright here is resolution, not verdict) — so every
        outline.status is 'unknown', honestly, with worstOf ['none'] (empty
        contribution set) — non-empty per ruling 8, correct tokens."""
        consts = outerwall.schema_constants()
        vocab = set(consts["OUTLINE_WORST_ORDER"])
        for n in MOAT["analysis"]["graph"]["nodes"]:
            self.assertIsNotNone(n["outline"], n["id"])
            self.assertEqual(n["outline"]["status"], "unknown", n["id"])
            self.assertTrue(n["outline"]["worstOf"], n["id"])   # non-empty
            self.assertEqual(n["outline"]["worstOf"], ["none"], n["id"])
            self.assertTrue(set(n["outline"]["worstOf"]) <= vocab)

    def test_filled_graph_validates_against_canonical_schema(self):
        conforms, errors = outerwall.validate_graph(MOAT["analysis"]["graph"])
        self.assertTrue(conforms, errors)

    def test_verdicts_face_equals_wall_pins(self):
        """analysis['verdicts'] == modelWall.verdictOf == graph node rows —
        declared behavior never diverges from probed behavior."""
        wall = MOAT["modelWall"]
        for n in MOAT["analysis"]["graph"]["nodes"]:
            v = MOAT["analysis"]["verdicts"][n["id"]]
            wall_v = wall.verdictOf(n["id"])
            self.assertEqual(v, wall_v)
            self.assertEqual(v["outline"], n["outline"])
            self.assertEqual(v["fill"], n["fill"])

    def test_no_green_anywhere(self):
        self.assertNotIn("green", shared.all_statuses(MOAT))

    def test_capability_provenance_measured_not_asserted(self):
        cap = MOAT["analysis"]["provenance"]["capability"]["python"]
        self.assertEqual(cap["measuredBy"], "capability-layer")
        self.assertEqual(cap["tier"], "CT")
        # evidence pin refs: the measuredTier pin snapshot crossed the seam
        self.assertEqual(cap["measuredTierPin"]["measuredTier"], "CT")
        self.assertIn("schemaHash", cap["constructPin"])
        # V1 bounds logged, never silent
        bounds = [b["bound"] for b in
                  MOAT["analysis"]["provenance"]["capabilityBounds"]]
        self.assertIn("duplicated-subprocess", bounds)
        self.assertIn("no-grammar-floor", bounds)
        # the feed's LSP child was shut down (ownership honored)
        self.assertTrue(any(p.get("terminated") for p in MOAT["shutdownPins"]))

    def test_provenance_no_holes_and_hole_is_build_failing(self):
        prov = MOAT["analysis"]["provenance"]
        graph = MOAT["analysis"]["graph"]
        for n in graph["nodes"]:
            rec = prov["nodes"][n["id"]]
            for field in ("cell", "tier", "extractor", "resolved"):
                self.assertIsNotNone(rec[field], (n["id"], field))
        for row in graph["edges"] + graph["leads"]:
            rec = prov["edges"][row["id"]]
            for field in ("cell", "tier", "extractor", "resolved"):
                self.assertIsNotNone(rec[field], (row["id"], field))
        # tamper -> the named, build-failing class fires
        tampered = deepcopy(prov)
        victim = graph["nodes"][0]["id"]
        del tampered["nodes"][victim]
        with self.assertRaises(ProvenanceHole):
            prov_mod.assert_no_holes(graph, tampered, MOAT["outerLog"])
        holes = MOAT["outerLog"].events("outerwall.provenance.hole")
        self.assertTrue(holes)
        self.assertEqual(holes[-1]["payload"]["failureClass"],
                         "provenance-hole")

    def test_package_dir_extracts_direct_and_decision_logged(self):
        """Remediation round — UPDATED from test_staging_logged_with_byte_
        identity, reason: the package-root-uri-mismatch bound is FIXED in
        cell 3 (pyright_backend wire uris from didOpen'd absolute paths), so
        the outer wall no longer copy-stages a bare package dir; asserting
        the old staging behavior would assert the retired workaround.  The
        probe STAYS (a probe API never shrinks) and now records the direct
        decision; single-FILE staging remains sha256-pinned (LEAN below)."""
        staging = MOAT["staging"]
        self.assertIsNotNone(staging)
        self.assertEqual(staging["mode"], "direct")
        self.assertEqual(staging["bound"], "package-root-uri-mismatch")
        self.assertEqual(staging["extractionRoot"],
                         str(ACCEPTANCE / "moatpkg"))
        self.assertNotIn("stagedRoot", staging)     # no scratch copy anymore
        events = MOAT["outerLog"].events("outerwall.root.staged")
        self.assertTrue(events)
        self.assertEqual(events[-1]["payload"]["mode"], "direct")
        # the bug's signature INVERTED through the whole outer wall: a bare-
        # package-dir live extract resolves calls via pyright (they degraded
        # to leads before the cell fix)
        pyright_calls = [e for e in MOAT["analysis"]["graph"]["edges"]
                         if e["kind"] == "calls" and e["resolved"]
                         and e["resolver"] == "pyright"]
        self.assertTrue(pyright_calls,
                        "no pyright-resolved calls edges from the bare-dir "
                        "moat extract — the package-root-uri-mismatch "
                        "signature is back")
        # the declared consequence stands visible: span.file is INGEST-root-
        # relative, so the bare-dir extract mints no '<pkg>/' prefix
        for n in MOAT["analysis"]["graph"]["nodes"]:
            self.assertFalse(n["span"]["file"].startswith("moatpkg/"),
                             n["span"]["file"])

    def test_single_file_staging_still_sha_pinned(self):
        """The single-file staging leg is UNCHANGED by the remediation round
        (the extractor walks dirs — staging a lone file stays legitimate):
        sha256-pinned, byte-identical, logged."""
        staging = LEAN["staging"]
        self.assertIsNotNone(staging)
        self.assertEqual(staging["mode"], "staged")
        self.assertTrue(staging["byteIdentical"])
        self.assertIn("unused_hyp.lean", staging["files"])
        self.assertTrue(LEAN["outerLog"].events("outerwall.root.staged"))

    def test_H8_single_file_staging_scratch_cleaned_up_after_analyze(self):
        """[H8, pre-GitHub remediation Wave C] the single-file staging
        mkdtemp() used to leak: no rmtree, no context manager, one
        outerwall-stage-* dir per single-file analyze.  Fix: analyze_session
        now calls analyze_roots.cleanup_staging() in its finally.  The
        stagedRoot field records the path for provenance (unchanged), but
        the physical directory is gone by the time analyze returns."""
        staging = LEAN["staging"]
        self.assertEqual(staging["mode"], "staged")
        scratch = Path(staging["stagedRoot"])
        self.assertFalse(
            scratch.exists(),
            f"outerwall-stage temp dir leaked past analyze return: {scratch} "
            "(H8 regression — cleanup_staging not called in finally)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
