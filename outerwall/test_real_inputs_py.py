"""REAL-INPUTS suite part 1 — vendored pins + colorama (SUB200 split of
test_real_inputs.py; classes + tests verbatim, sessions from ow_real_shared).

Run standalone or via the test_real_inputs.py aggregator.
"""
from __future__ import annotations

import hashlib
import unittest
from collections import Counter

import ow_real_shared as shared
from ow_real_shared import FIXTURES, SHA_PINS, names_of

import outerwall
from outerwall import provenance as prov_mod

PY: dict
PY_BYTES: bytes
PY2_BYTES: bytes


def setUpModule():
    global PY, PY_BYTES, PY2_BYTES
    PY = shared.py_session()
    PY_BYTES = shared.py_bytes()
    PY2_BYTES = shared.py2_bytes()


class Test00VendoredBytesPinned(unittest.TestCase):
    """The REAL inputs are frozen evidence: every vendored byte matches its
    PROVENANCE.md sha256 pin.  Drift = build failure, never a re-baseline."""

    def test_every_vendored_file_matches_its_pin(self):
        for path, want in sorted(SHA_PINS.items()):
            got = hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(got, want, f"vendored fixture drifted: {path}")

    def test_provenance_notes_exist_with_license(self):
        for note in (FIXTURES / "real_py" / "PROVENANCE.md",
                     FIXTURES / "real_lean" / "PROVENANCE.md"):
            text = note.read_text(encoding="utf-8")
            self.assertIn("License", text)
            self.assertIn("sha256", text)
        # permissive license texts vendored alongside (BSD-3 / Apache-2.0)
        self.assertTrue((FIXTURES / "real_py"
                         / "LICENSE.colorama.txt").exists())
        self.assertTrue((FIXTURES / "real_lean"
                         / "LICENSE.lean4.txt").exists())


class Test01RealPyColorama(unittest.TestCase):
    """colorama 0.4.6 through the REAL stack: live pyright resolution on a
    genuine package, module-root expansion, honest all-unknown verdicts."""

    def test_two_independent_runs_byte_identical(self):
        """ID STABILITY: content-addressed ids (and everything else in the
        canonical analysis) byte-compare EQUAL across two fully independent
        live-pyright runs."""
        self.assertEqual(PY_BYTES, PY2_BYTES)
        self.assertGreater(len(PY_BYTES), 1000)

    def test_graph_well_formed_against_canonical_schema(self):
        conforms, errors = outerwall.validate_graph(PY["analysis"]["graph"])
        self.assertTrue(conforms, errors)

    def test_shape_frozen(self):
        """The measured shape of the real package, frozen: 28 nodes
        (5 modules + 13 functions + 10 classes), 27 resolved edges,
        26 leads.  A change here is a REAL behavior change to explain."""
        g = PY["analysis"]["graph"]
        self.assertEqual(len(g["nodes"]), 28)
        self.assertEqual(Counter(n["kind"] for n in g["nodes"]),
                         Counter({"module": 5, "function": 13, "class": 10}))
        self.assertEqual(len(g["edges"]), 27)
        self.assertEqual(len(g["leads"]), 26)
        self.assertEqual(
            Counter((e["kind"], e["resolver"]) for e in g["edges"]),
            Counter({("calls", "pyright"): 19, ("imports", "grimp"): 5,
                     ("inherits", "pyright"): 3}))

    def test_no_green_anywhere_pyright_is_not_a_verdict_checker(self):
        """Verdicts consistent with the checker's ACTUAL output: pyright
        resolves, it does not verify — literally zero green, all unknown."""
        g = PY["analysis"]["graph"]
        self.assertEqual({n["fill"]["status"] for n in g["nodes"]},
                         {"unknown"})
        self.assertEqual({n["outline"]["status"] for n in g["nodes"]},
                         {"unknown"})
        for v in PY["analysis"]["verdicts"].values():
            self.assertNotEqual(v["fill"]["status"], "green")

    def test_module_root_expanded_and_reachability_meaningful(self):
        """roots ['colorama.initialise'] (module vocabulary) expands to the
        module's real decl members; reachability then flags the genuinely
        unreached ansi/winterm helpers as unused — REAL dead-code analysis
        on a REAL package, frozen."""
        nm = names_of(PY)
        declared = {nm[i] for i in PY["declaredRoots"]}
        self.assertIn("colorama.initialise.init", declared)
        self.assertIn("colorama.initialise.wrap_stream", declared)
        gap = PY["analysis"]["gapAnalysis"]
        self.assertFalse(gap["undeclared"])
        unused = {nm[i] for i in gap["unused"]}
        self.assertEqual(unused, {
            "colorama.ansi.AnsiBack", "colorama.ansi.AnsiCodes",
            "colorama.ansi.AnsiCursor", "colorama.ansi.AnsiFore",
            "colorama.ansi.AnsiStyle", "colorama.ansi.clear_line",
            "colorama.ansi.clear_screen", "colorama.ansi.code_to_chars",
            "colorama.ansi.set_title", "colorama.winterm.WinColor",
            "colorama.winterm.WinStyle"})
        reachable = {nm[i] for i in gap["reachability"]["reachable"]}
        self.assertIn("colorama.ansitowin32.AnsiToWin32", reachable)
        self.assertIn("colorama.winterm.WinTerm", reachable)

    def test_capability_measured_ct_live(self):
        cap = PY["analysis"]["provenance"]["capability"]["python"]
        self.assertEqual(cap["measuredBy"], "capability-layer")
        self.assertEqual(cap["tier"], "CT")
        self.assertEqual(cap["measuredTierPin"]["measuredTier"], "CT")
        # the bare package dir extracted DIRECT (root-fix world)
        self.assertEqual(PY["staging"]["mode"], "direct")

    def test_provenance_complete_no_holes(self):
        prov = PY["analysis"]["provenance"]
        graph = PY["analysis"]["graph"]
        prov_mod.assert_no_holes(graph, prov, PY["outerLog"])
        for n in graph["nodes"]:
            rec = prov["nodes"][n["id"]]
            for field in ("cell", "tier", "extractor", "resolved"):
                self.assertIsNotNone(rec[field], (n["id"], field))
        for row in graph["edges"] + graph["leads"]:
            rec = prov["edges"][row["id"]]
            for field in ("cell", "tier", "extractor", "resolved"):
                self.assertIsNotNone(rec[field], (row["id"], field))


if __name__ == "__main__":
    unittest.main(verbosity=2)
