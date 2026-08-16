"""Outline worst-of policy gate (split from test_schema_package.py, SUB200)."""
import sys
import unittest
from pathlib import Path

if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from context import VERDICT_CASES  # noqa: E402

import schema_constants  # noqa: E402  (from gen/)


class TestWorstOfPolicy(unittest.TestCase):
    """Ruling 4: split 7-token order; unrecognized ranks WORST and is reported."""

    def test_order_and_table_are_the_rulings(self):
        self.assertEqual(schema_constants.OUTLINE_WORST_ORDER,
                         ("red", "amber", "blue", "definition", "lemma", "none", "green"))
        self.assertEqual(schema_constants.WORST_TOKEN_TO_STATUS,
                         {"red": "red", "amber": "amber", "blue": "blue",
                          "definition": "blue", "lemma": "green", "none": "green",
                          "green": "green"})
        self.assertEqual(schema_constants.BANNED_WORST_TOKENS, ("none/green",))

    def test_rank_worst_token(self):
        for i, token in enumerate(schema_constants.OUTLINE_WORST_ORDER):
            self.assertEqual(schema_constants.rank_worst_token(token),
                             {"rank": i, "recognized": True})
        for garbage in ("none/green", "", "NONE", "verde", "🟢"):
            self.assertEqual(schema_constants.rank_worst_token(garbage),
                             {"rank": -1, "recognized": False},
                             f"unrecognized token {garbage!r} must rank WORST")

    def test_worst_of_verdict_cases(self):
        for worst_of, want_token, want_status, want_unrec in VERDICT_CASES:
            got = schema_constants.worst_of_verdict(worst_of)
            self.assertEqual(got, {"worstToken": want_token, "status": want_status,
                                   "unrecognized": want_unrec},
                             f"worstOf={worst_of}")

    def test_placeholder_helpers(self):
        self.assertEqual(schema_constants.UNRESOLVED_PLACEHOLDER_PREFIX, "unresolved:")
        self.assertTrue(schema_constants.is_unresolved_placeholder("unresolved:η_helper"))
        self.assertFalse(schema_constants.is_unresolved_placeholder("n_" + "0" * 16))


if __name__ == "__main__":
    unittest.main()
