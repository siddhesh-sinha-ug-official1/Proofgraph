"""Gate 17b — lean shutdown / orphan sweep (split from Gate 17 SUB200; runs
AFTER test_17_lean_profile.py by discovery order, exactly as the original
name-ordered test_z did inside the single file).

Proves wall.shutdown() kills the WHOLE lake tree: the spawned chain is 4
deep (elan shim lake → real lake → lean watchdog → lean file workers);
killing only the top orphans the rest (failure class:
orphaned-subprocess-tree).
"""

import os
import time
import unittest

from capability import probes
from capability.tests.lean_common import _STATE, _lean_pids, get_lean_wall


class TestLeanShutdown(unittest.TestCase):
    def test_z_shutdown_kills_the_whole_lake_tree(self):
        wall = get_lean_wall()
        shutdown_seen = []
        untap = probes.tap("capability.wall.shutdown", shutdown_seen.append)
        try:
            wall.shutdown()
        finally:
            untap()
        self.assertEqual(len(shutdown_seen), 1)
        self.assertTrue(shutdown_seen[0]["payload"]["terminated"])
        client = wall.handle._client
        self.assertIsNotNone(client.proc.poll(), "lake shim still alive")
        if os.name == "nt":
            # orphaned-subprocess-tree guard: every lean.exe/lake.exe spawned
            # by this run must be gone (the chain is 4 deep; killing only the
            # top orphans the watchdog and its file workers)
            before = _STATE["lean_pids_before"]
            deadline = time.time() + 20
            leaked = _lean_pids() - before
            while leaked and time.time() < deadline:
                time.sleep(1)
                leaked = _lean_pids() - before
            self.assertEqual(leaked, set(),
                             f"orphaned lean/lake processes: {leaked}")


if __name__ == "__main__":
    unittest.main()
