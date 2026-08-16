"""proofgraph backend hub — pipeline (Phase 2 vasculature; assembly code, NOT a cell).

    run_pipeline(source_root, roots=None, capability_fn=None, ...)
        -> {"extractorWall", "modelWall", "envelope", "declaredRoots", "log"}

Connects two WALLS and nothing deeper (binding rule: vessels connect walls,
never cytoplasm):

    structure-extractor  wall.extract(root, capability_fn=...)   -> canonical envelope
    graph-model          wall.ingest(nodes, edges, leads, roots) -> verified graph

The capability seam stays a SOCKET: `capability_fn` is passed through to the
extractor wall's formalized V1 injection point and defaults to the cell's own
stub (python->CT, everything else->G).  V1's real adapter over Tree 2's
`capability_wall()` plugs into this same parameter later — the hub adds no
tier, no verdict, and no interpretation of its own.

Pathing (MERGED with V3): `proofgraph/vessels/pathing.py` (V3's shadowing-
guarded loader) is the primary wiring — `ensure_cell_on_path` + `load_wall`
+ `load_schema_module`, with the `sys-path-shadowing` seam guard and the
shared `proofgraph_wall_<cell>` module aliases (hub + vessels share ONE wall
module per cell per process).  A tiny local fallback remains ONLY for a
checkout where vessels/pathing.py is absent; whichever mechanism ran is
LOGGED on the hub log (`hub.pathing`), never silent.

The hub keeps its own append-only probe log (HubLog) with a fixed catalog —
the seed of the SYSTEM diagnostic surface aggregated by server.py under
/pins/*.  Uncatalogued emits raise, mirroring the cells' discipline.

SUB200 restructure: this module is now the FACADE over pipeline_log.py
(constants, HubError, HubLog), pipeline_paths.py (pathing merge + canonical
schema tools) and pipeline_run.py (wall loading, resolve_roots, run_pipeline).
Every public name is re-exported here — external importers are unchanged.
"""
from __future__ import annotations

# hub is import-flat by design (no __init__.py) — flat imports only.
from pipeline_log import (DEFAULT_LOG, HUB_DIR, HUB_PROBE_CATALOG,
                          HUB_VERSION, PACKAGES, PROOFGRAPH_ROOT,
                          SCHEMA_PIN_HASH, SCHEMA_PIN_VERSION,
                          VESSELS_DIR, HubError, HubLog)
from pipeline_paths import (_load_module, assert_schema_pin,
                            canonical_json_bytes, canonical_schema_tools,
                            ensure_paths, vessels_pathing)
from pipeline_run import (_NODE_ID_RE, load_wall_modules, resolve_roots,
                          run_pipeline)

__all__ = [
    "HUB_VERSION", "HUB_DIR", "PROOFGRAPH_ROOT", "PACKAGES", "VESSELS_DIR",
    "SCHEMA_PIN_VERSION", "SCHEMA_PIN_HASH", "HubError", "HUB_PROBE_CATALOG",
    "HubLog", "DEFAULT_LOG", "vessels_pathing", "ensure_paths",
    "canonical_schema_tools", "canonical_json_bytes", "assert_schema_pin",
    "load_wall_modules", "resolve_roots", "run_pipeline",
]
