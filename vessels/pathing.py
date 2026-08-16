"""pathing — the reusable sys.path wiring for multi-cell Python composition.

Phase-2 vessels (and the hub) compose several Python cells IN ONE PROCESS.
Each cell was built to run from its own folder and expects ITS OWN root on
sys.path (graph-model imports `src.*`, structure-extractor imports
`extractor.*`, capability-layer imports `capability.*`).  Composing them
naively has two failure modes this module exists to prevent:

1.  **The dual `wall.py` ambiguity.**  Every Python cell ships its wall as
    `<cell-root>/wall.py`.  With two cell roots on sys.path, a bare
    `import wall` binds WHICHEVER root comes first — silently wiring the
    wrong cell.  Vessels must therefore NEVER `import wall`; they call
    `load_wall(cell)` here, which loads `<root>/wall.py` under a unique,
    cell-tagged module name via importlib (`proofgraph_wall_<cell>`).

2.  **Top-level package shadowing** (`sys-path-shadowing`, seam-failure
    catalog).  Two cells claiming the same top-level import name (e.g. two
    `src` packages) would silently mix cytoplasm across membranes.  Before a
    cell root goes on sys.path, `ensure_cell_on_path` verifies (a) no OTHER
    known cell owns any of this cell's top-level names, and (b) none of those
    names is already imported from a foreign location.  Violations raise
    `SysPathShadowingError` — loudly, never a silent mis-wire.

The canonical schema package (`packages/schema`) is flat modules (ids.py,
pin.py, ...) with no package __init__; they are loaded by FILE under unique
aliases (`load_schema_module("ids")`), never via a bare `import ids`.

Scope: Python cells only (editor-shell / graph-view / byok-arena are TS and
compose over HTTP/WS/bus, not sys.path).

Usage (a vessel or the hub):

    from pathing import load_wall, load_schema_module

    sx = load_wall("structure-extractor")   # -> module with extract_wall(...)
    gm = load_wall("graph-model")           # -> module with create_wall(...)
    ids = load_schema_module("ids")         # -> canonical mint (packages/schema/ids.py)

Idempotent: repeated calls return the SAME module objects (sys.modules-cached),
so hub + several vessels in one process share one wall module per cell.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path
from types import ModuleType

PROOFGRAPH_ROOT = Path(__file__).resolve().parents[1]
PACKAGES = PROOFGRAPH_ROOT / "packages"

#: Each Python cell's root directory name -> the top-level import package(s)
#: that cell's own modules resolve through sys.path.  This table is the
#: shadowing guard's ground truth; extend it when a new Python cell lands.
CELL_TOP_PACKAGES: dict[str, tuple[str, ...]] = {
    "graph-model": ("src",),
    "structure-extractor": ("extractor",),
    "capability-layer": ("capability",),
}

_WALL_ALIAS_PREFIX = "proofgraph_wall_"
_SCHEMA_ALIAS_PREFIX = "proofgraph_schema_"


class SysPathShadowingError(RuntimeError):
    """Two cells' cytoplasm would collide on one top-level module name (or a
    module of that name is already imported from a foreign location).  Named
    seam-failure class: sys-path-shadowing.  Always raised loudly BEFORE the
    colliding root goes on sys.path — never a silent mis-wire."""
    failure_class = "sys-path-shadowing"

    def __init__(self, detail: str):
        super().__init__(f"failure-class={self.failure_class}: {detail}")
        self.detail = detail


def cell_root(cell: str) -> Path:
    """Absolute root of a Python cell package (raises for unknown cells)."""
    if cell not in CELL_TOP_PACKAGES:
        raise KeyError(
            f"unknown Python cell {cell!r}; known: {sorted(CELL_TOP_PACKAGES)} "
            f"(TS cells compose over HTTP/WS, not sys.path)")
    root = PACKAGES / cell
    if not root.is_dir():
        raise FileNotFoundError(f"cell root missing: {root}")
    return root


def _module_origin(mod: ModuleType) -> Path | None:
    """Best-effort filesystem origin of an already-imported module."""
    origin = getattr(mod, "__file__", None)
    if origin is None and hasattr(mod, "__path__"):
        paths = list(getattr(mod, "__path__"))
        origin = paths[0] if paths else None
    return Path(origin).resolve() if origin else None


def _is_under(child: Path, parent: Path) -> bool:
    c = os.path.normcase(str(child.resolve()))
    p = os.path.normcase(str(parent.resolve()))
    try:
        Path(c).relative_to(Path(p))
        return True
    except ValueError:
        return False


def ensure_cell_on_path(cell: str) -> Path:
    """Put `cell`'s root on sys.path (front), guarded against shadowing.

    Guards (both raise SysPathShadowingError, seam class sys-path-shadowing):
      * design invariant — no OTHER known cell may own any of this cell's
        top-level package names (the table must stay collision-free);
      * runtime invariant — none of this cell's top-level names may already
        be imported from a location OUTSIDE this cell's root.
    """
    root = cell_root(cell)
    tops = CELL_TOP_PACKAGES[cell]

    for other, other_tops in CELL_TOP_PACKAGES.items():
        if other == cell:
            continue
        clash = set(tops) & set(other_tops)
        if clash:
            raise SysPathShadowingError(
                f"cells {cell!r} and {other!r} both claim top-level package(s) "
                f"{sorted(clash)} — they cannot share one process's sys.path")

    for top in tops:
        mod = sys.modules.get(top)
        if mod is None:
            continue
        origin = _module_origin(mod)
        if origin is not None and not _is_under(origin, root):
            raise SysPathShadowingError(
                f"top-level module {top!r} is already imported from {origin} "
                f"which is outside {cell!r}'s root {root} — refusing to put "
                f"{root} on sys.path underneath a foreign {top!r}")

    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    return root


def _load_by_file(alias: str, path: Path) -> ModuleType:
    """importlib file-load under a unique alias, sys.modules-cached."""
    cached = sys.modules.get(alias)
    if cached is not None:
        return cached
    if not path.is_file():
        raise FileNotFoundError(f"module file missing: {path}")
    spec = importlib.util.spec_from_file_location(alias, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot build import spec for {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[alias] = mod          # registered first: circular-safe
    try:
        spec.loader.exec_module(mod)
    except BaseException:
        sys.modules.pop(alias, None)  # a half-executed wall must not linger
        raise
    return mod


def load_wall(cell: str) -> ModuleType:
    """Load `<cell-root>/wall.py` under the unique alias
    `proofgraph_wall_<cell>` (dashes -> underscores) and return the module.

    Never use a bare `import wall` in vessel/hub code: with several cell
    roots on sys.path it binds whichever root comes first (see module
    docstring, failure mode 1).  This function is the only sanctioned way a
    vessel reaches a Python cell's wall."""
    root = ensure_cell_on_path(cell)   # the wall imports its own cytoplasm
    alias = _WALL_ALIAS_PREFIX + cell.replace("-", "_")
    return _load_by_file(alias, root / "wall.py")


def load_schema_module(stem: str) -> ModuleType:
    """Load `packages/schema/<stem>.py` (e.g. "ids", "pin") under the unique
    alias `proofgraph_schema_<stem>` — the canonical, assembly-wide module,
    never a cell's local mirror, and never via a bare `import <stem>`."""
    return _load_by_file(_SCHEMA_ALIAS_PREFIX + stem,
                         PACKAGES / "schema" / f"{stem}.py")


__all__ = [
    "PROOFGRAPH_ROOT", "PACKAGES", "CELL_TOP_PACKAGES",
    "SysPathShadowingError", "cell_root", "ensure_cell_on_path",
    "load_wall", "load_schema_module",
]
