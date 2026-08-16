"""The graph-model WALL — Phase 1 (see MEMBRANE-SPEC.md, WALL-CONVENTIONS.md).

The minimal, clean, versioned, typed face this cell presents to its neighbors,
promoted OVER the cell's diagnostic pins, never replacing them:

    ingest(nodes, edges, leads=None, roots=None)  VERIFY-NOT-MINT
    query(kind, **args)   reachable | unused | sccs | condensation
    project(kind)         'graph' | 'flat' ('text' honestly refused)
    verdictOf(nodeId)     {fill, outline} pass-through, never invented
    pins                  {probeCatalog(), dump(), history(), tap(id, fn)}

Every wall decision is probed on the cell's own ProbeBus under the additive
`graph-model.wall.*` catalog section, so conformance can assert face == pins.
Every refusal carries a NAMED failure class (WallRejection.failure_class).

The wall asserts the canonical schema PIN at construction and refuses loudly
to stand on a drifted schema (failure class: schema-pin-mismatch).

This module is the FACADE: the implementation lives in src/wall/ (base.py,
ingest.py, queries.py, core.py); the full public surface is re-exported here
so external consumers (vessels' pathing.load_wall, hub, tests) need nothing
but this path.
"""
import sys
from pathlib import Path

_CELL_ROOT = Path(__file__).resolve().parent
if str(_CELL_ROOT) not in sys.path:
    sys.path.insert(0, str(_CELL_ROOT))

from src.wall import (PROJECT_KINDS, QUERY_KINDS, SCHEMA_PIN_HASH,  # noqa: E402
                      SCHEMA_PIN_VERSION, UNRESOLVED_PREFIX, WALL_VERSION,
                      GraphModelWall, WallRejection, create_wall)

__all__ = ["WALL_VERSION", "SCHEMA_PIN_VERSION", "SCHEMA_PIN_HASH",
           "UNRESOLVED_PREFIX", "QUERY_KINDS", "PROJECT_KINDS",
           "WallRejection", "GraphModelWall", "create_wall"]
