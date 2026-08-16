"""Harness gates: import boundary, determinism, and stage-boundary integrity.
(Catalog completeness/enforcement, tap/dump/history, the error lead, secret
redaction, and no-silent-loss event accounting live in
test_harness_catalog.py.)"""
import tempfile
import unittest
from pathlib import Path

from context import CELL_ROOT, GraphModelCell, events, only, run_cell

from src.importgate import ImportBoundaryViolation, run_gate
from src.stages import PIPELINE


class TestImportGate(unittest.TestCase):
    def test_gate_passes_clean(self):
        # failure-class=import-boundary-violation; wired BEFORE features
        cell, _ = run_cell()
        p = only(cell, "graph-model.harness.importGate")["payload"]
        self.assertTrue(p["pass"])
        self.assertEqual(p["violations"], [])
        self.assertEqual(p["declaredDeps"], ["networkx", "rustworkx"])
        for lib in ("networkx", "rustworkx"):
            self.assertIn(lib, p["observedImports"])

    def test_injected_forbidden_import_flips_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "evil.py"
            bad.write_text("import tree_sitter\nimport react\n", encoding="utf-8")
            gate = run_gate(CELL_ROOT, extra_files=[bad])
            self.assertFalse(gate["pass"])
            self.assertEqual(gate["violations"], ["react", "tree_sitter"])
            # and the full run() refuses to proceed, with the probe on the bus
            cell = GraphModelCell(CELL_ROOT)
            with self.assertRaises(ImportBoundaryViolation):
                cell.run("fixtures/sample.py", "fixtures/roots.json",
                         extra_gate_files=[bad])
            p = only(cell, "graph-model.harness.importGate")["payload"]
            self.assertFalse(p["pass"])
            err = only(cell, "graph-model.harness.error")["payload"]
            self.assertEqual(err["errorClass"], "ImportBoundaryViolation")
            end = only(cell, "graph-model.harness.run.end")["payload"]
            self.assertFalse(end["ok"])


def _normalized_history(cell):
    """Strip wall-clock fields — the ONLY nondeterministic surface allowed
    (Contract 6: real time never drives ordering or assertions)."""
    out = []
    for e in cell.history():
        e = dict(e)
        e.pop("wallNanos")
        if e["kind"] == "timing":
            e["payload"] = {"stage": e["payload"]["stage"]}
        out.append(e)
    return out


class TestDeterminism(unittest.TestCase):
    def test_same_input_same_probe_stream(self):
        # failure-class=nondeterminism
        cell1, _ = run_cell()
        cell2, _ = run_cell()
        h1, h2 = _normalized_history(cell1), _normalized_history(cell2)
        self.assertEqual(len(h1), len(h2))
        for a, b in zip(h1, h2):
            self.assertEqual(a, b)

    def test_logical_clock_is_dense_and_monotonic(self):
        cell, _ = run_cell()
        clocks = [e["logicalClock"] for e in cell.history()]
        self.assertEqual(clocks, list(range(len(clocks))))

    def test_cause_ids_reference_earlier_events(self):
        cell, _ = run_cell()
        seen = set()
        for e in cell.history():
            ref = f"{e['probeId']}@{e['logicalClock']}"
            if e["causeId"] is not None:
                self.assertIn(e["causeId"], seen,
                              f"{ref} caused by unseen {e['causeId']}")
            seen.add(ref)


class TestStageBoundaries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cell, _ = run_cell()

    def test_every_stage_has_in_out_timing(self):
        for stage, _mod in PIPELINE:
            for suffix in ("__in", "__out", "__timing"):
                self.assertEqual(
                    len(events(self.cell, f"graph-model.{stage}.{suffix}")), 1)

    def test_out_n_deep_equals_in_n_plus_1(self):
        # a mismatch means a boundary silently mutated data
        names = [s for s, _ in PIPELINE]
        for prev, nxt in zip(names, names[1:]):
            out_p = only(self.cell, f"graph-model.{prev}.__out")["payload"]
            in_p = only(self.cell, f"graph-model.{nxt}.__in")["payload"]
            self.assertEqual(out_p, in_p,
                             f"boundary {prev}->{nxt} mutated the pipeline ctx")

    def test_timing_lives_only_in_wall_fields(self):
        for stage, _mod in PIPELINE:
            p = only(self.cell, f"graph-model.{stage}.__timing")["payload"]
            self.assertEqual(set(p.keys()),
                             {"stage", "wallNanosStart", "wallNanosEnd", "deltaNanos"})


if __name__ == "__main__":
    unittest.main()
