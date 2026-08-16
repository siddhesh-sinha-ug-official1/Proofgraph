"""Gate 13 — assembly schema-sync gate (Phase 0 swap; pattern (b): verified-in-sync).

The canonical schema package (packages/schema) is the ONE source of truth for the
assembly.  This cell keeps its local constants in capability/schema.py so the cell
stays independently runnable, but this gate asserts extracted-constant equality
with the canonical generated files AND checks the schema PIN — so any drift on
either side explodes HERE instead of skewing silently.  "One schema" holds
because divergence is loud, not because the bytes live in one place.

Loading strategy (recorded in ASSEMBLY-CHANGES.md): canonical sources are loaded
by file-read + exec, NOT by module import, so the import-boundary gate's ALLOWED
lists stay honest and unchanged (Operating Contract rule 3).

Binding rulings exercised here:
  * ruling 2 — S-tier may NOT emit resolved edges; this cell's
    DEPTH_ALLOWS_RESOLVED_EDGES table ({CT:True, S:False, G:False, P:False})
    is now canon and must match gen/capability_constants.py.
  * ruling 4 — canonical split worst-case order
    ("red","amber","blue","definition","lemma","none","green"), index 0 worst;
    the fused "none/green" token is banned from data.
  * PIN — schemaVersion v0 / schemaHash 3f312369… ; drift = schema-pin-mismatch.
"""

import json
import sys
import unittest
from pathlib import Path

from capability import schema

# .../packages/capability-layer/capability/tests/test_13_schema_sync.py
#   parents[0]=tests  parents[1]=capability  parents[2]=capability-layer  parents[3]=packages
SCHEMA_PKG = Path(__file__).resolve().parents[3] / "schema"

# Assembly PIN (binding): the exact values every consuming cell pins to.
PINNED_SCHEMA_VERSION = "v0"
PINNED_SCHEMA_HASH = (
    "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c")


class _ModuleShim:
    """Minimal object registered in sys.modules so a canonical source whose flat
    fallback is `from ids import sha256_hex` resolves without sys.path edits."""


def _exec_canonical(relpath, shims=None):
    """Execute a canonical schema-package source file into a fresh namespace.

    File-read + exec (no module import) keeps the import-boundary gate's
    ALLOWED lists unchanged: the canonical package is consumed as data.
    """
    path = SCHEMA_PKG / relpath
    ns = {"__name__": Path(relpath).stem, "__file__": str(path)}
    inserted = []
    try:
        for name, attrs in (shims or {}).items():
            if name not in sys.modules:
                mod = _ModuleShim()
                for key, value in attrs.items():
                    setattr(mod, key, value)
                sys.modules[name] = mod
                inserted.append(name)
        source = path.read_text(encoding="utf-8")
        exec(compile(source, str(path), "exec"), ns)
    finally:
        for name in inserted:
            del sys.modules[name]
    return ns


class TestCanonicalPackagePresent(unittest.TestCase):
    def test_canonical_package_exists(self):
        # If the sibling canonical package is missing, every sync claim below
        # would be vacuous — fail loudly first with a pointed message.
        self.assertTrue(SCHEMA_PKG.is_dir(),
                        f"canonical schema package not found at {SCHEMA_PKG}")
        for rel in ("gen/capability_constants.py", "gen/schema_constants.py",
                    "ids.py", "schema_tools.py", "schema.json", "PIN"):
            self.assertTrue((SCHEMA_PKG / rel).is_file(),
                            f"canonical file missing: {SCHEMA_PKG / rel}")


