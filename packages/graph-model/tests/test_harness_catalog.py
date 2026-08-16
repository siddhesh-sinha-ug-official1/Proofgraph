"""Harness gates, continued: catalog completeness/enforcement, tap/dump/
history, the error lead, secret redaction, and no-silent-loss event
accounting.  (Import boundary, determinism, and stage-boundary integrity live
in test_harness.py.)"""
import json
import unittest

from context import CELL_ROOT, C_ID, GraphModelCell, only, run_cell

from src.errors import CellError
from src.probe import CATALOG, CATALOG_BY_ID, ProbeBus, CatalogHoleError
from src.probe.bus import redact_secrets


class TestCatalog(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cell, _ = run_cell()

    def test_catalog_is_complete_and_unique(self):
        ids = [e["probeId"] for e in CATALOG]
        self.assertEqual(len(ids), len(set(ids)))
        # 104 baseline + 12 additive wall.* leads (Phase-1 wall; catalogs only grow)
        self.assertEqual(len(ids), 116)
        for entry in CATALOG:
            for key in ("probeId", "kind", "payloadType", "description"):
                self.assertTrue(entry[key], f"{entry['probeId']}: empty {key}")

    def test_every_fired_lead_is_cataloged_with_matching_kind(self):
        # a lead that fires but is absent from the catalog is a bug (Contract 3.3)
        for e in self.cell.history():
            entry = CATALOG_BY_ID.get(e["probeId"])
            self.assertIsNotNone(entry, f"uncataloged lead fired: {e['probeId']}")
            self.assertEqual(e["kind"], entry["kind"])
            self.assertEqual(e["cellId"], "graph-model")

    def test_bus_rejects_uncataloged_emission(self):
        # failure-class=catalog-hole
        bus = ProbeBus()
        with self.assertRaises(CatalogHoleError):
            bus.emit("graph-model.nonexistent.lead", "schema", "value", {})
        with self.assertRaises(CatalogHoleError):
            bus.emit("graph-model.schema.version", "schema", "decision", {})  # wrong kind

    def test_probe_event_shape(self):
        for e in self.cell.history():
            self.assertEqual(
                set(e.keys()),
                {"probeId", "cellId", "stage", "kind", "payload",
                 "logicalClock", "causeId", "wallNanos"})

    def test_history_is_json_serializable(self):
        json.dumps(self.cell.history())  # the firehose must be exportable


class TestIntrospection(unittest.TestCase):
    def test_tap_receives_live_events(self):
        cell = GraphModelCell(CELL_ROOT)
        seen = []
        unsubscribe = cell.tap("graph-model.node.create",
                               lambda ev: seen.append(ev["payload"]["node"]["id"]))
        cell.run("fixtures/sample.py", "fixtures/roots.json")
        self.assertEqual(len(seen), 4)
        unsubscribe()
        cell.run("fixtures/sample.py", "fixtures/roots.json")
        self.assertEqual(len(seen), 4)  # unsubscribed: no more deliveries
        with self.assertRaises(CatalogHoleError):
            cell.tap("graph-model.not.a.lead", lambda ev: None)

    def test_dump_returns_entire_state(self):
        cell, result = run_cell()
        d = cell.dump()
        self.assertEqual(d["state"]["t3"]["unused"], [C_ID])
        self.assertTrue(d["state"]["roundtrip"]["verdict"]["pass"])
        self.assertEqual(d["state"]["fill"]["counts"]["green"], 0)
        self.assertEqual(d["historyLength"], len(cell.history()))
        self.assertEqual(d["catalogSize"], 116)  # 104 baseline + 12 wall.* (additive)
        self.assertTrue(d["importGate"]["pass"])
        # dump is a snapshot, not a live reference
        d["state"]["t3"]["unused"].append("tamper")
        self.assertEqual(cell.dump()["state"]["t3"]["unused"], [C_ID])

    def test_run_end_event_count_no_silent_loss(self):
        cell, _ = run_cell()
        end = only(cell, "graph-model.harness.run.end")["payload"]
        self.assertTrue(end["ok"])
        self.assertEqual(end["eventCount"], len(cell.history()))
        begin = only(cell, "graph-model.harness.run.begin")
        self.assertEqual(begin["payload"]["startClock"], 0)
        self.assertEqual(begin["logicalClock"], 0)

    def test_error_lead_fires_and_wraps(self):
        cell = GraphModelCell(CELL_ROOT)
        with self.assertRaises(CellError) as caught:
            cell.run("fixtures/sample.py", "fixtures/does_not_exist.json")
        self.assertEqual(caught.exception.stage, "ingest")
        self.assertEqual(caught.exception.error_class, "FileNotFoundError")
        err = only(cell, "graph-model.harness.error")["payload"]
        self.assertEqual(err["stage"], "ingest")
        self.assertEqual(err["errorClass"], "FileNotFoundError")
        end = only(cell, "graph-model.harness.run.end")["payload"]
        self.assertFalse(end["ok"])

    def test_secret_redaction_presence_plus_last4(self):
        # Contract 3.9: the ONE redaction
        red = redact_secrets({"apiKey": "sk-abcdef12345678", "normal": "visible",
                              "nested": {"authToken": "t-99991234"}})
        self.assertEqual(red["apiKey"], "<redacted:present:last4=5678>")
        self.assertEqual(red["nested"]["authToken"], "<redacted:present:last4=1234>")
        self.assertEqual(red["normal"], "visible")


if __name__ == "__main__":
    unittest.main()
