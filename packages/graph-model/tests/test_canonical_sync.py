"""Assembly Phase 0 — verified-in-sync with the canonical schema package.

This cell SEEDED packages/schema (its schema.json / ids.py / validate.py were
moved there), so the swap keeps local copies for the {stdlib, networkx,
rustworkx} import boundary and instead PROVES they cannot drift from the
canonical package:

- schema/schema.json and src/validate.py: byte-identical to the canonical files
  (pattern (b), strongest form).
- src/ids.py and src/schema_tools.py: functionally identical — every top-level
  def/class/assignment is byte-compared, exempting ONLY the module docstring
  and the import wiring (the canonical schema_tools.py carries a flat-import
  fallback `from ids import …` that the cell's importgate whitelist forbids;
  the cell's ids.py keeps its own docstring, the canonical one describes the
  move).  Plus the cross-language golden vectors (packages/schema/vectors.json)
  are replayed through src/ids.py, so the MINT itself is pinned, not just the
  source text.
- The pin: (schemaVersion, schemaHash) of the adopted schema must equal
  packages/schema/PIN via check_pin — drift explodes loudly.

The canonical files are read by PATH only (no import), so the importgate stays
exactly {stdlib, networkx, rustworkx, own}.
"""
import ast
import json
import unittest

from context import CELL_ROOT

from src import ids as cell_ids
from src.schema_tools import check_pin, schema_hash

CANONICAL_ROOT = CELL_ROOT.parent / "schema"

# packages/schema/PIN, hard-coded (a pin that reads its expectation from the
# thing it checks would not be a pin).
CANONICAL_PIN_VERSION = "v0"
CANONICAL_PIN_HASH = \
    "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c"


def _is_import_wiring(stmt):
    """Import statements, or a try/except whose every statement is an import
    (the canonical flat-import fallback shape)."""
    if isinstance(stmt, (ast.Import, ast.ImportFrom)):
        return True
    if isinstance(stmt, ast.Try):
        parts = list(stmt.body) + stmt.orelse + stmt.finalbody
        for handler in stmt.handlers:
            parts.extend(handler.body)
        return all(_is_import_wiring(s) for s in parts)
    return False


def functional_segments(path):
    """Source text of every top-level statement EXCEPT the module docstring and
    the import wiring — the byte-comparable functional body of a module."""
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src, filename=str(path))
    segments = []
    for i, stmt in enumerate(tree.body):
        if i == 0 and isinstance(stmt, ast.Expr) \
                and isinstance(stmt.value, ast.Constant) \
                and isinstance(stmt.value.value, str):
            continue  # module docstring
        if _is_import_wiring(stmt):
            continue
        segments.append(ast.get_source_segment(src, stmt))
    return segments


