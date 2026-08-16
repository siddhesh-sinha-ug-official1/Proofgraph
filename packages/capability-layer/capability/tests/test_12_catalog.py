"""Gate 12 — the self-describing catalog (Probe Contract §3).

Every probeId that fires during the skeleton runs appears in probeCatalog();
a firing-but-uncatalogued lead fails (the bus enforces it at emit time — this
gate asserts it positively). The catalog must also contain EVERY lead mandated
by build-prompt Section 6, whether or not this repo's runs happen to fire it.
"""

import unittest

from capability import probeCatalog
from capability.probes import ProbeBus, ProbeError
from capability.tests import common

REQUIRED_LEADS = [
    # Stage A
    "capability.discovery.input", "capability.discovery.source.query",
    "capability.discovery.candidate", "capability.discovery.grammar",
    "capability.discovery.scip", "capability.discovery.compilerMode",
    "capability.discovery.libSource", "capability.discovery.none",
    "capability.discovery.output", "capability.discovery.timing",
    # Stage B
    "capability.gate.maintenance", "capability.gate.archived",
    "capability.gate.license", "capability.gate.output",
    # Stage C
    "capability.score.s1", "capability.score.s2", "capability.score.s3",
    "capability.score.s4", "capability.score.s5", "capability.score.s6",
    "capability.score.paperTier", "capability.score.grades",
    # Stage D
    "capability.tree.rung.official", "capability.tree.rung.community",
    "capability.tree.rung.structure", "capability.tree.rung.grammar",
    "capability.tree.rung.plaintext", "capability.tree.rejected",
    "capability.tree.dynamicCeiling", "capability.tree.extras",
    "capability.tree.chosen",
    # Stage E
    "capability.shim.readMsg", "capability.shim.send",
    "capability.shim.initialize", "capability.shim.encoding.negotiate",
    "capability.shim.check.call", "capability.shim.check.diag",
    "capability.shim.columnMap", "capability.shim.query.type",
    "capability.shim.query.def", "capability.shim.query.refs",
    "capability.shim.doc.call", "capability.shim.stub",
    "capability.shim.fallback", "capability.shim.error",
    # Stage F
    "capability.floor.parse", "capability.floor.nodeTypes",
    "capability.floor.highlights", "capability.floor.symbol",
    "capability.floor.gotoHeuristic", "capability.floor.tier",
    # Stage G
    "capability.scip.emit.call", "capability.scip.document",
    "capability.scip.occurrence", "capability.scip.symbolInfo",
    "capability.scip.ingest",
    # Stage H
    "capability.lib.ondemand", "capability.lib.static",
    "capability.lib.registry", "capability.lib.nonuniform",
    # Stage I
    "capability.wire.route", "capability.wire.spawn",
    "capability.wire.capabilitiesReadback", "capability.wire.degrade",
    "capability.wire.cache.key", "capability.wire.cache.hit",
    "capability.wire.lifecycle", "capability.wire.crash",
    # Stage J
    "capability.probe.p0", "capability.probe.p1", "capability.probe.p2",
    "capability.probe.p2.inject", "capability.probe.p2.verdict",
    "capability.probe.p3", "capability.probe.p4", "capability.probe.p5",
    "capability.probe.p6", "capability.probe.p7", "capability.probe.p8",
    "capability.probe.p9", "capability.probe.p10", "capability.probe.p11",
    "capability.probe.msg", "capability.probe.measuredTier",
    "capability.probe.faked", "capability.probe.cap",
]


class TestCatalog(unittest.TestCase):
    def test_every_mandated_lead_is_catalogued(self):
        ids = {e["probeId"] for e in probeCatalog()}
        missing = [x for x in REQUIRED_LEADS if x not in ids]
        self.assertEqual(missing, [], f"mandated leads missing: {missing}")

    def test_catalog_entries_are_well_formed(self):
        for e in probeCatalog():
            for field in ("probeId", "kind", "payloadType", "description"):
                self.assertTrue(e.get(field), f"{e['probeId']}: empty {field}")

    def test_every_fired_lead_is_catalogued(self):
        ids = {e["probeId"] for e in probeCatalog()}
        for key in ("ct", "awk", "zigish"):
            cap = common.get_run(key)
            fired = {e["probeId"] for e in cap.probeStream}
            self.assertTrue(fired.issubset(ids),
                            f"{key}: uncatalogued leads fired: {fired - ids}")

    def test_uncatalogued_emit_is_a_bug(self):
        bus = ProbeBus()
        with self.assertRaises(ProbeError):
            bus.emit("capability.mystery.lead", "value", {}, stage="x")

    def test_kind_mismatch_is_a_bug(self):
        bus = ProbeBus()
        with self.assertRaises(ProbeError):
            bus.emit("capability.probe.p2.verdict", "value", {}, stage="probe")

    def test_secret_redaction_is_the_one_redaction(self):
        bus = ProbeBus()
        bus.emit("capability.discovery.source.query", "call",
                 {"source": "registry", "url": "u", "query": "q",
                  "response": {"hits": [], "raw": None},
                  "token": "abcd1234SECRET"},
                 stage="discovery")
        ev = bus.history()[-1]
        self.assertNotIn("SECRET", str(ev["payload"]["token"]))
        self.assertIn("CRET", ev["payload"]["token"])  # last-4 presence


if __name__ == "__main__":
    unittest.main()
