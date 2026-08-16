"""VESSEL V1 — capability wall (cell 2) → structure-extractor wall (cell 3).

Assembly code (proofgraph/vessels/): connects WALLS, never cytoplasm.

    feed = V1CapabilityFeed()
    wall = extract_wall()                             # cell 3's wall
    env  = wall.extract(root, capability_fn=feed.capability_fn, config=...)
    ...
    feed.shutdown()        # the vessel owns cell 2's LSP children

What the factory guarantees (the V1 invariants, SEAM-MAP.md):

  * the tier the extractor sees == the tier cell 2 MEASURED, byte-equal —
    the vessel re-reads cell 2's `capability.probe.measuredTier` pin at
    construction and refuses (failure class `silent-tier-upgrade`) if the
    face and the pin ever disagree.  No path through this vessel can hand
    cell 3 a tier cell 2 did not measure.
  * a language cell 2 REFUSES (typed `unknown-language` WallRefusalNotice):
      - inside the extractor's own language set → the extractor's local stub
        is used AS THE EXPLICITLY RECORDED FALLBACK: the refusal event, the
        stub tier and the provenance stamp all land in `feed.provenance`
        and in the handleKind string cell 3 pins on its own
        `extractor.ingest.capability.response` lead.  A stub answer that is
        not so recorded is the named failure class
        `unrecorded-stub-fallback` (structurally unreachable here — the
        record is written before the handle is returned).
      - outside the extractor's language set → the vessel raises cell 3's
        own typed `UnknownLanguageError`.  No fabricated tier anywhere.
  * provenance is stamped on every answer: measuredBy `capability-layer`
    (real measurement) vs `local-stub` (recorded fallback) vs `refused`.
  * every bound is LOGGED in `feed.bounds` (rule 8, no silent caps):
      - duplicated-subprocess: cell 3 builds its OWN pyright backend from
        PipelineConfig (the documented V1 friction: CapabilityHandle.handle
        is never consumed by `_make_dock`), so during a python extract two
        pyright subprocess trees exist — cell 2's measured handle (owned by
        this vessel until shutdown()) and cell 3's backend (closed by the
        pipeline).  Recorded decision: KEEP the duplication and log it,
        rather than bridging cell 2's live handle into cell 3's backend
        socket (which would require touching `_make_dock` — cytoplasm).
      - no-grammar-floor: python has no tree-sitter floor in cell 2's stub
        runtime; if pyright dies mid-run the fallback tier is P, not G.
  * shutdown(): terminates every live LSP child cell 2 left in its handles
    (the cell's documented leak, closed at the wall) and returns the
    `capability.wall.shutdown` pin payloads as proof.

Loading: both walls come through `vessels/pathing.py` — the sanctioned
wiring (unique per-cell wall aliases + the sys-path-shadowing guard); the
canonical schema constants are file-loaded from packages/schema/gen.

SUB200 restructure: this module is now the FACADE — wall loading + the
canonical language set live in vessels/v1_walls.py, the feed class in
vessels/v1_feed.py.  Every public name is re-exported; importers unchanged.
"""
from __future__ import annotations

import sys
from pathlib import Path

_VESSELS = Path(__file__).resolve().parent
if str(_VESSELS) not in sys.path:
    sys.path.insert(0, str(_VESSELS))

from v1_walls import (CAP_ROOT, CAP_WALL, EXT_ROOT, EXT_WALL,   # noqa: E402
                      EXTRACTOR_LANGS, SCHEMA_PKG, CapabilityHandle,
                      SilentTierUpgradeError, UnknownLanguageError,
                      UnrecordedStubFallback, WallRefusalNotice,
                      capability_wall, extract_wall, stub_capability)
from v1_walls import cap_probes as _cap_probes                   # noqa: E402
from v1_feed import FeedShutdownError, V1CapabilityFeed          # noqa: E402

__all__ = [
    "V1CapabilityFeed", "SilentTierUpgradeError", "UnrecordedStubFallback",
    "capability_wall", "extract_wall", "CapabilityHandle", "stub_capability",
    "UnknownLanguageError", "FeedShutdownError",
    "EXTRACTOR_LANGS", "CAP_ROOT", "EXT_ROOT",
]
