"""S0 gates: artifact agreement, the codegen wire, schema versioning / pinning."""
import copy
import json
import unittest

from context import CELL_ROOT, run_cell, only

from src.ids import sha256_hex
from src.schema_tools import (SchemaPinMismatch, check_pin, schema_hash)
from src.schemagen_core import regenerate

# Assembly Phase 0: the frozen pin of the CANONICAL schema package
# (packages/schema/PIN — Tree 1 v0 + the v0.1 amendment). Updated here from the
# pre-assembly hash 004b9d00… when this cell adopted the amended schema.json.
# Hard-coded on purpose: any future drift of schema/schema.json fails loudly.
CANONICAL_PIN_VERSION = "v0"
CANONICAL_PIN_HASH = \
    "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c"


class TestSchemaFreeze(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cell, cls.result = run_cell()

    def test_crosscheck_agree(self):
        # failure-class=schema-drift
        p = only(self.cell, "graph-model.schema.crosscheck")["payload"]
        self.assertTrue(p["agree"], f"schema artifacts drifted: {p['diff']}")
        self.assertEqual(p["tsKinds"], p["jsonKinds"])
        self.assertEqual(p["mdKinds"], p["jsonKinds"])
        self.assertEqual(p["jsonKinds"]["node"],
                         ["module", "function", "class", "theorem", "section",
                          "label", "figure", "decl"])
        self.assertEqual(p["jsonKinds"]["edge"],
                         ["calls", "imports", "includes", "inherits",
                          "references", "cites", "proof_uses"])

    def test_codegen_wire_byte_regenerable(self):
        # failure-class=codegen-drift — the cheap wire that silently drifts.
        # Wave-A/cluster-U1: graph-schema.ts is no longer cell-generated (its
        # rival generator silently missed the v0.1 amendment); regenerate() now
        # yields only schema.md, and graph-schema.ts is byte-synced to canonical.
        schema_obj = json.loads(
            (CELL_ROOT / "schema" / "schema.json").read_text(encoding="utf-8"))
        generated = regenerate(schema_obj)
        self.assertEqual(set(generated), {"schema.md"})
        for filename, content in generated.items():
            on_disk = (CELL_ROOT / "schema" / filename).read_bytes()
            self.assertEqual(on_disk, content.encode("utf-8"),
                             f"{filename} is not byte-regenerable from schema.json")
        p = only(self.cell, "graph-model.schema.codegen")["payload"]
        self.assertTrue(p["generated"])
        self.assertEqual(p["from"], "schema.json")
        self.assertEqual(p["to"], "schema.md")

    def test_graph_schema_ts_mirrors_canonical(self):
        # failure-class=codegen-drift — Wave-A/cluster-U1: the cell's TS
        # projection is a byte-mirror of packages/schema/gen/graph-schema.ts.
        # The S0 drift gate now points at canonical, so an amendment can no
        # longer reach canonical without this cell's S0 failing. The load.ts
        # probe's sha256 equals the canonical projection's (byte-mirror
        # observable in the stream).
        canonical = (CELL_ROOT.parent / "schema" / "gen"
                     / "graph-schema.ts").read_bytes()
        on_disk = (CELL_ROOT / "schema" / "graph-schema.ts").read_bytes()
        self.assertEqual(on_disk, canonical,
                         "schema/graph-schema.ts drifted from canonical projection")
        ts_probe = only(self.cell, "graph-model.schema.load.ts")["payload"]
        self.assertEqual(ts_probe["sha256"], sha256_hex(canonical))

    def test_freeze_result_probe(self):
        p = only(self.cell, "graph-model.schema.freeze.result")["payload"]
        self.assertTrue(p["frozen"])
        self.assertEqual(p["version"], "v0")
        self.assertEqual([a["name"] for a in p["artifacts"]],
                         ["schema.json", "graph-schema.ts", "schema.md"])
        version = only(self.cell, "graph-model.schema.version")["payload"]
        self.assertEqual(version["schemaVersion"], "v0")

    def test_schema_hash_matches_canonical_file(self):
        schema_obj = json.loads(
            (CELL_ROOT / "schema" / "schema.json").read_text(encoding="utf-8"))
        p = only(self.cell, "graph-model.schema.hash")["payload"]
        self.assertEqual(p["schemaHash"], schema_hash(schema_obj))

    def test_canonical_assembly_pin(self):
        # failure-class=schema-pin-mismatch — same spirit as the old freeze pin
        # (which pinned 004b9d00…, the pre-amendment hash): the schema this cell
        # freezes must BE the canonical assembly schema, checked via check_pin
        # against the hard-coded (version, hash) pair from packages/schema/PIN.
        schema_obj = json.loads(
            (CELL_ROOT / "schema" / "schema.json").read_text(encoding="utf-8"))
        version = only(self.cell, "graph-model.schema.version")\
            ["payload"]["schemaVersion"]
        shash = only(self.cell, "graph-model.schema.hash")\
            ["payload"]["schemaHash"]
        check_pin(CANONICAL_PIN_VERSION, CANONICAL_PIN_HASH, version, shash)
        check_pin(CANONICAL_PIN_VERSION, CANONICAL_PIN_HASH,
                  schema_obj["schemaVersion"], schema_hash(schema_obj))

    def test_consumer_pin_detects_drift(self):
        # failure-class=schema-pin-mismatch — the constitution must be pin-able.
        # The consumer pins to what the FREEZE PROBES advertised (probe output
        # is the test substrate), then the schema drifts underneath it.
        schema_obj = json.loads(
            (CELL_ROOT / "schema" / "schema.json").read_text(encoding="utf-8"))
        pinned_version = only(self.cell, "graph-model.schema.version")\
            ["payload"]["schemaVersion"]
        pinned_hash = only(self.cell, "graph-model.schema.hash")\
            ["payload"]["schemaHash"]
        freeze = only(self.cell, "graph-model.schema.freeze.result")["payload"]
        self.assertEqual((pinned_version, pinned_hash),
                         (freeze["version"], freeze["hash"]))
        # the pin holds against the unchanged schema
        check_pin(pinned_version, pinned_hash, pinned_version, schema_hash(schema_obj))
        # changing any kind changes the hash; the pinned consumer must fail fast
        mutated = copy.deepcopy(schema_obj)
        mutated["$defs"]["Node"]["properties"]["kind"]["enum"].append("macro")
        self.assertNotEqual(schema_hash(mutated), pinned_hash)
        with self.assertRaises(SchemaPinMismatch):
            check_pin(pinned_version, pinned_hash, pinned_version, schema_hash(mutated))
        # a version bump alone is also drift
        with self.assertRaises(SchemaPinMismatch):
            check_pin(pinned_version, pinned_hash, "v1", schema_hash(mutated))


if __name__ == "__main__":
    unittest.main()
