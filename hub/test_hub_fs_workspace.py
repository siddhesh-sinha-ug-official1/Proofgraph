"""Hub suite (split 7/9): app-shell workspace declaration + roots-candidates
(Test11 story part 1 — declare workspace -> browse; APP-SHELL-CONTRACT.md).

Part of the hub/test_hub.py aggregate (SUB200 restructure); shared stack and
helpers live in hub/test_hub_base.py.  All edits happen in a TEMP COPY of
the skeleton fixture — the committed fixture is never written.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HUB_DIR = Path(__file__).resolve().parent
if str(HUB_DIR) not in sys.path:
    sys.path.insert(0, str(HUB_DIR))

import test_hub_base as hb                                     # noqa: E402
from test_hub_base import (FIXTURE, http_get_json,             # noqa: E402
                           http_get_json_at, http_put_json)

import pipeline as hub_pipeline  # noqa: E402
import server as hub_server      # noqa: E402


def setUpModule():
    hb.ensure_stack()


class Test11WorkspaceFs(unittest.TestCase):
    """The workspace-fs surface, both sides of every seam: HTTP body AND the
    hub log's hub.fs.* / hub.workspace.* pins.  Methods are numbered: they
    form one story (declare workspace -> browse)."""

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

    # -- 01: before any workspace, every fs op refuses by name ---------------
    def test_01_workspace_not_open_refused_by_name(self):
        log2 = hub_pipeline.HubLog()
        fresh = hub_server.HubServer(None, log=log2).start()
        try:
            base = f"http://127.0.0.1:{fresh.http_port}"
            for path in ("/workspace", "/fs/list?path=pkg",
                         "/fs/file?path=pkg/a.py"):
                status, body = http_get_json_at(base, path)
                self.assertEqual(status, 503, path)
                self.assertEqual(body["failureClass"], "workspace-not-open",
                                 path)
            status, body = http_put_json(
                "/fs/file", {"path": "pkg/a.py", "content": "x"}, base=base)
            self.assertEqual(status, 503)
            self.assertEqual(body["failureClass"], "workspace-not-open")
            # pipeline-less roots-candidates refuses honestly too
            status, body = http_get_json_at(base, "/fs/roots-candidates")
            self.assertEqual(status, 503)
            self.assertEqual(body["failureClass"], "no-graph-ingested")
            # the OTHER surface: every refusal probed on hub.fs.rejected
            rejected = log2.events("hub.fs.rejected")
            self.assertGreaterEqual(len(rejected), 5)
            classes = {e["payload"]["failureClass"] for e in rejected}
            self.assertIn("workspace-not-open", classes)
            self.assertIn("no-graph-ingested", classes)
        finally:
            fresh.stop()

    # -- 02: the declared workspace facts are served, both surfaces ----------
    def test_02_workspace_facts_served(self):
        status, body = http_get_json("/workspace")
        self.assertEqual(status, 200)
        self.assertEqual(os.path.normcase(body["root"]),
                         os.path.normcase(str(self.tmp_root.resolve())))
        self.assertEqual(body["package"], "pkg")
        self.assertEqual(body["pyrightMode"], "none")
        self.assertEqual(body["declaredRoots"], [])
        self.assertIsInstance(body["analyzedAt"], int)
        set_pins = hb.LOG.events("hub.workspace.set")
        self.assertTrue(set_pins)
        self.assertEqual(os.path.normcase(set_pins[-1]["payload"]["root"]),
                         os.path.normcase(body["root"]))
        self.assertTrue(hb.LOG.events("hub.serve.workspace"))

    # -- 03: roots-candidates == the CURRENT envelope's decl set -------------
    def test_03_roots_candidates_equal_envelope_decl_set(self):
        status, body = http_get_json("/fs/roots-candidates")
        self.assertEqual(status, 200)
        env = hb.SERVER.pipeline["envelope"]
        want = {n["id"] for n in env["nodes"] if n["kind"] != "module"}
        module_ids = {n["id"] for n in env["nodes"] if n["kind"] == "module"}
        got = {c["id"] for c in body["candidates"]}
        self.assertEqual(got, want)          # exactly the decl set …
        self.assertFalse(got & module_ids)   # … module nodes excluded
        self.assertEqual(body["count"], len(want))
        by_id = {n["id"]: n for n in env["nodes"]}
        for cand in body["candidates"]:
            node = by_id[cand["id"]]
            self.assertEqual(cand["name"], node["name"])
            self.assertEqual(cand["kind"], node["kind"])
            self.assertEqual(cand["file"], node["span"]["file"])
            self.assertNotEqual(cand["kind"], "module")
        pin = hb.LOG.events("hub.serve.rootsCandidates")[-1]["payload"]
        self.assertEqual(pin["count"], len(want))


if __name__ == "__main__":
    unittest.main(verbosity=2)
