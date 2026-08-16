"""Wall schema-PIN assertion (wall convention rule 4).

Split from wall.py via wall_support.py (SUB200 restructure); wall.py stays the
promoted face.  Lives inside the extractor package so vessel pathing's
top-package shadowing guarantees cover it.

D-dedup U3 (round-2026-08-16): the recompute step now delegates to
packages/schema/schema_tools.schema_hash via file-read+exec (the same
data-only pattern the membrane test uses in selftest/schema_sync_common.py),
so the canonical serialization spec (sort_keys / compact / ensure_ascii=False)
is not re-implemented by hand inside this wall.  The extractor's import
boundary (extractor/boundary.py) remains unchanged — the canonical package is
still consumed AS DATA, never imported.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from extractor import schema as cell_schema
from extractor.wall_support import WallSchemaPinMismatch

_STAGE = "WALL"
# The canonical schema package is a sibling CELL of this one inside the
# assembly (packages/schema); the membrane test already requires it, so the
# wall may too — resolved relative to THIS file, never to the cwd.
# parents[2] = packages/ (this file is packages/structure-extractor/extractor/).
_SCHEMA_PKG = Path(__file__).resolve().parents[2] / "schema"


class _IdsShim:
    """Minimal sys.modules entry so canonical schema_tools' flat-import
    fallback (`from ids import sha256_hex`) resolves without a sys.path edit
    (matches selftest/schema_sync_common's load ordering, but scoped)."""


def _exec_canonical(relpath: str, shims: dict | None = None) -> dict:
    """File-read+exec a canonical packages/schema/* module into a fresh
    namespace, temporarily registering shims under given sys.modules names."""
    path = _SCHEMA_PKG / relpath
    ns: dict = {"__name__": Path(relpath).stem, "__file__": str(path)}
    inserted: list[str] = []
    try:
        for name, attrs in (shims or {}).items():
            if name not in sys.modules:
                mod = _IdsShim()
                for key, value in attrs.items():
                    setattr(mod, key, value)
                sys.modules[name] = mod
                inserted.append(name)
        exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), ns)
    finally:
        for name in inserted:
            del sys.modules[name]
    return ns


def _canonical_schema_hash(schema_obj: dict) -> str:
    """Delegate to packages/schema/schema_tools.schema_hash (canonical JSON
    serialization + sha256).  D-dedup U3 replaces the previous hand-inline of
    json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False)."""
    ids_ns = _exec_canonical("ids.py")
    tools_ns = _exec_canonical(
        "schema_tools.py",
        shims={"ids": {"sha256_hex": ids_ns["sha256_hex"]}})
    return tools_ns["schema_hash"](schema_obj)


def assert_schema_pin(bus) -> None:
    """Three-way agreement or loud refusal: the cell mirror's pinned pair,
    the canonical PIN file, and the RECOMPUTED canonical schema.json hash
    (canonical JSON: sort_keys, compact separators, ensure_ascii=False —
    delegated to packages/schema/schema_tools.schema_hash via file-exec, so
    this wall shares ONE spelling with the canonical package).  The pinned
    pair is read from the cell schema module AT CALL TIME (test seam: drift
    injected after birth still refuses)."""
    pinned_version = cell_schema.PINNED_SCHEMA_VERSION
    pinned_hash = cell_schema.PINNED_SCHEMA_HASH
    canonical_version = canonical_hash = None
    ok, detail = False, ""
    try:
        fields: dict[str, str] = {}
        for line in (_SCHEMA_PKG / "PIN").read_text(encoding="utf-8").splitlines():
            if line.strip():
                key, value = line.split(None, 1)
                fields[key] = value.strip()
        canonical_version = fields["schemaVersion"]
        canonical_hash = fields["schemaHash"]
        schema_obj = json.loads(
            (_SCHEMA_PKG / "schema.json").read_text(encoding="utf-8"))
        recomputed = _canonical_schema_hash(schema_obj)
        ok = (pinned_version == canonical_version == schema_obj["schemaVersion"]
              and pinned_hash == canonical_hash == recomputed)
        if not ok:
            detail = (
                f"schema drift: cell pin ({pinned_version}, {pinned_hash[:12]}…) vs "
                f"canonical PIN ({canonical_version}, {str(canonical_hash)[:12]}…) vs "
                f"recomputed schema.json hash ({recomputed[:12]}…) disagree — "
                f"the wall refuses to stand on a drifted schema")
    except (OSError, KeyError, ValueError, SyntaxError) as exc:
        detail = (f"canonical schema package unverifiable at {_SCHEMA_PKG}: "
                  f"{type(exc).__name__}: {exc} — an unverifiable pin is drift")
    bus.emit("extractor.wall.pin.check", _STAGE, "decision", {
        "pinnedVersion": pinned_version, "pinnedHash": pinned_hash,
        "canonicalVersion": canonical_version, "canonicalHash": canonical_hash,
        "ok": ok})
    if not ok:
        err = WallSchemaPinMismatch(detail)
        bus.emit("extractor.wall.refusal", _STAGE, "error",
                 {"failureClass": err.failure_class, "detail": str(err)})
        raise err
