/**
 * V4 vessel — graphSource: the app's feeding tube from the hub's /graph endpoint
 * to the graph-view wall (assembly code; connects WALLS, never cytoplasm).
 *
 * What it does — and refuses, by name:
 *  - fetches the hub-served canonical envelope (`GET /graph`) as EXACT BYTES,
 *    parses it, and PIN-CHECKS `schemaVersion` against the carried pin
 *    (envelope-rejected when absent, envelope-version-mismatch when drifted);
 *  - fetches the model wall's PIN-SURFACE truth (`GET /graph/truth` — rebuilt
 *    hub-side from `modelWall.pins.dump()["wall"]["ingested"]`, serialized via
 *    the canonical serializer DIRECTLY, bypassing the /graph serializer seam);
 *  - three-way-verifies id sets (nodes/edges/leads) between the two legs and
 *    names any divergence serializer-edge-drop, LISTING the vanished/invented
 *    ids — the cheap serializer (or a tampering proxy) is caught loudly, never
 *    rendered silently;
 *  - passes hub-side typed refusals through VERBATIM ({failureClass, detail}
 *    bodies: no-graph-ingested, unknown-endpoint, hub-bad-request, …) — a
 *    refusal is never repackaged as an empty graph;
 *  - proves byte-level id identity across the Python->TS boundary: every id is
 *    located as a UTF-8 byte sequence (`"id":"…"`) inside the raw served
 *    payload, not merely as a parsed JS string.
 *
 * The graph-view wall re-checks the pin itself at ingest (defense in depth):
 * this module failing FIRST never replaces the wall's own refusal — the test
 * asserts BOTH membranes refuse, each with its own named class.
 *
 * SUB200 restructure: this module is now the FACADE over graphSourceCore.ts
 * (pin, error class, shapes, pin check) + graphSourceVerify.ts (fetch legs,
 * id-set gate, byte helpers). Public surface unchanged.
 */

export {
  GRAPH_SOURCE_VERSION, PINNED_SCHEMA_HASH, PINNED_SCHEMA_VERSION,
  GraphSourceError, assertEnvelopePin, idSetsOf,
  type CanonicalEnvelope, type FetchedEnvelope, type GraphSourceFailureClass,
  type HttpGet, type IdSets,
} from "./graphSourceCore";

export {
  fetchEnvelope, fetchGraph, fetchGraphVerified, fetchTruth,
  idByteOffsets, utf8Identical, verifyIdSets,
  type IdSetDivergence,
} from "./graphSourceVerify";
