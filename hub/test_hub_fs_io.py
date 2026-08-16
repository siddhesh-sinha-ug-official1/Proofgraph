"""Hub suite (split 8/9): jailed /fs list/read/write round-trip, binary
refusal, and the path-escape matrix (Test11 story part 2).

Part of the hub/test_hub.py aggregate (SUB200 restructure); shared stack and
helpers live in hub/test_hub_base.py.  All edits happen in a TEMP COPY of
the skeleton fixture — the committed fixture is never written.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import sys
import tempfile
import unittest
import urllib.parse
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import test_hub_base as hb                                     # noqa: E402
from test_hub_base import (FIXTURE, http_get_json,             # noqa: E402
                           http_put_json)


def setUpModule():
    hb.ensure_stack()


class Test11WorkspaceFsIo(unittest.TestCase):
    """Test11 story continued (browse -> edit; escapes ALL refused): HTTP
    body AND the hub log's hub.fs.* pins, on a fresh temp fixture copy."""

    tmp_root: Path

    @classmethod
    def setUpClass(cls):
        cls.tmp_root = Path(tempfile.mkdtemp(prefix="hub-fs-workspace-"))
        shutil.copytree(FIXTURE / "pkg", cls.tmp_root / "pkg")
        hb.SERVER.set_workspace(cls.tmp_root, package="pkg",
                                pyright_mode="none", declared_roots=[],
                                note="Test11: temp fixture copy declared")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp_root, ignore_errors=True)

    # -- 04: list / read / write round-trip with sha256 ----------------------
    def test_04_fs_list_read_write_roundtrip_sha256(self):
        status, body = http_get_json("/fs/list")
        self.assertEqual(status, 200)
        self.assertEqual([(e["name"], e["kind"]) for e in body["entries"]],
                         [("pkg", "dir")])
        status, body = http_get_json("/fs/list?path=pkg")
        self.assertEqual(status, 200)
        names = {e["name"] for e in body["entries"]}
        self.assertLessEqual({"__init__.py", "a.py", "b.py", "c.py"}, names)
        for e in body["entries"]:
            self.assertEqual(e["kind"], "file", e["name"])
            self.assertEqual(e["size"],
                             (self.tmp_root / "pkg" / e["name"]).stat().st_size)
        # read: content + sha256 == the bytes on disk (server side)
        disk = (self.tmp_root / "pkg" / "a.py").read_bytes()
        status, body = http_get_json("/fs/file?path=pkg/a.py")
        self.assertEqual(status, 200)
        self.assertEqual(body["content"], disk.decode("utf-8"))
        self.assertEqual(body["sha256"], hashlib.sha256(disk).hexdigest())
        self.assertEqual(body["byteLen"], len(disk))
        original = body["content"]
        # write: returned sha256 == sha256 of what we sent; disk changed
        edited = original + "\n# round-trip marker (Test11)\n"
        want_sha = hashlib.sha256(edited.encode("utf-8")).hexdigest()
        status, wbody = http_put_json("/fs/file",
                                      {"path": "pkg/a.py", "content": edited})
        self.assertEqual(status, 200)
        self.assertEqual(wbody["sha256"], want_sha)
        self.assertEqual((self.tmp_root / "pkg" / "a.py").read_bytes(),
                         edited.encode("utf-8"))
        # read back through the endpoint: byte-honest round trip
        status, rbody = http_get_json("/fs/file?path=pkg/a.py")
        self.assertEqual(status, 200)
        self.assertEqual(rbody["content"], edited)
        self.assertEqual(rbody["sha256"], want_sha)
        # the OTHER surface: hub.fs.{list,read,write} pins with the same shas
        self.assertTrue(hb.LOG.events("hub.fs.list"))
        write_pin = hb.LOG.events("hub.fs.write")[-1]["payload"]
        self.assertEqual(write_pin["path"], "pkg/a.py")
        self.assertEqual(write_pin["sha256"], want_sha)
        self.assertEqual(write_pin["bytes"], len(edited.encode("utf-8")))
        read_pin = hb.LOG.events("hub.fs.read")[-1]["payload"]
        self.assertEqual(read_pin["sha256"], want_sha)
        # restore the original content (leave the copy as found)
        status, _ = http_put_json("/fs/file",
                                  {"path": "pkg/a.py", "content": original})
        self.assertEqual(status, 200)

    # -- 05: binary (non-utf-8) refused with the named class + reason --------
    def test_05_binary_read_refused_fs_io_error(self):
        blob = self.tmp_root / "blob.bin"
        blob.write_bytes(b"\x00\xff\xfe not utf-8 \x9c")
        status, body = http_get_json("/fs/file?path=blob.bin")
        self.assertEqual(status, 400)
        self.assertEqual(body["failureClass"], "fs-io-error")
        self.assertIn("utf-8", body["detail"])
        rejected = hb.LOG.events("hub.fs.rejected")[-1]["payload"]
        self.assertEqual(rejected["failureClass"], "fs-io-error")
        self.assertEqual(rejected["op"], "read")
        # a missing file is fs-io-error too, never a fabricated body
        status, body = http_get_json("/fs/file?path=pkg/nope.py")
        self.assertEqual(status, 400)
        self.assertEqual(body["failureClass"], "fs-io-error")

    # -- 06: the path-escape matrix — ALL refused + probed -------------------
    def test_06_path_escape_matrix(self):
        escapes = [
            "..",
            "..\\",
            "../",
            "../../outside.py",
            "..\\..\\outside.py",
            "pkg/../..",
            "pkg\\..\\..\\hub",
            str(HUB_DIR / "server.py"),      # absolute, same drive
            "C:\\Windows\\win.ini",          # absolute, drive-qualified
            "D:\\other\\drive.py",           # drive-changing
            "C:relative-to-drive.py",        # drive-relative form
            "\\\\server\\share\\unc.py",     # UNC
            "/posix/absolute.py",
            "\\leading\\backslash.py",
        ]
        before = len(hb.LOG.events("hub.fs.rejected"))
        for raw in escapes:
            quoted = urllib.parse.quote(raw)
            with self.subTest(op="list", path=raw):
                status, body = http_get_json(f"/fs/list?path={quoted}")
                self.assertEqual(status, 403)
                self.assertEqual(body["failureClass"], "path-escape")
            with self.subTest(op="read", path=raw):
                status, body = http_get_json(f"/fs/file?path={quoted}")
                self.assertEqual(status, 403)
                self.assertEqual(body["failureClass"], "path-escape")
            with self.subTest(op="write", path=raw):
                status, body = http_put_json(
                    "/fs/file", {"path": raw, "content": "evil"})
                self.assertEqual(status, 403)
                self.assertEqual(body["failureClass"], "path-escape")
        rejected = hb.LOG.events("hub.fs.rejected")[before:]
        self.assertEqual(len(rejected), 3 * len(escapes))   # EVERY one probed
        self.assertEqual({e["payload"]["failureClass"] for e in rejected},
                         {"path-escape"})
        self.assertEqual({e["payload"]["op"] for e in rejected},
                         {"list", "read", "write"})
        # symlink leg (cheap only: Windows may refuse symlink creation
        # without developer mode — then this leg is skipped, visibly)
        link = self.tmp_root / "esc_link"
        with self.subTest(op="symlink-escape"):
            try:
                os.symlink(HUB_DIR, link, target_is_directory=True)
            except OSError as exc:
                self.skipTest(f"symlink creation unavailable here ({exc}) — "
                              f"escape still covered by resolve(): the jail "
                              f"resolves symlinks before its commonpath check")
            try:
                status, body = http_get_json("/fs/list?path=esc_link")
                self.assertEqual(status, 403)
                self.assertEqual(body["failureClass"], "path-escape")
                status, body = http_get_json("/fs/file?path=esc_link/server.py")
                self.assertEqual(status, 403)
                self.assertEqual(body["failureClass"], "path-escape")
            finally:
                # remove the link so later fs tests analyze a link-free tree
                try:
                    os.rmdir(link)
                except OSError:
                    link.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
