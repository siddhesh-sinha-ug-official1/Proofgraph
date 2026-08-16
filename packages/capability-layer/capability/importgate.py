"""Import-boundary gate — separation is a testable property (Operating Contract rule 3).

This cell may import ONLY its declared dependencies:
  * process/subprocess spawning + JSON / JSON-RPC framing (stdlib),
  * the tree-sitter runtime (stubbed locally this round; seam name allowed),
  * the SCIP protobuf reader (stubbed locally this round; seam names allowed),
  * the shared Frozen-Schema types + shared probe bus (intra-package),
  * the stdlib support set below.

Reaching outside this set (e.g. into another tree's edge extractor) FAILS the build.
The test gate (tests/test_01_import_boundary.py) runs check_import_boundary() over the
whole package and also verifies that a forbidden import IS rejected.
"""

from __future__ import annotations

import ast
from pathlib import Path

# stdlib support set (process spawning, JSON, framing, hashing, threading, fs plumbing)
ALLOWED_STDLIB = {
    "json", "subprocess", "sys", "os", "re", "io", "ast", "abc", "time", "math",
    "hashlib", "tempfile", "threading", "queue", "pathlib", "dataclasses", "typing",
    "enum", "collections", "contextlib", "functools", "itertools", "shutil", "signal",
    "string", "textwrap", "unittest", "urllib", "copy", "datetime", "atexit", "errno",
    "stat", "struct", "traceback", "__future__",
}

# Declared third-party seams. This round both are stubbed locally and these names are
# NOT actually imported anywhere; they are listed so the later real-wiring pass is a
# config change, not a gate change. (tree-sitter runtime: MIT — verify each grammar's
# own LICENSE; SCIP protobuf schema/reader: Apache-2.0 — verify. Operating Contract
# rule 10: both consumed as libraries/data only, never an embedded engine.)
ALLOWED_THIRD_PARTY = {"tree_sitter", "scip_pb2", "google"}

# Intra-package imports (the shared probe bus + schema stub live here).
ALLOWED_INTERNAL_ROOT = "capability"

# Names that mark another tree's territory — always violations, listed explicitly so
# the gate's intent is readable.
FORBIDDEN_ROOTS = {"tree1", "tree3", "tree4", "tree5", "tree6", "edge_extractor",
                   "graph_model", "gap_analysis", "requests", "httpx"}


def imports_of_source(source: str, filename: str = "<module>") -> set[str]:
    """Top-level root module names imported by a Python source string."""
    roots: set[str] = set()
    tree = ast.parse(source, filename=filename)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                roots.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                continue  # relative import — intra-package by construction
            if node.module:
                roots.add(node.module.split(".")[0])
    return roots


def violations_of_source(source: str, filename: str = "<module>") -> list[str]:
    bad = []
    for root in sorted(imports_of_source(source, filename)):
        if root in ALLOWED_STDLIB:
            continue
        if root in ALLOWED_THIRD_PARTY:
            continue
        if root == ALLOWED_INTERNAL_ROOT:
            continue
        bad.append(root)
    return bad


def check_import_boundary(package_root: str | Path | None = None) -> list[dict]:
    """Scan every .py under the capability package; return [{file, import}] violations."""
    root = Path(package_root) if package_root else Path(__file__).resolve().parent
    out: list[dict] = []
    for py in sorted(root.rglob("*.py")):
        source = py.read_text(encoding="utf-8")
        for bad in violations_of_source(source, str(py)):
            out.append({"file": str(py), "import": bad})
    return out
