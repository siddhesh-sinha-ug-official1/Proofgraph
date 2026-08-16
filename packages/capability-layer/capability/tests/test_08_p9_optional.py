"""Gate 8 — P9 optional-capability handling (the texlab/tinymist/Lean caveat).

A server whose P0 capabilities omit callHierarchyProvider/typeHierarchyProvider
gets P9 = skip (NOT fail), and the tier is not downgraded for it.
"""

import unittest

from capability.tests import common


class TestP9Optional(unittest.TestCase):
    def test_p9_skip_not_fail_on_ct(self):
        cap = common.get_run("ct")
        caps = common.result_of(cap, "p0")["response"]
        self.assertNotIn("callHierarchyProvider", caps)
        self.assertNotIn("typeHierarchyProvider", caps)
        p9 = common.result_of(cap, "p9")
        self.assertEqual(p9["verdict"], "skip")
        self.assertIn("OPTIONAL", p9["evidence"])
        self.assertEqual(cap.tier, "CT", "tier must NOT be downgraded for P9")

    def test_p9_skip_on_structure_server_too(self):
        cap = common.get_run("zigish")
        self.assertEqual(common.result_of(cap, "p9")["verdict"], "skip")

    def test_degrade_map_recorded_the_absence(self):
        cap = common.get_run("ct")
        degrades = common.events_of(cap, "capability.wire.degrade")
        methods = {e["payload"]["method"] for e in degrades}
        self.assertIn("textDocument/prepareCallHierarchy", methods)
        self.assertIn("textDocument/semanticTokens/full", methods)


if __name__ == "__main__":
    unittest.main()
