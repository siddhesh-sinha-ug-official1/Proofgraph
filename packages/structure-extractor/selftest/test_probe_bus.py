"""Probe-bus contract tests: catalog completeness, determinism, redaction,
tap/history — the Probe Density Contract made executable."""
import unittest

from harness import run_lang, run_rich, run_skeleton

from extractor.probe import (CATALOG, ProbeKindMismatchError,
                             UncataloguedProbeError, make_bus)

# Spot-check that the §6 must-have leads are all catalogued (incl. dormant ones).
MUST_HAVE = [
    "extractor.boundary.import.check", "extractor.stage.timing",
    "extractor.error.caught", "extractor.cap.applied",
    "extractor.ingest.projectroot.detect", "extractor.ingest.capability.response",
    "extractor.ingest.dock.unavailable",
    "extractor.t1.parse.grammar", "extractor.t1.tagsscm.diy.warning",
    "extractor.t1.node.emit", "extractor.t1.node.lean", "extractor.t1.node.latex",
    "extractor.t1.node.typst", "extractor.t1.anchor.emit",
    "extractor.t1.roundtrip.check",
    "extractor.t2.dock.contract.return",
    "extractor.t2.py.grimp.import.resolved", "extractor.t2.py.call.resolve.decision",
    "extractor.t2.py.scip.fallback", "extractor.t2.py.honest_ceiling",
    "extractor.t2.lean.import.cycle.na", "extractor.t2.lean.axiom.gap",
    "extractor.t2.lean.honest_ceiling",
    "extractor.t2.latex.backend.select", "extractor.t2.latex.honest_ceiling",
    "extractor.t2.typst.query.deprecated", "extractor.t2.typst.honest_ceiling",
    "extractor.assemble.provenance.audit", "extractor.assemble.graph.emit",
    "extractor.t3.graph.exclude.unresolved", "extractor.t3.agreement.diff",
    "extractor.t3.soundness.blindspots", "extractor.t3.unreferenced",
    "extractor.backend.grimp.req", "extractor.backend.pyright.resp",
    "extractor.backend.latexml.req", "extractor.backend.typstEval.req",
    "extractor.backend.timeout",
    "extractor.provenance.anonymous.violation",
    "extractor.resolve.reason.histogram", "extractor.gaps.honest",
    "extractor.output.honest_ceiling.report", "extractor.output.summary",
]


class TestProbeBus(unittest.TestCase):
    def test_catalog_contains_all_spec_leads(self):
        ids = {c[0] for c in CATALOG}
        missing = [m for m in MUST_HAVE if m not in ids]
        self.assertEqual(missing, [])

    def test_uncatalogued_probe_is_a_bug(self):
        bus = make_bus()
        with self.assertRaises(UncataloguedProbeError):
            bus.emit("extractor.not.a.lead", "x", "value", {})

    def test_kind_mismatch_is_a_bug(self):
        bus = make_bus()
        with self.assertRaises(ProbeKindMismatchError):
            bus.emit("extractor.cap.applied", "x", "value", {})  # catalogued as decision

    def test_every_fired_probe_is_catalogued(self):
        cell = run_rich()
        catalog = {c["probeId"] for c in cell.probeCatalog()}
        for pid in cell.bus.fired_probe_ids():
            self.assertIn(pid, catalog)

    def test_secret_redaction_last4_only(self):
        bus = make_bus()
        ev = bus.emit("extractor.cap.applied", "x", "decision",
                      {"capName": "t", "apiKey": "sk-abcdef9999", "limit": 1,
                       "actual": 1, "dropped": []})
        self.assertEqual(ev.payload["apiKey"], "<redacted:…9999>")

    def test_tap_receives_live_events(self):
        bus = make_bus()
        seen = []
        bus.tap("extractor.cap.applied", seen.append)
        bus.emit("extractor.cap.applied", "x", "decision",
                 {"capName": "t", "limit": 1, "actual": 1, "dropped": []})
        self.assertEqual(len(seen), 1)

    def test_causal_chain_present(self):
        cell = run_skeleton()
        with_cause = [e for e in cell.bus._events if e.causeId]
        self.assertGreater(len(with_cause), 30)
        refs = {e.ref() for e in cell.bus._events}
        for e in with_cause:
            self.assertIn(e.causeId, refs, f"dangling causeId {e.causeId}")

    def test_history_deterministic_modulo_wallnanos(self):
        h1 = run_skeleton().history(strip_wall=True)
        h2 = run_skeleton().history(strip_wall=True)
        self.assertEqual(h1, h2)

    def test_history_deterministic_stub_docks(self):
        # lean pinned to G (stub-path determinism); CT-path determinism —
        # driver stdout, runSha, verdicts — is asserted in test_lean_ct_dock.py
        from harness import force_tier_g
        for sub in ("lean", "latex", "typst"):
            kw = {"capability_fn": force_tier_g} if sub == "lean" else {}
            h1 = run_lang(sub, **kw).history(strip_wall=True)
            h2 = run_lang(sub, **kw).history(strip_wall=True)
            self.assertEqual(h1, h2, f"non-deterministic history for {sub}")


if __name__ == "__main__":
    unittest.main()
