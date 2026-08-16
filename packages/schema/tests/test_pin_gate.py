"""Schema PIN gate (split from test_schema_package.py, SUB200)."""
import copy
import sys
import unittest
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from context import SCHEMA_OBJ  # noqa: E402

import pin  # noqa: E402
from schema_tools import SchemaPinMismatch, check_pin, schema_hash  # noqa: E402


class TestPin(unittest.TestCase):
    """failure-class=schema-pin-mismatch — the pin detects any drift."""

    def test_pin_file_matches_recomputed_hash(self):
        pinned_version, pinned_hash = pin.read_pin()
        self.assertEqual(pinned_version, SCHEMA_OBJ["schemaVersion"])
        self.assertEqual(pinned_hash, schema_hash(SCHEMA_OBJ))

    def test_assert_pin_passes_on_canonical_schema(self):
        schema_obj = pin.assert_pin()
        self.assertEqual(schema_obj["schemaVersion"], "v0")
        self.assertEqual(schema_obj["schemaRevision"], "v0.1")

    def test_pin_detects_drift(self):
        pinned_version, pinned_hash = pin.read_pin()
        mutated = copy.deepcopy(SCHEMA_OBJ)
        mutated["$defs"]["Node"]["properties"]["kind"]["enum"].append("macro")
        self.assertNotEqual(schema_hash(mutated), pinned_hash)
        with self.assertRaises(SchemaPinMismatch):
            check_pin(pinned_version, pinned_hash, pinned_version, schema_hash(mutated))
        with self.assertRaises(SchemaPinMismatch):
            check_pin(pinned_version, pinned_hash, "v1", schema_hash(SCHEMA_OBJ))


if __name__ == "__main__":
    unittest.main()
