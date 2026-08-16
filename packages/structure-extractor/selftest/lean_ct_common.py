"""Shared helpers for the LEAN-DOCK CT test files (SUB200 restructure:
test_lean_ct_dock.py split into test_lean_ct_dock.py / test_lean_ct_guards.py
/ test_lean_decl_match.py — total test count unchanged, no assertion touched).

The live tests skip LOUDLY when no lean binary is reachable (mirroring the
live-pyright oracle posture); the mapping/guard tests are pure and always run.
"""
import unittest

from harness import TREE  # noqa: F401  (sys.path side effect: cell root)

from extractor.docks.lean_dock import _default_lean_exe
from extractor.schema import SchemaNode, Span


def skip_without_lean():
    if _default_lean_exe() is None:
        raise unittest.SkipTest(
            "LOUD SKIP: no lean binary reachable — the CT lean path was NOT measured")


def decl_node(name, nid, start=0):
    return SchemaNode(
        id=nid, kind="theorem", lang="lean", name=name, signature=None,
        span=Span("Collide.lean", start, start + 10),
        fill={"status": "unknown", "source": "t"}, origin="assumed",
        provenance={"tier": "T1", "extractor": "tree-sitter",
                    "resolved": True})
