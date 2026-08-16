"""capability-layer WALL — the cell's minimal, clean, versioned, typed face.

Phase-1 membrane (WALL-CONVENTIONS.md): this wall is promoted OVER the cell's
diagnostic pins, never replacing them.  Neighbors (SEAM-MAP V1 extractor,
V2 editor via the hub) consume exactly this face and nothing more:

    capability_wall(lang, repo=None, config=None)
        -> CapabilityWall     {known: True,  tier, paperTier, honestCeiling,
                               provenance, probeReport, handle, shutdown(),
                               pins, wallVersion, schemaPin, lang}
        -> WallRefusalNotice  {known: False, failureClass: 'unknown-language',
                               honestCeiling: 'no profile — tier unknown',
                               tier: None, lang}     (typed refusal, NOT a crash)

Guarantees carried by this face:
  * tier is the MEASURED tier from the cell's real capability() return — the
    probe battery's verdict, never the paper guess, never fabricated.
  * honest ceiling propagates: an unknown language surfaces `known=False` with
    tier=None — an unknown-tier language can never surface green through this
    wall.  This is where "unknown surfaces unknown at the outer wall" enters
    the organism.
  * handle is the live cell Handle passed through UNWRAPPED (request()/parse()
    per kind); the wall adds no adapter and no reinterpretation.
  * shutdown() terminates the live LSP child process (the cell's known leak:
    capability() leaves the server running inside the Handle).
  * pins -> {probeCatalog(), dump(), history(), tap(id, fn)} delegating to the
    cell's existing diagnostic quartet — every pin stays reachable.
  * the wall asserts the schema PIN at construction and refuses loudly on
    drift (failure class `schema-pin-mismatch`).

Named failure classes raised/returned by this wall:
  * schema-pin-mismatch        — raised (WallRefusal): canonical packages/schema
                                 missing/unreadable or drifted from the PIN.
  * unknown-language           — RETURNED as WallRefusalNotice (never a crash,
                                 never a fabricated tier).
  * concurrent-run-unsupported — raised (WallRefusal): a second wall-mediated
                                 capability() run while one is in flight.
The cell's own HonestCeilingViolation (tier-inflation) passes through unwrapped.

Concurrency bound (documented + enforced): the cell's dump()/history() are
module-global LAST-RUN state, so this wall enforces one-capability-run-at-a-
time via a non-blocking module lock (_RUN_LOCK).  A concurrent construction is
refused with `concurrent-run-unsupported` rather than queued — deterministic,
and it keeps pins-vs-face conformance honest.  Sequential runs overwrite
dump()/history(); read pins for a run before starting the next one.  Cell-
internal callers that invoke capability() directly bypass this wall and its
lock — the bound governs the wall-mediated face.

Wall probe leads (catalog EXTENDED, never shrunk — this cell's bus hard-rejects
uncatalogued emits, so the three wall.* leads are registered in the catalog):
  * capability.wall.construct — on the constructing run's own bus (part of that
    run's story; visible in history() while that run is the last run).
  * capability.wall.refusal   — on a private throwaway ProbeBus (there is no
    run to attach to); observable via tap(), never pollutes another run's
    history().
  * capability.wall.shutdown  — on the wall's own run bus (same visibility rule
    as construct).
"""

from __future__ import annotations

import json
import sys
import threading
from pathlib import Path

import capability.capability                # noqa: F401  (ensure submodule)
from capability import fixtures as _fixtures
from capability import probes as _probes
from capability.schema import green_allowed as _green_allowed

# The capability MODULE (its package __init__ rebinds the attribute name
# `capability` to the function, so plain `import ... as` would grab the
# function — sys.modules is unambiguous).
_cap_mod = sys.modules["capability.capability"]

WALL_VERSION = "capability-layer-wall/1.0.0"

# Assembly PIN (binding): the wall refuses to stand on a drifted schema.
PINNED_SCHEMA_VERSION = "v0"
PINNED_SCHEMA_HASH = (
    "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c")

# .../packages/capability-layer/wall.py -> parents[1] == packages/
_SCHEMA_PKG = Path(__file__).resolve().parents[1] / "schema"

# One-capability-run-at-a-time (module-global dump()/history() state).
_RUN_LOCK = threading.Lock()


# ---------------------------------------------------------------------------
# SUB200 restructure: the wall body lives in three section files exec'd
# INTO THIS module's namespace, in original source order.  This preserves
# every loading mode of the wall contract unchanged — module import,
# importlib-by-file (vessels/pathing.load_wall), and file-read + exec
# (tests 15/17): in all of them the sections share ONE namespace, each
# load gets a fresh _RUN_LOCK, and registration/probe semantics are those
# of the original single file.
# ---------------------------------------------------------------------------

_WALL_DIR = Path(__file__).resolve().parent
for _section in ("wall_refusals.py", "wall_pin.py", "wall_face.py"):
    _section_path = _WALL_DIR / _section
    exec(compile(_section_path.read_text(encoding="utf-8"),
                 str(_section_path), "exec"), globals())
del _WALL_DIR, _section, _section_path


__all__ = ["WALL_VERSION", "CapabilityWall", "WallRefusal",
           "WallRefusalNotice", "WallPins", "capability_wall",
           "PINNED_SCHEMA_VERSION", "PINNED_SCHEMA_HASH"]
