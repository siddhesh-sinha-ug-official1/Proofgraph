"""Hub suite (split 10/10, pre-GitHub S1): the browser-face CORS/CSRF
allowlist on the hub's HTTP surface.

Part of the hub/test_hub.py aggregate (added this remediation round).  Shared
stack + helpers live in hub/test_hub_base.py.  Proves the three directions the
S1 fix must hold at once:

  * an ALLOWED loopback origin  -> 200 AND Access-Control-Allow-Origin echoes
    that exact origin (the app can read cross-origin);
  * a FOREIGN origin (a website the user visits) -> its state-changing PUT /
    POST is refused 403 cross-origin-denied, NOTHING is written, and the
    refusal is probed hub.http.refused; a foreign GET gets no ACAO (browser
    blocks the read);
  * NO Origin (curl, the acceptance runners, server-to-server) -> unchanged:
    the surface works exactly as before, no ACAO needed.

All edits happen in a TEMP COPY of the skeleton fixture — the committed
fixture is never written.
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import test_hub_base as hb                                     # noqa: E402
from test_hub_base import FIXTURE                              # noqa: E402

ALLOWED_ORIGIN = "http://localhost:5199"       # the vite human face
FOREIGN_ORIGIN = "https://evil.example.com"    # a website the user visits


def setUpModule():
    hb.ensure_stack()


def _request(method: str, path: str, *, origin: str | None = None,
             body: dict | None = None):
    """-> (status, headers, json|None).  Sends Origin only when given."""
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if origin is not None:
        headers["Origin"] = origin
    req = urllib.request.Request(hb.BASE + path, data=data, method=method,
                                 headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return resp.status, dict(resp.headers), _json_or_none(raw)
    except urllib.error.HTTPError as err:
        return err.code, dict(err.headers), _json_or_none(err.read())


def _json_or_none(raw: bytes):
    try:
        return json.loads(raw.decode("utf-8")) if raw else None
    except (ValueError, UnicodeDecodeError):
        return None


class TestCorsAllowlist(unittest.TestCase):
    """S1: the localhost origin allowlist replaces the old wildcard."""

    tmp_root: Path

    @classmethod
    def setUpClass(cls):
        cls.tmp_root = Path(tempfile.mkdtemp(prefix="hub-cors-"))
        shutil.copytree(FIXTURE / "pkg", cls.tmp_root / "pkg")
        hb.SERVER.set_workspace(cls.tmp_root, package="pkg",
                                pyright_mode="none", declared_roots=[],
                                note="test_hub_cors: temp fixture copy declared")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp_root, ignore_errors=True)

    # -- allowed loopback origin: 200 + ACAO echoes the exact origin ---------
    def test_01_allowed_origin_echoed(self):
        status, headers, _ = _request("GET", "/health", origin=ALLOWED_ORIGIN)
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"),
                         ALLOWED_ORIGIN)   # exact echo, never "*"
        self.assertEqual(headers.get("Vary"), "Origin")

    # -- an ephemeral loopback port is allowed too (the acceptance UI path) --
    def test_02_ephemeral_loopback_origin_allowed(self):
        eph = "http://localhost:54321"
        status, headers, _ = _request("GET", "/health", origin=eph)
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), eph)

    # -- no Origin (curl, runners, server-to-server): unchanged, no ACAO -----
    def test_03_no_origin_unaffected(self):
        status, headers, body = _request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))

    # -- foreign origin GET: served body has NO ACAO (browser blocks read) ---
    def test_04_foreign_origin_get_has_no_acao(self):
        status, headers, _ = _request("GET", "/health", origin=FOREIGN_ORIGIN)
        # the server cannot refuse a GET (no state change) but withholds ACAO
        self.assertEqual(status, 200)
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))

    # -- foreign origin PUT /fs/file: 403, NOTHING written, probed -----------
    def test_05_foreign_origin_put_refused_nothing_written(self):
        target = self.tmp_root / "pkg" / "a.py"
        before = target.read_bytes()
        n_before = len(hb.LOG.events("hub.http.refused"))
        status, headers, body = _request(
            "PUT", "/fs/file", origin=FOREIGN_ORIGIN,
            body={"path": "pkg/a.py", "content": "EVIL OVERWRITE"})
        self.assertEqual(status, 403)
        self.assertEqual(body["failureClass"], "cross-origin-denied")
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))
        # the file on disk is byte-identical: the write never reached fs_write
        self.assertEqual(target.read_bytes(), before)
        # the OTHER surface: a probed hub.http.refused with the named class
        refused = hb.LOG.events("hub.http.refused")[n_before:]
        self.assertTrue(refused)
        self.assertEqual(refused[-1]["payload"]["failureClass"],
                         "cross-origin-denied")
        self.assertEqual(refused[-1]["payload"]["method"], "PUT")
        self.assertEqual(refused[-1]["payload"]["origin"], FOREIGN_ORIGIN)

    # -- foreign origin POST /analyze: 403 cross-origin-denied ---------------
    def test_06_foreign_origin_post_refused(self):
        status, _, body = _request(
            "POST", "/analyze", origin=FOREIGN_ORIGIN, body={"root": "x"})
        self.assertEqual(status, 403)
        self.assertEqual(body["failureClass"], "cross-origin-denied")

    # -- foreign OPTIONS preflight: bare 204, NO allow headers ---------------
    def test_07_foreign_preflight_no_allow_headers(self):
        status, headers, _ = _request("OPTIONS", "/fs/file",
                                      origin=FOREIGN_ORIGIN)
        self.assertEqual(status, 204)
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))
        self.assertIsNone(headers.get("Access-Control-Allow-Methods"))

    # -- allowed OPTIONS preflight: 204 + the allow headers, ACAO echoed -----
    def test_08_allowed_preflight_echoes(self):
        status, headers, _ = _request("OPTIONS", "/fs/file",
                                      origin=ALLOWED_ORIGIN)
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"),
                         ALLOWED_ORIGIN)
        self.assertIn("PUT", headers.get("Access-Control-Allow-Methods", ""))


if __name__ == "__main__":
    unittest.main(verbosity=2)
