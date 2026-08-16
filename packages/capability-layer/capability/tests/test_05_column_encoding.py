"""Gate 5 — the column-encoding round-trip (the §1.6 silent corruptor).

A line with a multi-byte character BEFORE the error column: the mapped LSP
character must match the negotiated encoding, and switching the negotiation to
utf-16 must change the number as expected. capability.shim.columnMap must have
been emitted during the real run.
"""

import json
import os
import subprocess
import sys
import unittest

from capability.shim import ybg_lsp
from capability.tests import common

_LAYER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
MOCK_YBC = [sys.executable, os.path.join(_LAYER_ROOT, "testbed", "mock_ybc.py")]

LINE = 'let ω: Int = "nope"'   # ω is 2 UTF-8 bytes, 1 UTF-16 unit


class TestColumnEncoding(unittest.TestCase):
    def _compiler_col(self):
        d = common.work_dir("encoding")
        path = os.path.join(d, "omega.ybg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(LINE + "\n")
        cp = subprocess.run(MOCK_YBC + ["check", "--format=json", path],
                            capture_output=True, text=True, encoding="utf-8")
        diags = json.loads(cp.stdout)
        self.assertEqual(len(diags), 1)
        return diags[0]

    def test_utf8_vs_utf16_differ_by_the_multibyte_char(self):
        diag = self._compiler_col()
        # 'let ω: Int = ' = 14 bytes (ω=2) → literal starts at byte col 15
        self.assertEqual(diag["col"], 15)

        ybg_lsp.STATE["encoding"] = "utf-8"
        char_utf8 = ybg_lsp.byte_col_to_char(LINE, diag["col"])
        ybg_lsp.STATE["encoding"] = "utf-16"
        char_utf16 = ybg_lsp.byte_col_to_char(LINE, diag["col"])

        self.assertEqual(char_utf8, 14)   # utf-8 characters ARE byte offsets
        self.assertEqual(char_utf16, 13)  # ω collapses to one utf-16 unit
        self.assertEqual(char_utf8 - char_utf16, 1)

    def test_round_trip_both_encodings(self):
        for enc in ("utf-8", "utf-16"):
            ybg_lsp.STATE["encoding"] = enc
            for byte_col in (1, 5, 15, len(LINE.encode("utf-8")) + 1):
                char = ybg_lsp.byte_col_to_char(LINE, byte_col)
                self.assertEqual(ybg_lsp.char_to_byte_col(LINE, char), byte_col,
                                 f"round-trip failed at byte col {byte_col} ({enc})")

    def test_column_map_lead_emitted_in_real_run(self):
        cap = common.get_run("ct")
        cmaps = common.events_of(cap, "capability.shim.columnMap")
        self.assertTrue(cmaps, "no columnMap lead fired during the CT run")
        for e in cmaps:
            p = e["payload"]
            self.assertEqual(p["encoding"], "utf-8")
            self.assertEqual(p["lspChar"], p["ybcCol"] - 1)

    def test_utf16_diag_mapping_kills_the_hardcoded_utf8_mutant(self):
        # a diagnostic AFTER the multibyte char must map differently under
        # utf-16 — a shim hardcoding `col - 1` fails exactly here
        ybg_lsp.STATE["encoding"] = "utf-16"
        diag, cmap, _ = ybg_lsp.map_ybc_diag(
            {"line": 1, "col": 15, "endCol": 21, "severity": "error",
             "message": "m"}, LINE)
        self.assertEqual(diag["range"]["start"]["character"], 13)  # NOT 14
        self.assertEqual(diag["range"]["end"]["character"], 19)    # NOT 20
        self.assertEqual(cmap["encoding"], "utf-16")
        self.assertEqual(cmap["lspChar"], 13)

    def test_battery_positions_respect_the_negotiated_encoding(self):
        # the battery must never send Python code-point indexes as LSP chars
        from capability.probe import lsp_char
        line = 'let ω = "χ"; use(ω)'   # multibyte BEFORE the target
        cp = line.index("use")
        self.assertEqual(lsp_char(line, cp, "utf-8"),
                         len(line[:cp].encode("utf-8")))     # byte offset
        self.assertEqual(lsp_char(line, cp, "utf-16"),
                         len(line[:cp].encode("utf-16-le")) // 2)
        self.assertNotEqual(lsp_char(line, cp, "utf-8"), cp,
                            "code-point index leaked through as a utf-8 char")
        self.assertEqual(lsp_char("ascii only", 6, "utf-8"), 6)
        self.assertEqual(lsp_char("𝕏x", 1, "utf-16"), 2)  # astral char = 2 units
        self.assertEqual(lsp_char("𝕏x", 1, "utf-8"), 4)   # ... and 4 bytes

    def test_live_utf16_only_client_governs_the_wire(self):
        cap = common.get_run("utf16")
        neg = common.events_of(cap, "capability.shim.encoding.negotiate")
        self.assertTrue(neg)
        self.assertEqual(neg[0]["payload"]["chosen"], "utf-16")
        self.assertEqual(cap.handle.positionEncoding, "utf-16")
        for e in common.events_of(cap, "capability.shim.columnMap"):
            self.assertEqual(e["payload"]["encoding"], "utf-16")
        self.assertEqual(cap.tier, "CT",
                         "honoring a utf-16 client must not cost depth")

    def tearDown(self):
        ybg_lsp.STATE["encoding"] = "utf-16"


if __name__ == "__main__":
    unittest.main()
