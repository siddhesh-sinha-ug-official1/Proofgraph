"""Schema identity: canonical JSON, schemaHash, and the consumer pin check."""
import json

from .ids import sha256_hex


class SchemaPinMismatch(Exception):
    """failure-class=schema-pin-mismatch: a consumer pinned to an old
    schemaVersion/schemaHash must fail fast, not silently accept drift."""


def canonical_json(obj):
    """Deterministic canonical serialization used for schemaHash."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def schema_hash(schema_obj):
    return sha256_hex(canonical_json(schema_obj))


def node_kinds_of(schema_obj):
    return list(schema_obj["$defs"]["Node"]["properties"]["kind"]["enum"])


def edge_kinds_of(schema_obj):
    return list(schema_obj["$defs"]["Edge"]["properties"]["kind"]["enum"])


def check_pin(pinned_version, pinned_hash, actual_version, actual_hash):
    """A consumer pinned to (schemaVersion, schemaHash) fails fast on any drift."""
    if pinned_version != actual_version:
        raise SchemaPinMismatch(
            f"failure-class=schema-pin-mismatch: pinned schemaVersion {pinned_version!r} "
            f"!= actual {actual_version!r}")
    if pinned_hash != actual_hash:
        raise SchemaPinMismatch(
            f"failure-class=schema-pin-mismatch: pinned schemaHash {pinned_hash[:12]}… "
            f"!= actual {actual_hash[:12]}… (same version tag with different content "
            f"is ALSO drift — the version should have been bumped)")
