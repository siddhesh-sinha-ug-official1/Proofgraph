"""Capability seam gate (split from test_schema_package.py, SUB200)."""
import sys
import unittest
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from context import CAPABILITY_OBJ  # noqa: E402

import capability_constants  # noqa: E402  (from gen/)


class TestCapabilitySeam(unittest.TestCase):
    """Ruling 2: DEPTH_ALLOWS_RESOLVED_EDGES — Tree 2's table wins (S: false)."""

    def test_generated_constants_match_capability_json(self):
        self.assertEqual(list(capability_constants.DEPTH_TIERS),
                         CAPABILITY_OBJ["depthTiers"])
        self.assertEqual(capability_constants.DEPTH_ALLOWS_RESOLVED_EDGES,
                         CAPABILITY_OBJ["depthAllowsResolvedEdges"])
        self.assertEqual(capability_constants.DEPTH_TO_MAX_PROVENANCE,
                         CAPABILITY_OBJ["depthToMaxProvenance"])
        self.assertEqual(capability_constants.HONEST_CEILINGS,
                         CAPABILITY_OBJ["honestCeilings"])

    def test_the_ruling_itself(self):
        self.assertEqual(capability_constants.DEPTH_TIERS, ("CT", "S", "G", "P"))
        self.assertEqual(capability_constants.DEPTH_ALLOWS_RESOLVED_EDGES,
                         {"CT": True, "S": False, "G": False, "P": False})


if __name__ == "__main__":
    unittest.main()
