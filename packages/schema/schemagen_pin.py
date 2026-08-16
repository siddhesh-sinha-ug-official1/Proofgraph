"""Generators for gen/pin.ts and the PIN file — the pinned schema identity.

Template + generators moved verbatim from schemagen.py (SUB200 restructure);
schemagen.py remains the facade and the CLI.
"""
try:
    from .schema_tools import schema_hash
    from .schemagen_common import _fill
except ImportError:  # imported flat (packages/schema on sys.path)
    from schema_tools import schema_hash
    from schemagen_common import _fill


# ── gen/pin.ts + PIN ─────────────────────────────────────────────────────────

_PIN_TS = '''// GENERATED from schema.json by schemagen.py. Do not edit by hand.
// The pinned identity of the canonical schema.  Consumers assert it at
// startup; failure-class=schema-pin-mismatch must fail fast, never silently
// accept drift.  Mirrors the PIN file (Python side: pin.py::assert_pin).
export const PINNED_SCHEMA_VERSION = "@VERSION@" as const;
export const PINNED_SCHEMA_REVISION = "@REVISION@" as const;
export const PINNED_SCHEMA_HASH = "@HASH@" as const;

/**
 * Deterministic canonical serialization — byte-identical to Python's
 * json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
 * for JSON-representable values (no undefined, no non-finite numbers).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((v) => canonicalJson(v)).join(",") + "]";
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(rec[k])).join(",") + "}";
}

/** Fail fast on any drift from the pinned (schemaVersion, schemaHash) pair. */
export function checkPin(actualVersion: string, actualHash: string): void {
  if (actualVersion !== PINNED_SCHEMA_VERSION) {
    throw new Error(
      "failure-class=schema-pin-mismatch: pinned schemaVersion " + JSON.stringify(PINNED_SCHEMA_VERSION) +
      " != actual " + JSON.stringify(actualVersion),
    );
  }
  if (actualHash !== PINNED_SCHEMA_HASH) {
    throw new Error(
      "failure-class=schema-pin-mismatch: pinned schemaHash " + PINNED_SCHEMA_HASH.slice(0, 12) +
      "… != actual " + actualHash.slice(0, 12) +
      "… (same version tag with different content is ALSO drift — the version should have been bumped)",
    );
  }
}
'''


def generate_pin_ts(schema_obj):
    return _fill(_PIN_TS, {
        "VERSION": schema_obj["schemaVersion"],
        "REVISION": schema_obj["schemaRevision"],
        "HASH": schema_hash(schema_obj),
    })


def generate_pin(schema_obj):
    return (f"schemaVersion {schema_obj['schemaVersion']}\n"
            f"schemaHash {schema_hash(schema_obj)}\n")
