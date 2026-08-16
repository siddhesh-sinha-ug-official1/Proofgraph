/**
 * ASSEMBLY Phase 1 (wall) — verified-in-sync copy of the canonical schema PIN
 * module, packages/schema/gen/pin.ts (swap pattern (b), same reasoning as
 * ./schema.ts: this cell's tsconfig rootDir "." blocks a direct cross-package
 * import, and the wall must assert the PIN synchronously at construction in
 * BOTH tiers — headless Node and the browser, where no file I/O exists).
 *
 * "One schema" is preserved the same way as for schema.ts: the wall
 * conformance test (test/22-wall-conformance.test.ts) imports the REAL
 * packages/schema/gen/pin.ts at runtime, asserts constant-for-constant and
 * behavior-for-behavior equality with this copy, AND recomputes the canonical
 * hash of packages/schema/schema.json via canonicalJson + node:crypto. Any
 * drift explodes there loudly (failure-class=schema-pin-mismatch).
 */

export const PINNED_SCHEMA_VERSION = "v0" as const;
export const PINNED_SCHEMA_REVISION = "v0.1" as const;
export const PINNED_SCHEMA_HASH = "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c" as const;

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
