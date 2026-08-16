// ============================================================================
// P3 ai server — hub data access + typed refusals.
// Split out of ai/server.ts (SUB200 restructure). Behavior unchanged.
//
// Graph + provenance are fetched fresh per ask — a same-snapshot pair; the
// outlet's graph-data-stale gate refuses a torn read loudly.
// ============================================================================

import type { OutletGraph, OutletProvenance } from "../service.ts";

export class HubDown extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(detail);
    this.name = "HubDown";
    this.detail = detail;
  }
}

/** A typed HTTP refusal carrying its status + failure class. */
export class OutletHttpRefusal extends Error {
  readonly status: number;
  readonly failureClass: string;
  readonly detail: string;
  constructor(status: number, failureClass: string, detail: string) {
    super(`${failureClass}: ${detail}`);
    this.name = "OutletHttpRefusal";
    this.status = status;
    this.failureClass = failureClass;
    this.detail = detail;
  }
}

async function hubJson(hubFetch: typeof fetch, url: string): Promise<{ status: number; body: any }> {
  let resp: Response;
  try {
    resp = await hubFetch(url);
  } catch (e) {
    throw new HubDown(`GET ${url} failed at transport level: ${e instanceof Error ? e.message : String(e)}`);
  }
  let body: any = null;
  try { body = await resp.json(); } catch { body = null; }
  return { status: resp.status, body };
}

export interface HubSnapshot {
  graph: OutletGraph;
  provenance: OutletProvenance;
}

export async function fetchHubSnapshot(hubBase: string, hubFetch: typeof fetch): Promise<HubSnapshot> {
  // Round WC-W5: /graph + /query are still TWO hub round-trips, but they now
  // race CONCURRENTLY instead of serially. This reduces the torn window a POST
  // /analyze can land in, without eliminating it — a follow-up must add a
  // monotonic pipelineVersion/analysisSerial on the hub (server_analyze) so
  // fetchHubSnapshot can gate on it (class 'graph-data-stale' when the pair
  // straddles a mutation). That change crosses the ai/server → hub partition
  // and is deferred; noted in agentic-convos/remediation-round.md.
  const [g, q] = await Promise.all([
    hubJson(hubFetch, `${hubBase}/graph`),
    hubJson(hubFetch, `${hubBase}/query?kind=unused`),
  ]);
  if (g.status !== 200) {
    const fc = g.body?.failureClass ?? "hub-bad-response";
    throw new OutletHttpRefusal(503, fc, `hub /graph refused: ${g.body?.detail ?? `HTTP ${g.status}`}`);
  }
  let provenance: OutletProvenance;
  if (q.status === 200) {
    provenance = {
      roots: Array.isArray(q.body?.roots) ? q.body.roots : [],
      unused: Array.isArray(q.body?.unused) ? q.body.unused : [],
      source: "hub GET /query?kind=unused (graph-model wall query, verbatim)",
      generatedAt: new Date().toISOString(),
    };
  } else {
    // typed hub refusal (e.g. roots-undeclared) — the outlet then makes NO
    // reachability claim (honest no-claim path), and we say why.
    provenance = {
      source: `hub /query?kind=unused refused: ${q.body?.failureClass ?? `HTTP ${q.status}`} — no unused claim`,
    };
  }
  return { graph: g.body as OutletGraph, provenance };
}
