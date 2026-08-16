/**
 * graphSource fetch legs + the serializer-edge-drop gate (SUB200 split of
 * graphSource.ts — no behavior change): the generic envelope fetch (typed hub
 * refusals pass through VERBATIM), the /graph + /graph/truth legs, the
 * three-way id-set gate, and the byte-level id identity helpers. The pin
 * check + shapes live in graphSourceCore.ts; graphSource.ts stays the facade.
 */

import {
  assertEnvelopePin, decodeJson, GraphSourceError, idSetsOf,
  type FetchedEnvelope, type HttpGet, type IdSets,
} from "./graphSourceCore";

const defaultHttpGet: HttpGet = async (url) => {
  const f = (globalThis as { fetch?: (u: string) => Promise<{ status: number; arrayBuffer(): Promise<ArrayBuffer> }> }).fetch;
  if (f === undefined) {
    throw new GraphSourceError("hub-unreachable",
      `no fetch implementation available for ${url} — inject an HttpGet`);
  }
  let resp: { status: number; arrayBuffer(): Promise<ArrayBuffer> };
  try {
    resp = await f(url);
  } catch (e) {
    throw new GraphSourceError("hub-unreachable",
      `GET ${url} failed at transport level: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { status: resp.status, bytes: new Uint8Array(await resp.arrayBuffer()) };
};

// ── the generic fetch (typed hub refusals pass through VERBATIM) ─────────────

export async function fetchEnvelope(url: string, httpGet: HttpGet = defaultHttpGet): Promise<FetchedEnvelope> {
  let status: number;
  let bytes: Uint8Array;
  try {
    ({ status, bytes } = await httpGet(url));
  } catch (e) {
    // P3 (additive): an INJECTED transport that dies with a plain error is the
    // same named class the default transport raises — hub-unreachable — so the
    // face's banner always carries the class, never a bare stack message.
    if (e instanceof GraphSourceError) throw e;
    throw new GraphSourceError("hub-unreachable",
      `GET ${url} failed at transport level: ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = decodeJson(bytes, url);
  if (status !== 200) {
    const body = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
    const failureClass = typeof body.failureClass === "string" ? body.failureClass : "hub-bad-response";
    throw new GraphSourceError(failureClass,
      `GET ${url} -> HTTP ${status}: ${typeof body.detail === "string" ? body.detail : "(no detail)"}`,
      { url, status, hubBody: body });
  }
  const envelope = assertEnvelopePin(parsed, url);
  return {
    url, envelope, bytes,
    text: new TextDecoder("utf-8").decode(bytes),
    idSets: idSetsOf(envelope),
  };
}

export const fetchGraph = (baseUrl: string, httpGet: HttpGet = defaultHttpGet) =>
  fetchEnvelope(`${baseUrl}/graph`, httpGet);

export const fetchTruth = (baseUrl: string, httpGet: HttpGet = defaultHttpGet) =>
  fetchEnvelope(`${baseUrl}/graph/truth`, httpGet);

// ── the serializer-edge-drop gate ─────────────────────────────────────────────

export interface IdSetDivergence {
  key: "nodes" | "edges" | "leads";
  missing: string[]; // in truth, vanished from served — the classic drop
  extra: string[];   // in served, never in truth — an invented row
}

/** Compare served id sets against the model wall's pin-surface truth. Any
 *  divergence is the NAMED class serializer-edge-drop, listing exactly which
 *  ids vanished (missing) or were invented (extra) per list. */
export function verifyIdSets(served: IdSets, truth: IdSets): { ok: true; counts: Record<string, number> } {
  const divergences: IdSetDivergence[] = [];
  for (const key of ["nodes", "edges", "leads"] as const) {
    const servedSet = new Set(served[key]);
    const truthSet = new Set(truth[key]);
    const missing = truth[key].filter((id) => !servedSet.has(id));
    const extra = served[key].filter((id) => !truthSet.has(id));
    if (missing.length > 0 || extra.length > 0) divergences.push({ key, missing, extra });
  }
  if (divergences.length > 0) {
    const summary = divergences
      .map((d) => `${d.key}: missing=[${d.missing.join(",")}] extra=[${d.extra.join(",")}]`)
      .join("; ");
    throw new GraphSourceError("serializer-edge-drop",
      `served id sets diverge from the model wall's pin-surface truth — ${summary} — ` +
      `the cheap serializer (or a tampering proxy) dropped or invented rows`,
      { divergences });
  }
  return {
    ok: true,
    counts: { nodes: truth.nodes.length, edges: truth.edges.length, leads: truth.leads.length },
  };
}

/** Fetch /graph AND /graph/truth, run the id-set gate, and prove every truth id
 *  is byte-present in the served payload. The verified served envelope is what
 *  the caller hands to createGraphViewWall. */
export async function fetchGraphVerified(baseUrl: string, httpGet: HttpGet = defaultHttpGet): Promise<{
  served: FetchedEnvelope;
  truth: FetchedEnvelope;
  counts: Record<string, number>;
}> {
  const served = await fetchGraph(baseUrl, httpGet);
  const truth = await fetchTruth(baseUrl, httpGet);
  const { counts } = verifyIdSets(served.idSets, truth.idSets);
  for (const key of ["nodes", "edges", "leads"] as const) {
    for (const id of truth.idSets[key]) {
      if (idByteOffsets(served.bytes, id).length === 0) {
        throw new GraphSourceError("serializer-edge-drop",
          `${key} id ${id} exists in the model wall's pin-surface truth but its ` +
          `UTF-8 byte sequence ("id":"${id}") is absent from the served /graph payload`,
          { key, id });
      }
    }
  }
  return { served, truth, counts };
}

// ── byte-level id identity helpers (the Python->TS boundary proof) ───────────

const utf8 = new TextEncoder();

/** Byte offsets of the exact UTF-8 sequence `"id":"<id>"` inside raw payload
 *  bytes (canonical json: sorted keys, "," ":" separators — the sequence is
 *  literal). This is a BYTE scan of the served payload, not a string search
 *  over a re-decode. */
export function idByteOffsets(payload: Uint8Array, id: string): number[] {
  const needle = utf8.encode(`"id":"${id}"`);
  const offsets: number[] = [];
  outer: for (let i = 0; i + needle.length <= payload.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (payload[i + j] !== needle[j]) continue outer;
    }
    offsets.push(i);
  }
  return offsets;
}

/** True iff two id strings are identical AS UTF-8 BYTES (not just ===). */
export function utf8Identical(a: string, b: string): boolean {
  const ba = utf8.encode(a);
  const bb = utf8.encode(b);
  if (ba.length !== bb.length) return false;
  for (let i = 0; i < ba.length; i++) if (ba[i] !== bb[i]) return false;
  return true;
}
