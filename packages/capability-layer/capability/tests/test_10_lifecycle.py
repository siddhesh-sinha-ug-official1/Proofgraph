"""Gate 10 — lifecycle / crash: kill ybg-lsp mid-session; capability.wire.crash
fires, restart() recovers, and the restart behaviour is recorded with wallNanos
only (never used for ordering).
"""

import json
import os
import sys
import unittest

from capability import spine
from capability.probes import ProbeBus, tap
from capability.tests import common

_LAYER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
REPO = os.path.join(_LAYER_ROOT, "testbed", "ybg_repo")
MOCK_YBC = [sys.executable, os.path.join(_LAYER_ROOT, "testbed", "mock_ybc.py")]


class TestLifecycle(unittest.TestCase):
    def _wire(self, bus):
        env = {"YBG_LSP_YBC_CMD": json.dumps(MOCK_YBC),
               "YBG_LSP_MODE": "compiler",
               "YBG_LSP_TMPDIR": common.work_dir("lifecycle")}
        return spine.wire(bus, file_ext=".ybg", server_name="ybg-lsp",
                          argv=spine.shim_argv(), env=env, root_path=REPO)

    def test_crash_is_surfaced_and_restart_recovers(self):
        bus = ProbeBus()
        crash_seen = []
        untap = tap("capability.wire.crash", crash_seen.append)
        client = None
        try:
            client = self._wire(bus)
            main = os.path.join(REPO, "main.ybg")
            with open(main, "r", encoding="utf-8") as f:
                text = f.read()
            uri = spine.path_to_uri(main)
            client.did_open(uri, text)
            client.wait_notification("textDocument/publishDiagnostics",
                                     pred=lambda m: m["params"]["uri"] == uri)

            client.kill()
            with self.assertRaises(spine.ServerCrashed):
                client.request("textDocument/hover",
                               {"textDocument": {"uri": uri},
                                "position": {"line": 4, "character": 4}})

            crashes = [e for e in bus.history()
                       if e["probeId"] == "capability.wire.crash"]
            self.assertEqual(len(crashes), 1, "crash not surfaced")
            self.assertIsNotNone(crashes[0]["payload"]["pid"])
            self.assertEqual(len(crash_seen), 1, "tap() did not observe the crash")

            transitions = [(e["payload"]["from"], e["payload"]["to"])
                           for e in bus.history()
                           if e["probeId"] == "capability.wire.lifecycle"]
            self.assertIn(("alive", "crashed"), transitions)

            client.restart()
            self.assertTrue(client.alive)
            transitions = [(e["payload"]["from"], e["payload"]["to"])
                           for e in bus.history()
                           if e["probeId"] == "capability.wire.lifecycle"]
            self.assertIn(("crashed", "restarting"), transitions)
            # the reopened doc republishes diagnostics; a request works again
            client.wait_notification("textDocument/publishDiagnostics",
                                     pred=lambda m: m["params"]["uri"] == uri)
            resp = client.request("textDocument/hover",
                                  {"textDocument": {"uri": uri},
                                   "position": {"line": 4, "character": 4}})
            self.assertIn("result", resp)
        finally:
            untap()
            if client is not None:
                client.shutdown()  # never leaks the shim, even on assert failure

    def test_wall_nanos_is_a_separate_field_never_in_ordering(self):
        cap = common.get_run("ct")
        clocks = [e["logicalClock"] for e in cap.probeStream]
        self.assertEqual(clocks, sorted(clocks))
        self.assertEqual(clocks, list(range(len(clocks))))
        timed = [e for e in cap.probeStream if e["wallNanos"] is not None]
        self.assertTrue(timed, "no wallNanos-bearing leads at all")
        for pid in ("capability.probe.p10", "capability.probe.p11"):
            evs = common.events_of(cap, pid)
            self.assertTrue(all(e["wallNanos"] is not None for e in evs),
                            f"{pid} must carry wallNanos")

    def test_p11_recorded_restart_behaviour(self):
        cap = common.get_run("ct")
        p11 = common.result_of(cap, "p11")
        self.assertEqual(p11["verdict"], "pass")
        self.assertEqual(p11["response"], {"restartFast": False})
        self.assertFalse(cap.probeReport["restartFast"])


if __name__ == "__main__":
    unittest.main()
