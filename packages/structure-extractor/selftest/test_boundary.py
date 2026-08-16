"""Import-boundary gate tests (Operating Contract 3) — wired before features,
tested first.  Asserts on probe output."""
import tempfile
import unittest
from pathlib import Path

from harness import TREE, run_skeleton

from extractor.boundary import BoundaryViolation, check_boundary
from extractor.probe import make_bus


class TestBoundaryGate(unittest.TestCase):
    def test_cell_imports_only_declared_deps(self):
        bus = make_bus()
        violations = check_boundary(bus)
        self.assertEqual(violations, [])
        checks = bus.events(probeId="extractor.boundary.import.check")
        self.assertGreater(len(checks), 5)
        self.assertTrue(all(e.payload["allowed"] for e in checks))

    def test_license_posture_probed(self):
        bus = make_bus()
        check_boundary(bus)
        posture = bus.events(probeId="extractor.boundary.license.posture")[0].payload
        self.assertEqual(posture["declaredDeps"]["grimp"], "BSD-2-Clause")
        self.assertIn("GPL-3.0", posture["subprocessOnly"]["texlab"])

    def test_undeclared_and_copyleft_imports_fail(self):
        with tempfile.TemporaryDirectory() as td:
            pkg = Path(td) / "fakecell"
            pkg.mkdir()
            (pkg / "bad.py").write_text("import requests\nimport texlab\n")
            bus = make_bus()
            with self.assertRaises(BoundaryViolation):
                check_boundary(bus, package_root=pkg)
            checks = bus.events(probeId="extractor.boundary.import.check")
            denied = {e.payload["importedModule"] for e in checks if not e.payload["allowed"]}
            self.assertEqual(denied, {"requests", "texlab"})

    def test_gate_runs_first_in_pipeline(self):
        cell = run_skeleton()
        history = cell.history(strip_wall=True)
        first_check = next(i for i, e in enumerate(history)
                           if e["probeId"] == "extractor.boundary.import.check")
        first_feature = next(i for i, e in enumerate(history)
                             if e["probeId"] == "extractor.ingest.file")
        self.assertLess(first_check, first_feature,
                        "boundary gate must fire before any feature probe")


if __name__ == "__main__":
    unittest.main()