class TestCapabilityConstantsInSync(unittest.TestCase):
    """capability/schema.py constants == packages/schema/gen/capability_constants.py."""

    @classmethod
    def setUpClass(cls):
        cls.canon = _exec_canonical("gen/capability_constants.py")

    def test_depth_tiers_in_sync(self):
        self.assertEqual(tuple(schema.DEPTH_TIERS),
                         tuple(self.canon["DEPTH_TIERS"]))

    def test_depth_allows_resolved_edges_in_sync(self):
        self.assertEqual(schema.DEPTH_ALLOWS_RESOLVED_EDGES,
                         self.canon["DEPTH_ALLOWS_RESOLVED_EDGES"])

    def test_depth_allows_resolved_edges_is_the_canon_table(self):
        # Assembly ruling 2: S-tier may NOT emit resolved edges (CT only).
        # This cell's table won the seam; assert the literal so a "helpful"
        # future edit on EITHER side explodes here.
        self.assertEqual(schema.DEPTH_ALLOWS_RESOLVED_EDGES,
                         {"CT": True, "S": False, "G": False, "P": False})

    def test_depth_to_max_provenance_in_sync(self):
        self.assertEqual(schema.DEPTH_TO_MAX_PROVENANCE,
                         self.canon["DEPTH_TO_MAX_PROVENANCE"])

    def test_honest_ceilings_in_sync(self):
        self.assertEqual(schema.HONEST_CEILINGS, self.canon["HONEST_CEILINGS"])


class TestWorstOrderInSync(unittest.TestCase):
    """worst_case_order() == canonical OUTLINE_WORST_ORDER (assembly ruling 4)."""

    @classmethod
    def setUpClass(cls):
        cls.canon = _exec_canonical("gen/schema_constants.py")

    def test_worst_case_order_in_sync(self):
        self.assertEqual(tuple(schema.worst_case_order()),
                         tuple(self.canon["OUTLINE_WORST_ORDER"]))

    def test_worst_case_order_is_split_seven_token_red_first(self):
        order = schema.worst_case_order()
        self.assertEqual(len(order), 7)
        self.assertEqual(order[0], "red")  # index 0 worst
        self.assertNotIn("none/green", order)  # fused token banned from data
        self.assertIn("none", order)
        self.assertIn("green", order)


class TestSchemaPin(unittest.TestCase):
    """check_pin against the assembly PIN — schema drift explodes in this cell too."""

    @classmethod
    def setUpClass(cls):
        ids_ns = _exec_canonical("ids.py")
        cls.tools = _exec_canonical(
            "schema_tools.py",
            shims={"ids": {"sha256_hex": ids_ns["sha256_hex"]}})
        cls.schema_obj = json.loads(
            (SCHEMA_PKG / "schema.json").read_text(encoding="utf-8"))

    @staticmethod
    def _read_pin():
        fields = {}
        for line in (SCHEMA_PKG / "PIN").read_text(encoding="utf-8").splitlines():
            if line.strip():
                key, value = line.split(None, 1)
                fields[key] = value.strip()
        return fields["schemaVersion"], fields["schemaHash"]

    def test_pin_file_matches_assembly_pin(self):
        self.assertEqual(self._read_pin(),
                         (PINNED_SCHEMA_VERSION, PINNED_SCHEMA_HASH))

    def test_check_pin_passes_against_actual_schema(self):
        actual_hash = self.tools["schema_hash"](self.schema_obj)
        # canonical check_pin: raises SchemaPinMismatch on any drift
        self.tools["check_pin"](PINNED_SCHEMA_VERSION, PINNED_SCHEMA_HASH,
                                self.schema_obj["schemaVersion"], actual_hash)
        self.assertEqual(self.schema_obj["schemaVersion"], PINNED_SCHEMA_VERSION)

    def test_check_pin_gate_is_live(self):
        # prove the pin gate actually fires (never a vacuous pass)
        actual_hash = self.tools["schema_hash"](self.schema_obj)
        with self.assertRaises(self.tools["SchemaPinMismatch"]):
            self.tools["check_pin"](PINNED_SCHEMA_VERSION, "0" * 64,
                                    self.schema_obj["schemaVersion"], actual_hash)
        with self.assertRaises(self.tools["SchemaPinMismatch"]):
            self.tools["check_pin"]("v1", PINNED_SCHEMA_HASH,
                                    self.schema_obj["schemaVersion"], actual_hash)


if __name__ == "__main__":
    unittest.main()
