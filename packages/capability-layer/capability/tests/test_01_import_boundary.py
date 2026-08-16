"""Gate 1 — the import-boundary gate (wired FIRST; Operating Contract rule 3).

The cell may import only its declared dependencies; reaching outside them fails
the build — and the gate itself is tested against a forbidden import.
"""

import os
import unittest

from capability import importgate


class TestImportBoundary(unittest.TestCase):
    def test_whole_package_is_clean(self):
        violations = importgate.check_import_boundary()
        self.assertEqual(violations, [],
                         f"forbidden imports found: {violations}")

    def test_reaching_into_another_tree_is_rejected(self):
        src = "from tree3.edge_extractor import extract_edges\n"
        self.assertEqual(importgate.violations_of_source(src), ["tree3"])

    def test_undeclared_third_party_is_rejected(self):
        self.assertEqual(importgate.violations_of_source("import requests\n"),
                         ["requests"])
        self.assertEqual(importgate.violations_of_source("import numpy as np\n"),
                         ["numpy"])

    def test_declared_seams_and_stdlib_pass(self):
        src = ("import json\nimport subprocess\nimport tree_sitter\n"
               "from capability import probes\nfrom . import spine\n")
        self.assertEqual(importgate.violations_of_source(src), [])

    def test_gate_scans_real_files(self):
        # the gate walks actual package files, not a cached list
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.assertTrue(os.path.exists(os.path.join(root, "probes.py")))
        self.assertEqual(importgate.check_import_boundary(root), [])


if __name__ == "__main__":
    unittest.main()
