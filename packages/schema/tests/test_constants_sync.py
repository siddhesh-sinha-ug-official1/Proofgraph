"""Constants-mirror-schema gate (split from test_schema_package.py, SUB200)."""
import re
import sys
import unittest
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from context import SCHEMA_OBJ  # noqa: E402

import ids  # noqa: E402
import schema_constants  # noqa: E402  (from gen/)


class TestConstantsMatchSchema(unittest.TestCase):
    """gen/schema_constants.py must mirror schema.json exactly."""

    def test_enums(self):
        node_props = SCHEMA_OBJ["$defs"]["Node"]["properties"]
        self.assertEqual(list(schema_constants.NODE_KINDS), node_props["kind"]["enum"])
        self.assertEqual(list(schema_constants.EDGE_KINDS),
                         SCHEMA_OBJ["$defs"]["Edge"]["properties"]["kind"]["enum"])
        self.assertEqual(list(schema_constants.LANGS), node_props["lang"]["enum"])
        self.assertEqual(list(schema_constants.FILL_STATUSES),
                         node_props["fill"]["properties"]["status"]["enum"])
        self.assertEqual(list(schema_constants.ORIGINS), node_props["origin"]["enum"])
        self.assertEqual(list(schema_constants.TIERS),
                         node_props["provenance"]["properties"]["tier"]["enum"])

    def test_amendment_facts_recorded_in_schema_json(self):
        self.assertEqual(SCHEMA_OBJ["schemaVersion"], "v0")
        self.assertEqual(SCHEMA_OBJ["schemaRevision"], "v0.1")
        # ruling 1: definition -> blue (NOT green)
        self.assertEqual(SCHEMA_OBJ["worstTokenToStatus"]["definition"], "blue")
        # ruling 4: split 7-token order; fused token banned
        self.assertEqual(SCHEMA_OBJ["outlineWorstOrder"],
                         ["red", "amber", "blue", "definition", "lemma", "none", "green"])
        self.assertEqual(SCHEMA_OBJ["outlinePolicy"]["bannedTokens"], ["none/green"])
        # ruling 6: placeholder = prefix + rawRefName
        self.assertEqual(SCHEMA_OBJ["unresolvedPlaceholder"],
                         {"prefix": "unresolved:", "form": "prefix + rawRefName"})
        # ruling 5: the frozen mint, machine-readable
        id_scheme = SCHEMA_OBJ["idScheme"]
        self.assertEqual(id_scheme["delimiter"], "\x1f")
        self.assertEqual(id_scheme["hashLength"], 16)
        self.assertEqual(id_scheme["node"]["domainTag"], "node:v0")
        self.assertEqual(id_scheme["node"]["preimageFields"],
                         ["lang", "kind", "canonicalName", "file", "path"])
        self.assertEqual(id_scheme["edge"]["domainTag"], "edge:v0")
        self.assertEqual(id_scheme["edge"]["preimageFields"], ["kind", "srcId", "dstId"])
        # ruling 7: single provenance.resolved definition
        resolved = SCHEMA_OBJ["$defs"]["Node"]["properties"]["provenance"]\
            ["properties"]["resolved"]
        self.assertEqual(resolved["description"],
                         "the extractor successfully bound this element's identity; "
                         "true for every well-formed structural node")
        # ruling 3: the envelope const is untouched
        self.assertEqual(SCHEMA_OBJ["$defs"]["Graph"]["properties"]["schemaVersion"],
                         {"const": "v0"})

    def test_id_scheme_matches_ids_py(self):
        id_scheme = SCHEMA_OBJ["idScheme"]
        self.assertEqual(ids.US, id_scheme["delimiter"])
        self.assertEqual(ids.TRUNCATE, id_scheme["hashLength"])
        self.assertEqual(ids.NODE_DOMAIN_TAG, id_scheme["node"]["domainTag"])
        self.assertEqual(ids.EDGE_DOMAIN_TAG, id_scheme["edge"]["domainTag"])
        self.assertTrue(re.match(schema_constants.NODE_ID_PATTERN,
                                 ids.node_id_from_preimage("x")))
        self.assertTrue(re.match(schema_constants.EDGE_ID_PATTERN,
                                 ids.edge_id_from_preimage("x")))


if __name__ == "__main__":
    unittest.main()