class TestCanonicalSync(unittest.TestCase):
    def test_canonical_package_present(self):
        # If the assembly's canonical package is missing there is nothing to be
        # in sync WITH — fail loudly rather than vacuously pass.
        self.assertTrue((CANONICAL_ROOT / "schema.json").exists(),
                        f"canonical schema package not found at {CANONICAL_ROOT}")

    def test_schema_json_byte_identical(self):
        # failure-class=schema-drift — ONE schema for the whole assembly
        local = (CELL_ROOT / "schema" / "schema.json").read_bytes()
        canonical = (CANONICAL_ROOT / "schema.json").read_bytes()
        self.assertEqual(local, canonical,
                         "schema/schema.json drifted from packages/schema/schema.json")

    def test_validate_py_byte_identical(self):
        # canonical validate.py adopted wholesale (it gained the frozen
        # leads-segregation invariant, assembly ruling 3)
        local = (CELL_ROOT / "src" / "validate.py").read_bytes()
        canonical = (CANONICAL_ROOT / "validate.py").read_bytes()
        self.assertEqual(local, canonical,
                         "src/validate.py drifted from packages/schema/validate.py")

    def test_graph_schema_ts_byte_identical(self):
        # failure-class=schema-drift — Wave-A/cluster-U1: the cell's TS
        # projection is a byte-mirror of the canonical projection. The v0.1
        # amendment (SCHEMA_REVISION, NODE_KINDS / OUTLINE_WORST_ORDER arrays,
        # worstOfVerdict) reaches this cell ONLY through this sync; the cell's
        # old rival generator emitted the pre-amendment format and nothing gated
        # the gap. Byte-identity here mirrors how src/ids.py / validate.py are
        # sync-gated, so drift now explodes loudly.
        local = (CELL_ROOT / "schema" / "graph-schema.ts").read_bytes()
        canonical = (CANONICAL_ROOT / "gen" / "graph-schema.ts").read_bytes()
        self.assertEqual(local, canonical,
                         "schema/graph-schema.ts drifted from "
                         "packages/schema/gen/graph-schema.ts")

    def test_ids_py_functionally_identical(self):
        # the canonical mint IS this cell's mint (moved verbatim); only the
        # module docstring differs (the canonical one narrates the move)
        self.assertEqual(
            functional_segments(CELL_ROOT / "src" / "ids.py"),
            functional_segments(CANONICAL_ROOT / "ids.py"),
            "src/ids.py drifted from packages/schema/ids.py")

    def test_schema_tools_py_functionally_identical(self):
        # only the import wiring differs: canonical carries a flat-import
        # fallback that the cell's importgate whitelist would flag
        self.assertEqual(
            functional_segments(CELL_ROOT / "src" / "schema_tools.py"),
            functional_segments(CANONICAL_ROOT / "schema_tools.py"),
            "src/schema_tools.py drifted from packages/schema/schema_tools.py")

    def test_pin_file_and_adopted_schema_agree(self):
        # failure-class=schema-pin-mismatch — the PIN file, the hard-coded pin,
        # and the hash of the adopted schema.json must all agree
        pin_lines = (CANONICAL_ROOT / "PIN").read_text(encoding="utf-8").split()
        self.assertEqual(pin_lines[pin_lines.index("schemaVersion") + 1],
                         CANONICAL_PIN_VERSION)
        self.assertEqual(pin_lines[pin_lines.index("schemaHash") + 1],
                         CANONICAL_PIN_HASH)
        schema_obj = json.loads(
            (CELL_ROOT / "schema" / "schema.json").read_text(encoding="utf-8"))
        check_pin(CANONICAL_PIN_VERSION, CANONICAL_PIN_HASH,
                  schema_obj["schemaVersion"], schema_hash(schema_obj))

    def test_golden_vectors_replay_through_cell_mint(self):
        # failure-class=id-instability — the 8 frozen cross-language vectors
        # (assembly ruling 5: domain-tagged sha256[:16] mint; ruling 6:
        # "unresolved:"+rawRefName placeholder appears as a dstId vector)
        vectors = json.loads(
            (CANONICAL_ROOT / "vectors.json").read_text(encoding="utf-8"))["vectors"]
        self.assertEqual(len(vectors), 8)
        for v in vectors:
            inp, exp = v["input"], v["expected"]
            if v["type"] == "node":
                got = cell_ids.compute_node_identity(
                    inp["lang"], inp["kind"], inp["moduleName"],
                    inp["rawName"], inp["file"])
                self.assertEqual(got["canonicalName"], exp["canonicalName"])
                self.assertEqual(got["path"], exp["path"])
                self.assertEqual(got["preimage"], exp["preimage"])
                self.assertEqual(got["nodeId"], exp["id"])
            else:
                got = cell_ids.compute_edge_identity(
                    inp["kind"], inp["srcId"], inp["dstId"])
                self.assertEqual(got["preimage"], exp["preimage"])
                self.assertEqual(got["edgeId"], exp["id"])


if __name__ == "__main__":
    unittest.main()
