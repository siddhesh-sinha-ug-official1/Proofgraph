"""LEAN-DOCK round — the guard tests (split from test_lean_ct_dock.py,
SUB200 restructure; total test count unchanged, no assertion touched):

  * the verdict mapping as a PURE function (no driver needed);
  * the forged-green guard (failure class unbacked-green) REJECTS a green
    without kernel evidence — at schema, assemble, and tier level;
  * driver-dead (timeout/crash) is a TYPED failure with no partial green.
"""
import sys
import unittest

from harness import force_tier_g, payloads, run_lang
from lean_ct_common import skip_without_lean

from extractor.assemble import UnbackedGreenError, assemble
from extractor.capability import CapabilityHandle, stub_capability
from extractor.docks.lean_dock import lean_verdict
from extractor.probe import make_bus
from extractor.schema import SchemaNode, SchemaViolation, Span


class TestLeanVerdictMapping(unittest.TestCase):
    """The spike's verdict mapping as a PURE function — no driver needed.
    green candidate = kernelAccepted ∧ ¬usesSorry ∧ unexpectedAxioms=[];
    forged inputs (kernelAccepted false) can never come out green."""

    CLEAN = {"kernelAccepted": True, "usesSorry": False, "unexpectedAxioms": []}

    def test_clean_decl_in_clean_file_is_green(self):
        v, _ = lean_verdict(dict(self.CLEAN), False, False)
        self.assertEqual(v, "green")

    def test_kernel_rejected_never_green(self):
        v, reason = lean_verdict({**self.CLEAN, "kernelAccepted": False},
                                 False, False)
        self.assertEqual(v, "unknown")
        self.assertIn("kernelAccepted false", reason)

    def test_sorry_is_amber_even_when_kernel_accepted(self):
        v, _ = lean_verdict({**self.CLEAN, "usesSorry": True,
                             "unexpectedAxioms": ["sorryAx"]}, False, False)
        self.assertEqual(v, "amber")

    def test_unexpected_axiom_blocks_green(self):
        v, reason = lean_verdict({**self.CLEAN, "unexpectedAxioms": ["myAx"]},
                                 False, False)
        self.assertEqual(v, "unknown")
        self.assertIn("myAx", reason)

    def test_absence_is_never_green(self):
        v, reason = lean_verdict(None, False, False)
        self.assertEqual(v, "unknown")
        self.assertIn("never green from absence", reason)

    def test_absence_with_error_in_span_is_red(self):
        v, _ = lean_verdict(None, True, True)
        self.assertEqual(v, "red")

    def test_error_in_span_beats_kernel_accepted(self):
        v, _ = lean_verdict(dict(self.CLEAN), True, True)
        self.assertEqual(v, "red")

    def test_errored_file_blocks_green_conservatively(self):
        v, reason = lean_verdict(dict(self.CLEAN), False, True)
        self.assertEqual(v, "unknown")
        self.assertIn("green blocked", reason)


