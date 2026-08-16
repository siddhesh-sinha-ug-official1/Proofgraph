/**
 * graphSource core (SUB200 split of graphSource.ts — same round, no behavior
 * change): the carried schema pin, the typed error class, the canonical
 * envelope shapes + the pin check, and id-set extraction. The fetch legs and
 * the serializer-edge-drop gate live in graphSourceVerify.ts; graphSource.ts
 * stays the facade with the module's full doc + public surface.
 */

export const GRAPH_SOURCE_VERSION = "graph-source/1.0.0" as const;

/** The carried schema pin (WALL-CONVENTIONS rule 4 — literal copies). */
export const PINNED_SCHEMA_VERSION = "v0" as const;
export const PINNED_SCHEMA_HASH =
  "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c" as const;

/** Failure classes this module raises itself. Hub-side classes additionally
 *  pass through VERBATIM (no-graph-ingested, unknown-endpoint, …). */
export type GraphSourceFailureClass =
  | "hub-unreachable"            // transport-level: no response at all
  | "hub-bad-response"           // non-JSON / structurally unusable body
  | "envelope-rejected"          // served envelope has no schemaVersion
  | "envelope-version-mismatch"  // schemaVersion present but fails the pin
  | "serializer-edge-drop"       // served id sets != model-wall pin-surface truth
  | string;                      // hub typed classes, passed through verbatim

export class GraphSourceError extends Error {
  constructor(
    readonly failureClass: GraphSourceFailureClass,
    message: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(`failure-class=${failureClass}: ${message}`);
    this.name = "GraphSourceError";
  }
}

export interface CanonicalEnvelope {
  schemaVersion: string;
  nodes: Array<{ id: string } & Record<string, unknown>>;
  edges: Array<{ id: string } & Record<string, unknown>>;
  leads: Array<{ id: string } & Record<string, unknown>>;
}

export interface IdSets {
  nodes: string[];
  edges: string[];
  leads: string[];
}

export interface FetchedEnvelope {
  url: string;
  envelope: CanonicalEnvelope;
  /** The EXACT served bytes — byte-level assertions read these, not re-serializations. */
  bytes: Uint8Array;
  text: string;
  idSets: IdSets;
}

/** Minimal injectable transport (vitest passes a node:http one; browsers use fetch). */
export type HttpGet = (url: string) => Promise<{ status: number; bytes: Uint8Array }>;

// ── envelope parsing + the pin check ─────────────────────────────────────────

export function decodeJson(bytes: Uint8Array, url: string): unknown {
  const text = new TextDecoder("utf-8").decode(bytes);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new GraphSourceError("hub-bad-response",
      `GET ${url} returned unparseable JSON: ${e instanceof Error ? e.message : String(e)}`,
      { url, byteLen: bytes.length });
  }
}

/** Pin-check a parsed payload as a canonical envelope. Typed refusal, never a
 *  silent partial accept — mirrors assembly ruling 3 client-side. */
export function assertEnvelopePin(parsed: unknown, url = "(local)"): CanonicalEnvelope {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new GraphSourceError("hub-bad-response",
      `GET ${url}: payload is not a JSON object`, { url });
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.schemaVersion !== "string") {
    throw new GraphSourceError("envelope-rejected",
      `served envelope has no schemaVersion — the canonical envelope ` +
      `{schemaVersion:"${PINNED_SCHEMA_VERSION}",nodes,edges,leads} requires it (assembly ruling 3)`,
      { url });
  }
  if (obj.schemaVersion !== PINNED_SCHEMA_VERSION) {
    throw new GraphSourceError("envelope-version-mismatch",
      `served envelope schemaVersion ${JSON.stringify(obj.schemaVersion)} != pinned ` +
      `${JSON.stringify(PINNED_SCHEMA_VERSION)}`,
      { url, served: obj.schemaVersion, pinned: PINNED_SCHEMA_VERSION });
  }
  for (const key of ["nodes", "edges", "leads"] as const) {
    if (!Array.isArray(obj[key])) {
      throw new GraphSourceError("hub-bad-response",
        `served envelope ${key} is not an array`, { url, key });
    }
  }
  return obj as unknown as CanonicalEnvelope;
}

export function idSetsOf(envelope: CanonicalEnvelope): IdSets {
  const ids = (rows: Array<{ id?: unknown }>): string[] => rows.map((r) => String(r.id));
  return { nodes: ids(envelope.nodes), edges: ids(envelope.edges), leads: ids(envelope.leads) };
}
