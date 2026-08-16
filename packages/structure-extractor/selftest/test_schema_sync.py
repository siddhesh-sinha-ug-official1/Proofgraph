"""MEMBRANE TEST — verified-in-sync with the canonical schema package.

Assembly swap pattern (b): this cell keeps local mirrors (so it stays
independently runnable and inside its import-boundary gate) but THIS test
asserts byte/value-identity with packages/schema — the single source of truth —
plus a check_pin assertion against the pinned schema identity.  Any drift
between the cell's mirror and the canonical package fails the suite loudly.

Covers here (SUB200 restructure — the placeholder/capability/envelope rulings
moved to test_schema_rulings.py; total test count unchanged):
  * ruling 5 — canonical mint (ids.py semantics, vectors.json golden gate)
  * schema PIN + enum/worst-order sync
"""
import json
import unittest

from harness import run_skeleton
from schema_sync_common import (SCHEMA_PKG, VECTORS, canonical_ids,
                                canonical_pin, canonical_tools,
                                schema_constants)

from extractor import schema as cell_schema


class TestSchemaPin(unittest.TestCase):
    def test_check_pin_against_canonical_schema(self):
        # The canonical package's own pin must hold...
        canonical_pin.assert_pin()
        # ...and the CELL's pinned pair must match it (check_pin assertion):
        pinned_version, pinned_hash = canonical_pin.read_pin()
        schema_obj = json.loads((SCHEMA_PKG / "schema.json").read_text(encoding="utf-8"))
        canonical_tools.check_pin(
            cell_schema.PINNED_SCHEMA_VERSION, cell_schema.PINNED_SCHEMA_HASH,
            schema_obj["schemaVersion"], canonical_tools.schema_hash(schema_obj))
        self.assertEqual(cell_schema.PINNED_SCHEMA_VERSION, pinned_version)
        self.assertEqual(cell_schema.PINNED_SCHEMA_HASH, pinned_hash)
        self.assertEqual(cell_schema.SCHEMA_VERSION, schema_constants.SCHEMA_VERSION)


class TestEnumSync(unittest.TestCase):
    def test_enum_tuples_in_sync(self):
        for name in ("NODE_KINDS", "EDGE_KINDS", "LANGS", "FILL_STATUSES",
                     "ORIGINS", "TIERS"):
            self.assertEqual(getattr(cell_schema, name),
                             getattr(schema_constants, name), name)

    def test_worst_order_ruling_in_sync(self):
        # Assembly ruling 4: split tokens, canonical order, fused form banned.
        self.assertEqual(cell_schema.OUTLINE_WORST_ORDER,
                         schema_constants.OUTLINE_WORST_ORDER)
        self.assertEqual(cell_schema.OUTLINE_WORST_ORDER,
                         ("red", "amber", "blue", "definition", "lemma", "none", "green"))
        self.assertEqual(cell_schema.WORST_TOKEN_TO_STATUS,
                         schema_constants.WORST_TOKEN_TO_STATUS)
        # Assembly ruling 1 verbatim:
        self.assertEqual(cell_schema.WORST_TOKEN_TO_STATUS,
                         {"red": "red", "amber": "amber", "blue": "blue",
                          "definition": "blue", "lemma": "green", "none": "green",
                          "green": "green"})
        self.assertEqual(cell_schema.BANNED_WORST_TOKENS,
                         schema_constants.BANNED_WORST_TOKENS)
        self.assertNotIn("none/green", cell_schema.OUTLINE_WORST_ORDER)

    def test_placeholder_prefix_in_sync(self):
        self.assertEqual(cell_schema.UNRESOLVED_PREFIX,
                         schema_constants.UNRESOLVED_PLACEHOLDER_PREFIX)


class TestMintSync(unittest.TestCase):
    """Ruling 5: the cell's mint byte-agrees with packages/schema/ids.py,
    gated by the frozen cross-language vectors."""

    def test_node_vectors(self):
        for v in [v for v in VECTORS["vectors"] if v["type"] == "node"]:
            i = v["input"]
            got = cell_schema.compute_node_identity(
                i["lang"], i["kind"], i["moduleName"], i["rawName"], i["file"])
            self.assertEqual(got["canonicalName"], v["expected"]["canonicalName"])
            self.assertEqual(got["path"], v["expected"]["path"])
            self.assertEqual(got["preimage"], v["expected"]["preimage"])
            self.assertEqual(got["nodeId"], v["expected"]["id"])
            # and the canonical package computes the identical identity
            canon = canonical_ids.compute_node_identity(
                i["lang"], i["kind"], i["moduleName"], i["rawName"], i["file"])
            self.assertEqual(got["nodeId"], canon["nodeId"])
            self.assertEqual(got["preimage"], canon["preimage"])

    def test_edge_vectors(self):
        for v in [v for v in VECTORS["vectors"] if v["type"] == "edge"]:
            i = v["input"]
            eid, pre = cell_schema.edge_id(i["kind"], i["srcId"], i["dstId"])
            self.assertEqual(eid, v["expected"]["id"])
            self.assertEqual(cell_schema.edge_preimage(i["kind"], i["srcId"], i["dstId"]),
                             v["expected"]["preimage"])
            canon = canonical_ids.compute_edge_identity(i["kind"], i["srcId"], i["dstId"])
            self.assertEqual(eid, canon["edgeId"])

    def test_mint_helpers_agree_on_fresh_inputs(self):
        # not covered by the frozen vectors: byte-agreement on arbitrary input
        pre = cell_schema.node_preimage("go", "function", "pkg/x.f", "pkg/x/y.go", "pkg/x::f")
        self.assertEqual(pre, canonical_ids.node_preimage(
            "go", "function", "pkg/x.f", "pkg/x/y.go", "pkg/x::f"))
        nid, _ = cell_schema.node_id("go", "function", "pkg/x.f", "pkg/x/y.go", "pkg/x::f")
        self.assertEqual(nid, canonical_ids.node_id_from_preimage(pre))
        self.assertEqual(cell_schema.US, canonical_ids.US)
        self.assertEqual(cell_schema.US_ESCAPED, canonical_ids.US_ESCAPED)
        self.assertEqual(cell_schema.NODE_DOMAIN_TAG, canonical_ids.NODE_DOMAIN_TAG)
        self.assertEqual(cell_schema.EDGE_DOMAIN_TAG, canonical_ids.EDGE_DOMAIN_TAG)
        self.assertEqual(cell_schema.ID_TRUNCATE, canonical_ids.TRUNCATE)

    def test_canonical_name_and_path_helpers_in_sync(self):
        for module, kind, raw in (("sample", "module", "sample"),
                                  ("sample", "function", "A"),
                                  ("Analysis.Θ", "theorem", "σ_add_μ")):
            self.assertEqual(cell_schema.canonical_name_for(module, kind, raw),
                             canonical_ids.canonical_name_for(module, kind, raw))
            self.assertEqual(cell_schema.structural_path_for(module, kind, raw),
                             canonical_ids.structural_path_for(module, kind, raw))

    def test_emitted_ids_match_id_scheme_patterns(self):
        cell = run_skeleton()
        state = cell.dump()
        import re
        node_pat = re.compile(schema_constants.NODE_ID_PATTERN)
        edge_pat = re.compile(schema_constants.EDGE_ID_PATTERN)
        self.assertTrue(state["nodes"])
        for n in state["nodes"]:
            self.assertTrue(node_pat.match(n["id"]), n["id"])
        self.assertTrue(state["edges"])
        for e in state["edges"]:
            self.assertTrue(edge_pat.match(e["id"]), e["id"])


if __name__ == "__main__":
    unittest.main()
