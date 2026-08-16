"""Gate 9 — compiler-as-oracle: the shim may not add or drop diagnostics.

For a file ybc reports clean, the shim publishes []; for a file ybc flags, the
shim publishes the same count with matching (encoding-converted) positions.
"""

import json
import os
import re
import subprocess
import sys
import unittest

from capability import spine
from capability.probes import ProbeBus
from capability.tests import common

_LAYER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
MOCK_YBC = [sys.executable, os.path.join(_LAYER_ROOT, "testbed", "mock_ybc.py")]
MAIN = os.path.join(_LAYER_ROOT, "testbed", "ybg_repo", "main.ybg")


def ybc_check(path):
    cp = subprocess.run(MOCK_YBC + ["check", "--format=json", path],
                        capture_output=True, text=True, encoding="utf-8")
    return json.loads(cp.stdout)


class TestCompilerAsOracle(unittest.TestCase):
    def test_clean_file_publishes_empty(self):
        direct = ybc_check(MAIN)
        self.assertEqual(direct, [], "oracle: main.ybg must be clean")
        cap = common.get_run("ct")
        p1 = common.result_of(cap, "p1")
        self.assertEqual(p1["response"], [], "shim invented a diagnostic")

    def test_flagged_file_matches_count_and_position(self):
        with open(MAIN, "r", encoding="utf-8") as f:
            text = f.read()
        injected = re.sub(r"(let\s+x\s*:\s*Int\s*=\s*).+", r'\1"nope"', text,
                          count=1)
        d = common.work_dir("oracle")
        path = os.path.join(d, "injected.ybg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(injected)
        direct = ybc_check(path)
        self.assertEqual(len(direct), 1)

        cap = common.get_run("ct")
        p2_diags = common.result_of(cap, "p2")["response"]
        self.assertEqual(len(p2_diags), len(direct),
                         "shim diagnostic count diverges from the compiler")
        # utf-8 was negotiated: LSP character == ybc byte col - 1
        self.assertEqual(p2_diags[0]["range"]["start"]["character"],
                         direct[0]["col"] - 1)
        self.assertEqual(p2_diags[0]["range"]["start"]["line"],
                         direct[0]["line"] - 1)
        self.assertEqual(p2_diags[0]["message"], direct[0]["message"])

    def test_check_calls_visible_on_the_wire(self):
        cap = common.get_run("ct")
        calls = common.events_of(cap, "capability.shim.check.call")
        self.assertTrue(calls, "no check.call leads — the compiler-truth source "
                               "is invisible")
        json_stdouts = 0
        for e in calls:
            p = e["payload"]
            self.assertIn("check", p["argv"])
            self.assertIn("--format=json", p["argv"])
            self.assertEqual(p["exitCode"], 0)
            # request AND response must ride the lead
            self.assertIn("stdout", p)
            self.assertIn("stderr", p)
            try:
                json.loads(p["stdout"] or "[]")
                json_stdouts += 1
            except ValueError:
                pass
        self.assertEqual(json_stdouts, len(calls),
                         "check.call stdout payloads must be the raw JSON "
                         "diagnostics")

    def test_multi_diagnostic_parity_with_the_compiler(self):
        # the shim may not drop diagnostics BEYOND the first one either
        text = ('let a: Int = "x"\n'
                'let b: String = 2\n'
                'let c: Int = "y"\n')
        d = common.work_dir("oracle")
        path = os.path.join(d, "multi.ybg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        direct = ybc_check(path)
        self.assertEqual(len(direct), 3, "oracle fixture must yield 3 diagnostics")

        bus = ProbeBus()
        env = {"YBG_LSP_YBC_CMD": json.dumps(MOCK_YBC),
               "YBG_LSP_MODE": "compiler",
               "YBG_LSP_TMPDIR": d}
        client = None
        try:
            client = spine.wire(bus, file_ext=".ybg", server_name="ybg-lsp",
                                argv=spine.shim_argv(), env=env, root_path=d)
            uri = spine.path_to_uri(path)
            client.did_open(uri, text)
            note = client.wait_notification(
                "textDocument/publishDiagnostics",
                pred=lambda m: m["params"]["uri"] == uri)
            shim_diags = note["params"]["diagnostics"]
            self.assertEqual(len(shim_diags), len(direct),
                             "shim dropped or invented diagnostics")
            for want, got in zip(direct, shim_diags):
                self.assertEqual(got["range"]["start"]["line"], want["line"] - 1)
                self.assertEqual(got["range"]["start"]["character"],
                                 want["col"] - 1)
                self.assertEqual(got["message"], want["message"])
        finally:
            if client is not None:
                client.shutdown()


if __name__ == "__main__":
    unittest.main()
