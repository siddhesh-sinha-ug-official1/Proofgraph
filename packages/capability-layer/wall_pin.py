# wall.py section 2 of 3 — the schema-PIN assertion (canonical package
# consumed AS DATA: file-read + exec, the test_13_schema_sync pattern).
# NOT an importable module: exec'd by wall.py into its namespace.
# (Comment header, not a docstring — see wall_refusals.py.)

from __future__ import annotations

# ---------------------------------------------------------------------------
# Schema PIN assertion (canonical package consumed AS DATA — file-read + exec,
# the same pattern as tests/test_13_schema_sync.py; no import-gate churn).
# ---------------------------------------------------------------------------

class _ModuleShim:
    """Minimal sys.modules entry so schema_tools.py's flat-import fallback
    (`from ids import sha256_hex`) resolves without sys.path edits."""


def _exec_canonical(relpath: str, shims: dict | None = None) -> dict:
    path = _SCHEMA_PKG / relpath
    ns = {"__name__": Path(relpath).stem, "__file__": str(path)}
    inserted = []
    try:
        for name, attrs in (shims or {}).items():
            if name not in sys.modules:
                mod = _ModuleShim()
                for key, value in attrs.items():
                    setattr(mod, key, value)
                sys.modules[name] = mod
                inserted.append(name)
        source = path.read_text(encoding="utf-8")
        exec(compile(source, str(path), "exec"), ns)
    finally:
        for name in inserted:
            del sys.modules[name]
    return ns


def _check_schema_pin(pinned_version: str = PINNED_SCHEMA_VERSION,
                      pinned_hash: str = PINNED_SCHEMA_HASH) -> dict:
    """Assert the schema PIN.  Returns {schemaVersion, schemaHash} on success;
    raises WallRefusal(schema-pin-mismatch) on ANY drift — a wall refuses to
    stand on a drifted schema."""
    try:
        pin_text = (_SCHEMA_PKG / "PIN").read_text(encoding="utf-8")
        schema_obj = json.loads(
            (_SCHEMA_PKG / "schema.json").read_text(encoding="utf-8"))
        ids_ns = _exec_canonical("ids.py")
        tools = _exec_canonical(
            "schema_tools.py",
            shims={"ids": {"sha256_hex": ids_ns["sha256_hex"]}})
    except (OSError, ValueError, KeyError, SyntaxError) as e:
        _emit_refusal("schema-pin-mismatch", "<schema>",
                      f"canonical schema package unreadable at {_SCHEMA_PKG}: {e!r}")
        raise WallRefusal(
            "schema-pin-mismatch",
            f"canonical schema package unreadable at {_SCHEMA_PKG}: {e!r}")

    fields = {}
    for line in pin_text.splitlines():
        if line.strip():
            key, value = line.split(None, 1)
            fields[key] = value.strip()
    pin_file = (fields.get("schemaVersion"), fields.get("schemaHash"))
    if pin_file != (pinned_version, pinned_hash):
        _emit_refusal("schema-pin-mismatch", "<schema>",
                      f"PIN file {pin_file} != wall pin "
                      f"({pinned_version}, {pinned_hash[:12]}…)")
        raise WallRefusal(
            "schema-pin-mismatch",
            f"PIN file carries {pin_file}, wall is pinned to "
            f"({pinned_version!r}, {pinned_hash[:12]}…)")

    actual_hash = tools["schema_hash"](schema_obj)
    try:
        tools["check_pin"](pinned_version, pinned_hash,
                           schema_obj["schemaVersion"], actual_hash)
    except tools["SchemaPinMismatch"] as e:
        _emit_refusal("schema-pin-mismatch", "<schema>", str(e))
        raise WallRefusal("schema-pin-mismatch", str(e))
    return {"schemaVersion": pinned_version, "schemaHash": pinned_hash}
