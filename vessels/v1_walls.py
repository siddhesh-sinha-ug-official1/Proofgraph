"""vessels/v1_walls.py — V1's wall loading + canonical language set.

SUB200 restructure: split out of vessels/v1_capability_extractor.py (which
remains the facade and re-exports every name here).  Behavior unchanged.

Loading: both walls come through `vessels/pathing.py` — the sanctioned
wiring (unique per-cell wall aliases + the sys-path-shadowing guard); the
canonical schema constants are file-loaded from packages/schema/gen.
"""
from __future__ import annotations

import sys
from pathlib import Path

_VESSELS = Path(__file__).resolve().parent
if str(_VESSELS) not in sys.path:
    sys.path.insert(0, str(_VESSELS))

from pathing import PACKAGES, cell_root, load_wall  # noqa: E402

CAP_ROOT = cell_root("capability-layer")
EXT_ROOT = cell_root("structure-extractor")
SCHEMA_PKG = PACKAGES / "schema"

CAP_WALL = load_wall("capability-layer")
EXT_WALL = load_wall("structure-extractor")


def _exec_file(path: Path, name: str) -> dict:
    """Load a canonical schema artifact as data (file-read + exec — the same
    pattern every wall uses; never a bare import of a flat module name)."""
    ns = {"__name__": name, "__file__": str(path)}
    exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), ns)
    return ns


# The extractor's language set, read from the CANONICAL schema package
# (single source of truth), consumed as data like every wall does.
_SCHEMA_CONSTS = _exec_file(SCHEMA_PKG / "gen" / "schema_constants.py",
                            "v1_schema_constants")
EXTRACTOR_LANGS = tuple(_SCHEMA_CONSTS["LANGS"])

# Faces the vessel composes (walls only):
capability_wall = CAP_WALL.capability_wall
WallRefusalNotice = CAP_WALL.WallRefusalNotice
extract_wall = EXT_WALL.extract_wall
CapabilityHandle = EXT_WALL.CapabilityHandle
stub_capability = EXT_WALL.stub_capability
UnknownLanguageError = EXT_WALL.UnknownLanguageError

# cell 2's tap surface (catalogued lead; refusals fire on a private bus and
# are observable ONLY via tap — this is the cell-2 pin for refusal paths)
from capability import probes as cap_probes  # noqa: E402


class SilentTierUpgradeError(RuntimeError):
    """Named failure class `silent-tier-upgrade`: the wall face and the
    measuredTier pin disagreed — the vessel refuses to carry the tier."""
    failure_class = "silent-tier-upgrade"


class UnrecordedStubFallback(RuntimeError):
    """Named failure class `unrecorded-stub-fallback`: a local-stub answer
    without a recorded capability-layer refusal must never cross the seam."""
    failure_class = "unrecorded-stub-fallback"
