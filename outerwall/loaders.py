"""loaders.py — canonical schema artifact loaders + assembly path helpers.

SUB200 restructure: split out of outerwall/__init__.py (which stays the
facade re-exporting schema_constants / validate_graph / json_scrub /
ensure_assembly_paths — importers see no change).  Behavior identical:
file-loaded namespaces (the V1/wall pattern — never a bare import of a
flat module name), memoized module-globally exactly as before.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from .wallconst import HUB_DIR, PACKAGES, VESSELS_DIR


def _exec_file(path: Path, name: str) -> dict:
    ns = {"__name__": name, "__file__": str(path)}
    exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), ns)
    return ns


_constants_ns = None
_validate_ns = None
_schema_obj = None


def schema_constants() -> dict:
    """packages/schema/gen/schema_constants.py as a namespace dict."""
    global _constants_ns
    if _constants_ns is None:
        _constants_ns = _exec_file(
            PACKAGES / "schema" / "gen" / "schema_constants.py",
            "outerwall_schema_constants")
    return _constants_ns


def validate_graph(graph_obj):
    """packages/schema/validate.py::validate_graph against the canonical
    schema.json — returns (conforms, errors)."""
    global _validate_ns, _schema_obj
    if _validate_ns is None:
        _validate_ns = _exec_file(PACKAGES / "schema" / "validate.py",
                                  "outerwall_schema_validate")
    if _schema_obj is None:
        _schema_obj = json.loads(
            (PACKAGES / "schema" / "schema.json").read_text(encoding="utf-8"))
    return _validate_ns["validate_graph"](graph_obj, _schema_obj)


def ensure_assembly_paths() -> None:
    """vessels/ (pathing + V1 vessel) and hub/ (pipeline/server, hub's own
    flat-import convention) importable — idempotent."""
    for p in (VESSELS_DIR, HUB_DIR):
        if str(p) not in sys.path:
            sys.path.insert(0, str(p))


def json_scrub(obj):
    """Force an object to pure JSON types (Paths and friends textualized via
    default=str — the hub's documented bound, never dropped)."""
    return json.loads(json.dumps(obj, default=str))
