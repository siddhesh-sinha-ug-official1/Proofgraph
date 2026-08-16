"""S2 · Python DOCK — shared constants + the effective honest ceiling.

Split from python_dock.py (SUB200 restructure); python_dock.py stays the
import surface (facade) and the dock registry name is unchanged.
"""
from __future__ import annotations

import builtins as _builtins

from .base import HonestCeiling

STAGE = "S2.dock.python"

PY_BUILTINS = frozenset(dir(_builtins))
DYNAMIC_IMPORT_CALLEES = ("importlib.import_module", "__import__")

DESIGNED_RESOLVES = ["imports (grimp, module-grade)", "def/ref (Pyright)",
                     "calls (Pyright-derived, function-grade)",
                     "inherits (Pyright-derived)"]


def effective_ceiling(handle, packages, allow_grimp, allow_pyright,
                      backend) -> HonestCeiling:
    """What THIS RUN could actually resolve (C4) — the design's full reach
    is documented separately in extra.designedResolves."""
    resolves: list[str] = []
    cannot = ["dynamic dispatch", "getattr/setattr", "monkeypatching",
              "dynamic imports (__import__)"]
    grades: list[str] = []
    if allow_grimp and packages:
        resolves.append("imports (grimp, module-grade)")
        grades.append("import-graph")
    else:
        cannot.append("imports this run (" +
                      ("no importable package" if allow_grimp else
                       f"tier {handle.tier} gate") + ")")
    if allow_pyright and backend is not None:
        resolves += ["def/ref (Pyright)", "calls (Pyright-derived, function-grade)",
                     "inherits (Pyright-derived)"]
        grades.append("name-resolution")
    else:
        cannot.append("calls/inherits this run (" +
                      ("no Pyright backend configured" if allow_pyright else
                       f"tier {handle.tier} gate") + ")")
    grade = "+".join(reversed(grades)) if grades else \
        "none (all candidates emitted as leads this run)"
    return HonestCeiling(
        lang="python", resolves=resolves, cannotResolve=cannot,
        resolverGrade=grade,
        blindSpots=["Pyright inference is static: runtime re-binding invisible",
                    "grimp is module-granular: intra-module call structure needs Pyright",
                    "reflection / DI edges not statically visible"],
        extra={"tier": handle.tier,
               "designedResolves": DESIGNED_RESOLVES,
               "backends": {"imports": "grimp" if (allow_grimp and packages) else None,
                            "calls": (f"pyright ({backend.mode})"
                                      if allow_pyright and backend is not None else None)}})
