"""Hub suite (split 9/9): the save -> re-analyze -> re-attach loop
(Test11 story part 3; APP-SHELL-CONTRACT.md).

Part of the hub/test_hub.py aggregate (SUB200 restructure); shared stack and
helpers live in hub/test_hub_base.py.  All edits happen in a TEMP COPY of
the skeleton fixture — the committed fixture is never written.
"""
from __future__ import annotations

import hashlib
import json
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
from test_hub_base import (FIXTURE, SKELETON_CONFIG, http_get,  # noqa: E402
                           http_get_json, http_post_json, http_put_json)

import pipeline as hub_pipeline  # noqa: E402


def setUpModule():
    hb.ensure_stack()


class Test11WorkspaceFsLoop(unittest.TestCase):
    """Test11 story finale (edit -> re-analyze -> re-attach): HTTP body AND
    the hub log's hub.analyze.reattach pins, on a fresh temp fixture copy."""

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

    # -- 07: save -> re-analyze -> the served graph CHANGES ------------------
    def test_07_write_then_analyze_serves_changed_extraction(self):
        _, _, before_body = http_get("/graph")
        before_ids = {n["id"]
                      for n in json.loads(before_body.decode("utf-8"))["nodes"]}
        # the edit, THROUGH the jailed endpoint: append a new function decl
        status, body = http_get_json("/fs/file?path=pkg/c.py")
        self.assertEqual(status, 200)
        edited = (body["content"]
                  + "\n\ndef appshell_added_probe():\n"
                    "    return 'app-shell round'\n")
        status, _ = http_put_json("/fs/file",
                                  {"path": "pkg/c.py", "content": edited})
        self.assertEqual(status, 200)
        # re-analyze the TEMP COPY (the committed fixture is never touched)
        status, body = http_post_json("/analyze", {
            "root": str(self.tmp_root), "extractorConfig": SKELETON_CONFIG})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        # the served graph now shows the CHANGED extraction
        _, _, after_body = http_get("/graph")
        after = json.loads(after_body.decode("utf-8"))
        after_ids = {n["id"] for n in after["nodes"]}
        self.assertNotEqual(after_ids, before_ids)
        self.assertLess(before_ids, after_ids)   # strictly grew — new decl
        new_names = {n["name"] for n in after["nodes"]
                     if n["id"] in after_ids - before_ids}
        self.assertTrue(any(n.endswith("appshell_added_probe")
                            for n in new_names), new_names)
        # the new decl feeds the root-picker (CURRENT envelope, not a cache)
        status, cand = http_get_json("/fs/roots-candidates")
        self.assertEqual(status, 200)
        self.assertTrue(any(c["name"].endswith("appshell_added_probe")
                            and c["kind"] != "module"
                            and c["file"] == "pkg/c.py"
                            for c in cand["candidates"]), cand["candidates"])
        # /analysis was RE-ATTACHED on the SAME pipeline: its graph carries
        # exactly the served node id set (one wall, no foreign snapshot)
        status, _, analysis_body = http_get("/analysis")
        self.assertEqual(status, 200)
        analysis = json.loads(analysis_body.decode("utf-8"))
        self.assertEqual({n["id"] for n in analysis["graph"]["nodes"]},
                         after_ids)
        reattach = hb.LOG.events("hub.analyze.reattach")[-1]["payload"]
        self.assertEqual(reattach["analysisBytes"], len(analysis_body))
        self.assertEqual(reattach["analysisSha256"],
                         hashlib.sha256(analysis_body).hexdigest())
        # workspace facts were re-declared by the run
        _, ws = http_get_json("/workspace")
        self.assertEqual(os.path.normcase(ws["root"]),
                         os.path.normcase(str(self.tmp_root.resolve())))

    # -- 08: the re-attached /analysis == a FRESH analyze(), byte-canonical --
    def test_08_reattached_analysis_equals_fresh_analyze_canonical(self):
        status, _, served = http_get("/analysis")
        self.assertEqual(status, 200)
        root_dir = hub_pipeline.PROOFGRAPH_ROOT
        if str(root_dir) not in sys.path:
            sys.path.insert(0, str(root_dir))
        from outerwall.analyze import analyze   # the outer wall's own face
        fresh = analyze(str(self.tmp_root),
                        config={"extractor": SKELETON_CONFIG})
        self.assertEqual(served, hub_pipeline.canonical_json_bytes(fresh))


if __name__ == "__main__":
    unittest.main(verbosity=2)
