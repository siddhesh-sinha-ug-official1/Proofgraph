"""Import-boundary gate (Operating Contract rule 3) — wired BEFORE features.

Separation is a testable property: this cell may import only its declared
dependencies.  The gate statically scans every .py file under extractor/ with
`ast`, collects each absolute import's top-level module, and checks it against
the allowlist.  Every check is probed (`extractor.boundary.import.check`);
any violation fails the build.

License gate (Operating Contract rule 10) lives here too: the SPDX posture of
every declared dep and every subprocess-only tool is emitted as a state probe.
Copyleft tools are subprocess-only — they must never appear as imports.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

from .probe import ProbeBus

# Embeddable deps (permissive licenses only — spec §7.7).
DECLARED_DEPS: dict[str, str] = {
    "grimp": "BSD-2-Clause",
    "rustworkx": "Apache-2.0",
    "networkx": "BSD-3-Clause",
    "tree_sitter": "MIT",
    "tree_sitter_language_pack": "MIT",
}

# Tools we may only drive out-of-process (or that are CLI-only by design).
# Importing any of these as a Python module is a boundary violation.
SUBPROCESS_ONLY: dict[str, str] = {
    "pyright": "MIT (npm CLI/LSP — driven via subprocess by design)",
    "latexml": "CC0/public-domain (Perl CLI — subprocess when the LaTeX dock goes live)",
    "texlab": "GPL-3.0 (SUBPROCESS ONLY — never link)",
    "typst": "Apache-2.0 (CLI `typst eval` — subprocess when the Typst dock goes live)",
    "lake": "Apache-2.0 (Lean CLI — subprocess when the Lean dock goes live)",
    "pandoc": "GPL-2.0 (SUBPROCESS ONLY — not used)",
    "doxygen": "GPL-2.0 (SUBPROCESS ONLY — not used)",
}

_STDLIB = set(sys.stdlib_module_names)


class BoundaryViolation(RuntimeError):
    pass


def _top_module(name: str) -> str:
    return name.split(".", 1)[0]


def scan_imports(package_root: Path) -> list[tuple[str, str]]:
    """Return sorted (relative_file, top_module) pairs for every absolute import
    in the cell's source.  Relative imports (level>0) are internal and skipped."""
    found: set[tuple[str, str]] = set()
    for py in sorted(package_root.rglob("*.py")):
        rel = py.relative_to(package_root.parent).as_posix()
        tree = ast.parse(py.read_bytes(), filename=str(py))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    found.add((rel, _top_module(alias.name)))
            elif isinstance(node, ast.ImportFrom):
                if node.level and node.level > 0:
                    continue  # relative import: internal to the cell
                if node.module:
                    found.add((rel, _top_module(node.module)))
    return sorted(found)


def check_boundary(bus: ProbeBus, package_root: Path | None = None,
                   raise_on_violation: bool = True) -> list[dict]:
    """Run the gate, probing every import check. Returns the violation list."""
    root = package_root or Path(__file__).resolve().parent
    violations: list[dict] = []
    bus.emit("extractor.boundary.license.posture", "S0.boundary", "state", {
        "declaredDeps": dict(DECLARED_DEPS),
        "subprocessOnly": dict(SUBPROCESS_ONLY),
    })
    for rel, mod in scan_imports(root):
        allowed = (
            mod in DECLARED_DEPS
            or mod in _STDLIB
            or mod == root.name          # intra-cell absolute imports ("extractor.…")
        )
        if mod in SUBPROCESS_ONLY:
            allowed = False              # linking a subprocess-only tool breaches the license gate
        bus.emit("extractor.boundary.import.check", "S0.boundary", "decision",
                 {"importedModule": mod, "allowed": allowed, "file": rel})
        if not allowed:
            violations.append({"file": rel, "module": mod})
    if violations and raise_on_violation:
        raise BoundaryViolation(
            f"import-boundary gate: undeclared imports {violations} — the cell may "
            f"import only its declared deps (Operating Contract rule 3)")
    return violations
