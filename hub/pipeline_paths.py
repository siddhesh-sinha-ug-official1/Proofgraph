"""hub/pipeline_paths.py — pathing (merged with V3) + canonical schema tools.

SUB200 restructure: split out of hub/pipeline.py (which remains the facade
and re-exports every name here).  Behavior unchanged.

Pathing (MERGED with V3): `proofgraph/vessels/pathing.py` (V3's shadowing-
guarded loader) is the primary wiring — `ensure_cell_on_path` + `load_wall`
+ `load_schema_module`, with the `sys-path-shadowing` seam guard and the
shared `proofgraph_wall_<cell>` module aliases (hub + vessels share ONE wall
module per cell per process).  A tiny local fallback remains ONLY for a
checkout where vessels/pathing.py is absent; whichever mechanism ran is
LOGGED on the hub log (`hub.pathing`), never silent.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

# hub is import-flat by design (no __init__.py) — flat imports only.
from pipeline_log import (DEFAULT_LOG, PACKAGES, SCHEMA_PIN_HASH,
                          SCHEMA_PIN_VERSION, VESSELS_DIR, HubError,
                          HubLog)

_PYTHON_CELLS = ("structure-extractor", "graph-model", "capability-layer")

#: local fallback table, mirrors pathing.CELL_TOP_PACKAGES (used ONLY when
#: vessels/pathing.py is absent from the checkout).
_CELL_ROOTS = tuple(PACKAGES / c for c in _PYTHON_CELLS)

_pathing_used: str | None = None
_pathing_mod = None


def _load_module(name: str, path: Path):
    cached = sys.modules.get(name)
    if cached is not None:
        return cached
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise HubError("hub-bad-request", f"cannot load module at {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    try:
        spec.loader.exec_module(mod)
    except BaseException:
        sys.modules.pop(name, None)
        raise
    return mod


def vessels_pathing():
    """V3's vessels/pathing.py (shadowing-guarded), or None if absent."""
    global _pathing_mod
    if _pathing_mod is None:
        vp = VESSELS_DIR / "pathing.py"
        if vp.exists():
            _pathing_mod = _load_module("proofgraph_vessels_pathing", vp)
    return _pathing_mod


def _local_pathing() -> list[str]:
    inserted = []
    for root in _CELL_ROOTS:
        s = str(root)
        if s not in sys.path:
            sys.path.insert(0, s)
            inserted.append(s)
    return inserted


def ensure_paths(log: HubLog | None = None) -> str:
    """Idempotent.  Primary: V3's pathing.ensure_cell_on_path (with its
    sys-path-shadowing guard).  Fallback (pathing.py absent): plain local
    inserts.  Whichever ran is logged — never silent."""
    global _pathing_used
    if _pathing_used is not None:
        return _pathing_used
    pathing = vessels_pathing()
    if pathing is not None:
        for cell in _PYTHON_CELLS:
            pathing.ensure_cell_on_path(cell)   # SysPathShadowingError = loud
        used = "vessels/pathing.py::ensure_cell_on_path (V3, merged)"
        inserted = [str(pathing.cell_root(c)) for c in _PYTHON_CELLS]
    else:
        inserted = _local_pathing()
        used = "hub-local fallback (vessels/pathing.py absent)"
    _pathing_used = used
    (log or DEFAULT_LOG).emit("hub.pathing", {
        "used": used, "roots": inserted,
        "mergePoint": "hub/pipeline.py::ensure_paths — MERGED with V3"})
    return used


# ---------------------------------------------------------------------------
# Canonical schema tools (loaded from packages/schema BY FILE — the flat name
# `schema` is never put on sys.path, avoiding collisions with cell-local dirs)
# ---------------------------------------------------------------------------

_schema_tools = None


def canonical_schema_tools():
    """packages/schema/schema_tools.py, loaded once, honestly (no mirror).
    Uses V3's load_schema_module aliases when pathing.py is present, so hub
    and vessels share ONE canonical module per process.  schema_tools' flat
    `from ids import …` fallback is satisfied by a scoped sys.modules alias
    (never a bare path insert)."""
    global _schema_tools
    if _schema_tools is None:
        pathing = vessels_pathing()
        if pathing is not None:
            ids_mod = pathing.load_schema_module("ids")
            alias = "proofgraph_schema_schema_tools"
        else:
            ids_mod = _load_module("proofgraph_schema_ids",
                                   PACKAGES / "schema" / "ids.py")
            alias = "proofgraph_schema_schema_tools"
        prev = sys.modules.get("ids")
        sys.modules["ids"] = ids_mod   # satisfy schema_tools' flat-import fallback
        try:
            _schema_tools = _load_module(alias,
                                         PACKAGES / "schema" / "schema_tools.py")
        finally:
            if prev is None:
                sys.modules.pop("ids", None)
            else:
                sys.modules["ids"] = prev
    return _schema_tools


def canonical_json_bytes(obj) -> bytes:
    """THE canonical serialization (packages/schema/schema_tools.canonical_json),
    utf-8 encoded.  /graph serves exactly these bytes."""
    return canonical_schema_tools().canonical_json(obj).encode("utf-8")


def assert_schema_pin(log: HubLog | None = None) -> dict:
    """The hub refuses to stand on a drifted schema, same as every wall:
    canonical PIN file vs recomputed schema.json hash vs the hard-coded pin."""
    st = canonical_schema_tools()
    log = log or DEFAULT_LOG
    ok, detail = False, ""
    pin_version = pin_hash = None
    try:
        fields: dict[str, str] = {}
        for line in (PACKAGES / "schema" / "PIN").read_text(encoding="utf-8").splitlines():
            if line.strip():
                key, value = line.split(None, 1)
                fields[key] = value.strip()
        pin_version, pin_hash = fields["schemaVersion"], fields["schemaHash"]
        schema_obj = json.loads(
            (PACKAGES / "schema" / "schema.json").read_text(encoding="utf-8"))
        recomputed = st.schema_hash(schema_obj)
        ok = (pin_version == SCHEMA_PIN_VERSION == schema_obj["schemaVersion"]
              and pin_hash == SCHEMA_PIN_HASH == recomputed)
        if not ok:
            detail = (f"schema drift: hub pin ({SCHEMA_PIN_VERSION},"
                      f" {SCHEMA_PIN_HASH[:12]}…) vs canonical PIN ({pin_version},"
                      f" {str(pin_hash)[:12]}…) vs recomputed ({recomputed[:12]}…)")
    except (OSError, KeyError, ValueError) as exc:
        detail = (f"canonical schema package unverifiable: "
                  f"{type(exc).__name__}: {exc} — an unverifiable pin is drift")
    log.emit("hub.schema.pin", {"schemaVersion": SCHEMA_PIN_VERSION,
                                "schemaHash": SCHEMA_PIN_HASH, "ok": ok,
                                "detail": detail})
    if not ok:
        raise HubError("schema-pin-mismatch", detail)
    return {"schemaVersion": SCHEMA_PIN_VERSION, "schemaHash": SCHEMA_PIN_HASH}
