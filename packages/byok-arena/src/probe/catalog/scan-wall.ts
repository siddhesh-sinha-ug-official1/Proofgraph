// Catalog section — §6.J secret-leak scan + the Phase-1 wall (assembly) leads.
// Assembled (in this exact order) by ../catalog.ts; element-for-element what
// it always was.

import type { CatalogEntry } from "../bus.ts";
import { e } from "./entry.ts";

export function leakScanEntries(): CatalogEntry[] {
  return [
    e("secret.leak.scan", "decision", "{scannedEvents,scannedLogs,scannedErrors,secretsSearched,rawKeyFound,leakSites}",
      "assert rawKeyFound===false — the plaintext key appears in NO non-redacted lead, log line, or error"),
    e("secret.leak.redactionShape", "value", "{shownForm:{present,last4,provider,keyLen}}",
      "proves only presence + last-4 is ever shown"),
    e("secret.leak.urlScan", "decision", "{keyInUrl,urlLeakSites,reason}",
      "proves no key leaked into a URL/query param (Gemini header, not ?key=)"),
  ];
}

// [assembly addition] wall.* leads for the cell's Phase-1 membrane decisions.
// Additive only: nothing above shrinks; the wall is promoted OVER the pins.
export function wallEntries(): CatalogEntry[] {
  return [
    e("wall.masterSecret.gate", "decision", "{accepted,reason,branchNotTaken}",
      "[assembly addition] the wall REQUIRES an injected masterSecret: the cell's dev default / empty / missing is refused with failure class insecure-master-secret (refusal throws before any cell exists, so only the accept branch can be probed — the refuse branch is a typed WallRefusal)"),
    e("wall.schemaAbsence.gate", "decision", "{schemaAbsent,nodeEdgeKindEntries,schemaLeads,reason}",
      "[assembly addition] this cell is schema-absent BY DESIGN — instead of a schema PIN assert, the wall asserts at construction that the absence HOLDS (no node/edge probe kinds, no schema.* leads); violation = failure class schema-absence-violated"),
    e("wall.construct", "decision", "{wallVersion,masterSecretAccepted,schemaAbsent,catalogSize}",
      "[assembly addition] the wall stood up: version, both construction gates passed, catalog size at construction"),
    e("wall.call", "call", "{method,provider}",
      "[assembly addition] one wall-face invocation (validateKey|chat|submitToolResults|estimateCost) delegating inward to the cell's own machinery"),
    e("wall.reject", "branch", "{failureClass,method,provider,reason}",
      "[assembly addition] a wall rejection with its named failure class (e.g. unknown-provider); adapter-level failures keep the cell's own AdapterErrorKind taxonomy and are NOT remapped here"),
  ];
}
