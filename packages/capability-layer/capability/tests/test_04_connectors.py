"""Gate 4 — every connector, even the cheap ones (Operating Contract rule 4).

The elementary-but-fiddly wires: Content-Length framing (dropped CRLF, lowercase
header, short body), the ybc argv builder (a path with a space and an '&'),
diagnostic field mapping (severity string→int, missing endCol), and the
positionEncoding negotiation (client offers only utf-16 → the shim must NOT
assume utf-8).
"""

import io
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


def frame(body: bytes, header: bytes | None = None) -> io.BytesIO:
    if header is None:
        header = b"Content-Length: %d\r\n\r\n" % len(body)
    return io.BytesIO(header + body)


class TestFraming(unittest.TestCase):
    def test_proper_message(self):
        body = json.dumps({"jsonrpc": "2.0", "method": "x"}).encode()
        msg = ybg_lsp.read_msg(frame(body))
        self.assertEqual(msg["method"], "x")

    def test_lowercase_header(self):
        body = b'{"method":"y"}'
        stream = frame(body, b"content-length: %d\r\n\r\n" % len(body))
        self.assertEqual(ybg_lsp.read_msg(stream)["method"], "y")

    def test_dropped_carriage_return(self):
        body = b'{"method":"z"}'
        stream = frame(body, b"Content-Length: %d\n\n" % len(body))
        self.assertEqual(ybg_lsp.read_msg(stream)["method"], "z")

    def test_body_shorter_than_declared(self):
        stream = frame(b'{"metho', b"Content-Length: 999\r\n\r\n")
        self.assertIsNone(ybg_lsp.read_msg(stream))

    def test_eof_returns_none(self):
        self.assertIsNone(ybg_lsp.read_msg(io.BytesIO(b"")))

    def test_missing_length_header(self):
        self.assertIsNone(ybg_lsp.read_msg(io.BytesIO(b"Host: x\r\n\r\n{}")))


class TestYbcArgv(unittest.TestCase):
    def test_path_with_space_and_ampersand(self):
        # a list argv must carry hostile paths verbatim — no shell, no quoting bugs
        d = common.work_dir("connectors")
        path = os.path.join(d, "we ird & name.ybg")
        with open(path, "w", encoding="utf-8") as f:
            f.write('let a: Int = "bad"\n')
        cp = subprocess.run(MOCK_YBC + ["check", "--format=json", path],
                            capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(cp.returncode, 0, cp.stderr)
        diags = json.loads(cp.stdout)
        self.assertEqual(len(diags), 1)
        self.assertIn("type mismatch", diags[0]["message"])


class TestDiagnosticMapping(unittest.TestCase):
    def setUp(self):
        ybg_lsp.STATE["encoding"] = "utf-8"

    def test_severity_string_to_int(self):
        line = "let a: Int = x"
        diag, _, notes = ybg_lsp.map_ybc_diag(
            {"line": 1, "col": 14, "endCol": 15, "severity": "warning",
             "message": "m"}, line)
        self.assertEqual(diag["severity"], 2)
        self.assertEqual(notes, [])

    def test_unknown_severity_defaults(self):
        diag, _, notes = ybg_lsp.map_ybc_diag(
            {"line": 1, "col": 2, "endCol": 3, "severity": "catastrophic",
             "message": "m"}, "let")
        self.assertEqual(diag["severity"], 3)
        self.assertTrue(any("unknown severity" in n for n in notes))

    def test_missing_end_col_defaults(self):
        diag, cmap, notes = ybg_lsp.map_ybc_diag(
            {"line": 1, "col": 5, "severity": "error", "message": "m"}, "let a")
        self.assertEqual(diag["range"]["end"]["character"], 5)  # col+1 → 0-based 5
        self.assertTrue(any("missing endCol" in n for n in notes))
        self.assertEqual(cmap["ybcEndCol"], 6)

    def test_missing_position_is_rejected_not_guessed(self):
        diag, cmap, notes = ybg_lsp.map_ybc_diag({"severity": "error"}, "")
        self.assertIsNone(diag)
        self.assertTrue(any("rejected" in n for n in notes))


class TestEncodingNegotiation(unittest.TestCase):
    def test_utf8_preferred_when_offered(self):
        self.assertEqual(ybg_lsp.negotiate_encoding(["utf-8", "utf-16"]), "utf-8")

    def test_utf16_only_client_is_honored(self):
        # the shim must NOT assume utf-8
        self.assertEqual(ybg_lsp.negotiate_encoding(["utf-16"]), "utf-16")

    def test_no_offer_falls_back_to_lsp_default(self):
        self.assertEqual(ybg_lsp.negotiate_encoding(None), "utf-16")
        self.assertEqual(ybg_lsp.negotiate_encoding([]), "utf-16")


if __name__ == "__main__":
    unittest.main()
