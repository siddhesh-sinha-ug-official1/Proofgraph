"""Import-boundary gate (Operating Contract rule 3) — wired BEFORE features.

Separation is a testable property: this cell may import ONLY its declared
dependencies (rustworkx, networkx), the Python stdlib, and its own modules.
The gate statically AST-scans every source file under src/ plus
schema/schemagen.py (the runtime import surface; the wall.py/run_pipeline.py
facades and tests only import src/*); any reach outside the boundary fails
the build (failure-class=import-boundary-violation).
"""
import ast
import sys
from pathlib import Path

DECLARED_DEPS = ["networkx", "rustworkx"]
OWN_TOP_LEVELS = {"src", "schemagen"}
_STDLIB = set(sys.stdlib_module_names)

# Forbidden by the tree prompt: parsers/LSP, UI, AI SDKs, other trees. Listed
# explicitly so a violation names WHAT boundary was crossed, but the gate is a
# whitelist — anything not declared/stdlib/own is a violation regardless.
FORBIDDEN_EXAMPLES = {"tree_sitter", "pygls", "react", "monaco", "openai",
                      "anthropic", "jsonschema", "requests"}


def default_scan_files(cell_root):
    files = sorted((Path(cell_root) / "src").rglob("*.py"))
    files.append(Path(cell_root) / "schema" / "schemagen.py")
    return [f for f in files if f.exists()]


def observed_imports(files):
    """Top-level module names imported across the given files (relative imports
    resolve to this cell and are counted as own)."""
    observed = set()
    for f in files:
        tree = ast.parse(Path(f).read_text(encoding="utf-8"), filename=str(f))
        for stmt in ast.walk(tree):
            if isinstance(stmt, ast.Import):
                for alias in stmt.names:
                    observed.add(alias.name.split(".")[0])
            elif isinstance(stmt, ast.ImportFrom):
                if stmt.level and stmt.level > 0:
                    observed.add("src")  # relative import == own module
                elif stmt.module:
                    observed.add(stmt.module.split(".")[0])
    return sorted(observed)


def run_gate(cell_root, extra_files=None):
    """Returns the importGate decision payload. extra_files lets the self-test
    inject a forbidden import and watch pass flip to false."""
    files = default_scan_files(cell_root) + [Path(f) for f in (extra_files or [])]
    observed = observed_imports(files)
    violations = sorted(
        m for m in observed
        if m not in _STDLIB and m not in DECLARED_DEPS and m not in OWN_TOP_LEVELS
    )
    return {
        "declaredDeps": list(DECLARED_DEPS),
        "observedImports": observed,
        "violations": violations,
        "pass": len(violations) == 0,
    }


class ImportBoundaryViolation(Exception):
    """failure-class=import-boundary-violation"""
