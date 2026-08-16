"""Codegen byte-sync gate (split from test_schema_package.py, SUB200)."""
import subprocess
import sys
import unittest
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from context import CAPABILITY_OBJ, PKG_ROOT, SCHEMA_OBJ  # noqa: E402

import schemagen  # noqa: E402


class TestSchemagenSync(unittest.TestCase):
    """failure-class=codegen-drift — every gen/ artifact + PIN byte-regenerable."""

    def test_every_generated_artifact_byte_regenerable(self):
        outputs = schemagen.regenerate(SCHEMA_OBJ, CAPABILITY_OBJ)
        self.assertEqual(sorted(outputs), sorted([
            "gen/graph-schema.ts", "gen/ids.ts", "gen/schema_constants.py",
            "gen/capability_constants.py", "gen/capability_constants.ts",
            "gen/pin.ts", "gen/schema.md", "PIN"]))
        for relpath, content in outputs.items():
            on_disk = (PKG_ROOT / relpath).read_bytes()
            self.assertEqual(on_disk, content.encode("utf-8"),
                             f"{relpath} is not byte-regenerable from schema.json")

    def test_check_cli_exits_zero(self):
        proc = subprocess.run(
            [sys.executable, str(PKG_ROOT / "schemagen.py"), "--check"],
            cwd=str(PKG_ROOT), capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0,
                         f"--check drifted:\n{proc.stdout}{proc.stderr}")


if __name__ == "__main__":
    unittest.main()