class TestUnbackedGreenGuard(unittest.TestCase):
    """Failure class unbacked-green: a forged green is REJECTED by the cell's
    own validation — schema level AND assemble level AND tier level."""

    @staticmethod
    def _node(fill, origin, nid="n_00000000000000cc"):
        return SchemaNode(
            id=nid, kind="theorem", lang="lean", name="Forged.thm",
            signature=None, span=Span("Forged.lean", 0, 10),
            fill=fill, origin=origin,
            provenance={"tier": "T1", "extractor": "tree-sitter",
                        "resolved": True})

    def test_schema_validate_rejects_unbacked_green(self):
        forged = self._node({"status": "green", "source": ""}, "assumed")
        with self.assertRaises(SchemaViolation) as ctx:
            forged.validate()
        self.assertIn("unbacked-green", str(ctx.exception))

    def test_assemble_rejects_green_without_attestation(self):
        # missing driver evidence: unregistered source, origin not "checked"
        bus = make_bus()
        forged = self._node({"status": "green", "source": "i-promise"}, "assumed")
        with self.assertRaises(UnbackedGreenError):
            assemble(bus, [forged], {}, {"lean": stub_capability("lean")})
        self.assertEqual(
            len(bus.events(probeId="extractor.green.enforcement.violation")), 1)

    def test_assemble_rejects_green_at_non_ct_tier(self):
        # a kernel-shaped source CANNOT rescue a green at tier G — the tier
        # the capability seam reported wins (no self-upgrade, §5.8)
        bus = make_bus()
        forged = self._node(
            {"status": "green",
             "source": "lean-kernel:v4.31.0:kernelAccepted decl=thm run=deadbeef"},
            "checked")
        with self.assertRaises(UnbackedGreenError):
            assemble(bus, [forged], {},
                     {"lean": CapabilityHandle("lean", "G", "tree-sitter-floor")})

    def test_attested_green_at_ct_passes(self):
        bus = make_bus()
        good = self._node(
            {"status": "green",
             "source": "lean-kernel:v4.31.0:kernelAccepted decl=thm run=deadbeef"},
            "checked")
        edges, _ = assemble(bus, [good], {}, {"lean": stub_capability("lean")})
        self.assertEqual(edges, [])
        audit = bus.events(probeId="extractor.assemble.green.audit")
        self.assertEqual(len(audit), 1)
        self.assertIs(audit[0].payload["attested"], True)
        self.assertEqual(
            bus.events(probeId="extractor.green.enforcement.violation"), [])


class TestDriverDeadPaths(unittest.TestCase):
    """Driver timeout/crash → typed failure, decls unjudged, no partial green."""

    def test_timeout_is_typed_tree_killed_and_green_free(self):
        skip_without_lean()
        cell = run_lang("lean_ct", lean_driver_timeout_s=0.001)
        dead = payloads(cell, "extractor.t2.lean.driver.dead")
        self.assertEqual(len(dead), 1)
        self.assertEqual(dead[0]["failureClass"], "driver-timeout")
        self.assertTrue(payloads(cell, "extractor.backend.timeout"))
        state = cell.dump()
        self.assertEqual(state["edges"], [], "no partial edges from a dead driver")
        for n in state["nodes"]:
            self.assertNotEqual(n["fill"]["status"], "green",
                                "no partial green from a dead driver")
            self.assertEqual(n["fill"]["status"], "unknown")
        verdicts = payloads(cell, "extractor.t2.lean.verdict")
        self.assertTrue(verdicts)
        for v in verdicts:
            self.assertEqual(v["verdict"], "unknown")
            self.assertIn("driver dead (driver-timeout)", v["reason"])
        ceiling = state["honestCeilings"][0]
        self.assertEqual(ceiling["driverDeadFiles"],
                         {"Verified.lean": "driver-timeout"})

    def test_crash_is_typed_and_green_free(self):
        # a wrong binary (python) exits != {0,1} on the driver argv shape:
        # the typed driver-crash path, no toolchain needed
        cell = run_lang("lean_ct", lean_driver_exe=sys.executable)
        dead = payloads(cell, "extractor.t2.lean.driver.dead")
        self.assertEqual(len(dead), 1)
        self.assertIn(dead[0]["failureClass"], ("driver-crash", "driver-bad-json"))
        state = cell.dump()
        self.assertEqual(state["edges"], [])
        for n in state["nodes"]:
            self.assertNotEqual(n["fill"]["status"], "green")

    def test_g_regression_no_driver_probes_at_tier_g(self):
        # tier-G regression beyond the golden: the pinned-G run must never
        # touch the driver (tier semantics stay measured, no self-upgrade)
        cell = run_lang("lean", capability_fn=force_tier_g)
        for pid in ("extractor.t2.lean.driver.invoke",
                    "extractor.backend.leanDriver.req",
                    "extractor.t2.lean.verdict",
                    "extractor.t2.lean.driver.dead"):
            self.assertEqual(payloads(cell, pid), [], pid)
        for n in cell.dump()["nodes"]:
            self.assertEqual(n["fill"]["status"], "unknown")


if __name__ == "__main__":
    unittest.main(verbosity=2)
