/**
 * P3 — analysisSource: the app's feeding tube from the hub's GET /analysis
 * (the OUTER WALL's programmatic face served over HTTP — OUTERWALL-CONTRACT).
 *
 * Contract shape (frozen before build; P3-outerwall lands the producer in
 * parallel — this module codes against the CONTRACT, and the vitest suite
 * mocks exactly this shape; the live-integration assertion is PENDING for the
 * acceptance runner, never faked green here):
 *
 *   GET /analysis -> {
 *     graph:       canonical envelope, outlines FILLED per ruling 8,
 *     verdicts:    nodeId -> { fill: {...}, outline: {status, worstOf}|null },
 *     provenance:  {...},
 *     gapAnalysis: { unused, unreferenced, cycles, reachability,
 *                    incompleteBases, blindSpots, soundnessNote }
 *   }
 *
 * Honesty rules enforced here:
 *  - "not yet computed" is PENDING, never green: a typed hub refusal
 *    (unknown-endpoint — hub without /analysis yet; no-graph-ingested;
 *    analysis-not-computed or whatever named class the outer wall serves) is
 *    surfaced as {status:"pending", failureClass, detail} — the graph pane
 *    then renders /graph as-is (null outlines -> "not-yet-computed" rings,
 *    T4/T5's own behavior, never overridden).
 *  - a 200 body that does not match the contract shape is a NAMED refusal
 *    (analysis-shape-mismatch), never a partial accept.
 *  - the overlay NEVER invents nodes and never drops ids: a verdict for a
 *    node absent from the served envelope means verdicts were minted from a
 *    DIFFERENT snapshot -> analysis-graph-mismatch (the V6 graph-data-stale
 *    semantics, applied at this seam). Only fill/outline change; ids and
 *    every other field cross byte-identical.
 */

import {
  GraphSourceError,
  type CanonicalEnvelope,
  type HttpGet,
} from "./graphSource";

/** Verdict entry per OUTERWALL-CONTRACT (projection of the analyzed graph). */
export interface AnalysisVerdict {
  fill: { status: string; source: string };
  outline: { status: string; worstOf: string[] } | null;
}

export interface AnalysisPayload {
  graph: CanonicalEnvelope;
  verdicts: Record<string, AnalysisVerdict>;
  provenance: Record<string, unknown>;
  gapAnalysis: Record<string, unknown>;
}

export type AnalysisFetch =
  | {
      status: "ok"; analysis: AnalysisPayload; url: string;
      /** the EXACT served bytes — the shell's Export writes these verbatim,
       *  never a re-serialization (app-shell round, additive) */
      bytes: Uint8Array;
    }
  | { status: "pending"; failureClass: string; detail: string; url: string };

const defaultHttpGet: HttpGet = async (url) => {
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new GraphSourceError("hub-unreachable",
      `GET ${url} failed at transport level: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { status: resp.status, bytes: new Uint8Array(await resp.arrayBuffer()) };
};

/** Typed hub refusals that mean "not computed YET" — pending, not an error.
 *  Anything else (transport failure, shape drift) throws typed. */
const PENDING_CLASSES = new Set([
  "unknown-endpoint",        // hub without /analysis (P3-outerwall not landed/live)
  "no-graph-ingested",
  "no-analysis-computed",    // the hub's own typed refusal before attach_analysis(...)
  "analysis-not-computed",   // contract-shape synonym, accepted defensively
  "analysis-pending",
]);

export async function fetchAnalysis(
  baseUrl: string,
  httpGet: HttpGet = defaultHttpGet,
): Promise<AnalysisFetch> {
  const url = `${baseUrl}/analysis`;
  let status: number;
  let bytes: Uint8Array;
  try {
    ({ status, bytes } = await httpGet(url));
  } catch (e) {
    if (e instanceof GraphSourceError) throw e;
    throw new GraphSourceError("hub-unreachable",
      `GET ${url} failed at transport level: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = new TextDecoder("utf-8").decode(bytes);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GraphSourceError("hub-bad-response",
      `GET ${url} returned unparseable JSON`, { url, byteLen: bytes.length });
  }
  const body = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;

  if (status !== 200) {
    const failureClass = typeof body.failureClass === "string" ? body.failureClass : "hub-bad-response";
    const detail = typeof body.detail === "string" ? body.detail : `HTTP ${status}`;
    if (PENDING_CLASSES.has(failureClass)) {
      return { status: "pending", failureClass, detail, url };
    }
    // any other refusal passes through VERBATIM as a typed error
    throw new GraphSourceError(failureClass, `GET ${url} -> HTTP ${status}: ${detail}`,
      { url, status, hubBody: body });
  }

  // ---- contract shape gate (named refusal, never a partial accept) ---------
  const graph = body.graph as CanonicalEnvelope | undefined;
  const shapeOk =
    typeof body.graph === "object" && body.graph !== null &&
    Array.isArray((body.graph as Record<string, unknown>).nodes) &&
    Array.isArray((body.graph as Record<string, unknown>).edges) &&
    typeof body.verdicts === "object" && body.verdicts !== null &&
    typeof body.gapAnalysis === "object" && body.gapAnalysis !== null;
  if (!shapeOk) {
    throw new GraphSourceError("analysis-shape-mismatch",
      `GET ${url}: 200 body does not match the OUTERWALL-CONTRACT analyze() shape ` +
      `{graph{nodes,edges,leads}, verdicts, provenance, gapAnalysis} — refused whole, never partially accepted`,
      { url, keys: Object.keys(body) });
  }
  return {
    status: "ok",
    url,
    bytes,
    analysis: {
      graph: graph as CanonicalEnvelope,
      verdicts: body.verdicts as Record<string, AnalysisVerdict>,
      provenance: (body.provenance ?? {}) as Record<string, unknown>,
      gapAnalysis: body.gapAnalysis as Record<string, unknown>,
    },
  };
}

export interface OverlayResult {
  envelope: CanonicalEnvelope;
  /** node ids whose fill/outline were replaced from the verdicts projection */
  applied: string[];
  /** served node ids the verdicts carried NO entry for (left untouched — the
   *  outer wall may legitimately verdict a subset; logged by the caller) */
  unverdicted: string[];
}

/**
 * Overlay /analysis verdicts onto the VERIFIED /graph envelope (the byte-gated
 * one from graphSource.fetchGraphVerified — the id sets have already survived
 * the serializer-edge-drop gate). Returns a NEW envelope; the input is never
 * mutated; ids and all non-verdict fields cross byte-identical.
 */
export function overlayVerdicts(
  envelope: CanonicalEnvelope,
  verdicts: Record<string, AnalysisVerdict>,
): OverlayResult {
  const served = new Set(envelope.nodes.map((n) => String(n.id)));
  const foreign = Object.keys(verdicts).filter((id) => !served.has(id));
  if (foreign.length > 0) {
    throw new GraphSourceError("analysis-graph-mismatch",
      `verdicts reference node ids absent from the served envelope: ${JSON.stringify(foreign)} — ` +
      `verdicts and graph must come from the same ingest (V6 graph-data-stale semantics at the view seam)`,
      { foreign });
  }
  const applied: string[] = [];
  const unverdicted: string[] = [];
  const nodes = envelope.nodes.map((n) => {
    const v = verdicts[String(n.id)];
    if (v === undefined) {
      unverdicted.push(String(n.id));
      return n;
    }
    applied.push(String(n.id));
    return { ...n, fill: v.fill, outline: v.outline };
  });
  return {
    envelope: { ...envelope, nodes },
    applied,
    unverdicted,
  };
}
