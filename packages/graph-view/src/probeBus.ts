/**
 * The uniform probe bus (Probe Density Contract §1).
 * Built FIRST — every stage emits through it and every self-test asserts on it.
 *
 * Ordering is logicalClock ONLY. wallNanos is a separate field, never used for
 * ordering or assertions (§6.1). causeId chains each event to the event that
 * produced it: emit() returns "probeId#clock" usable as the next causeId.
 */

export type ProbeKind =
  | "input" | "output" | "value" | "decision" | "branch"
  | "edge" | "node" | "state" | "call" | "timing" | "error";

export interface ProbeEvent {
  probeId: string;
  cellId: string;
  stage: string;
  kind: ProbeKind;
  payload: unknown;
  logicalClock: number;
  causeId: string | null;
  wallNanos: number | null;
}

export interface ProbeFilter {
  probeId?: string;
  kind?: ProbeKind;
  stage?: string;
  causeId?: string;
  probeIdPrefix?: string;
}

function nowNanos(): number | null {
  try {
    // Node
    const p = (globalThis as { process?: { hrtime?: { bigint?: () => bigint } } }).process;
    if (p?.hrtime?.bigint) return Number(p.hrtime.bigint());
  } catch { /* fall through */ }
  try {
    if (typeof performance !== "undefined") return Math.round(performance.now() * 1e6);
  } catch { /* fall through */ }
  return null;
}

export class ProbeBus {
  private clock = 0;
  private stream: ProbeEvent[] = [];
  private taps = new Map<string, ((e: ProbeEvent) => void)[]>();
  /** probeIds emitted at runtime that the catalog does not know — a build-failing bug (contract §3). */
  readonly uncataloged: string[] = [];
  readonly cellId = "tree5.graph-view";

  constructor(private knownProbeIds: ReadonlySet<string> | null = null) {}

  emit(p: { probeId: string; stage: string; kind: ProbeKind; payload: unknown; causeId?: string | null }): string {
    if (this.knownProbeIds && !this.knownProbeIds.has(p.probeId)) {
      // Never silently drop — record the violation AND still deliver the event.
      this.uncataloged.push(p.probeId);
    }
    // Snapshot the payload AT EMISSION TIME. Probes hold values, not live references:
    // elkjs mutates its input graph in place (internal $H counters, coordinates), and a
    // live reference would let later stages rewrite probe history — the determinism gate
    // caught exactly this. Non-cloneable payloads fall back to the reference (none in
    // this cell's catalog).
    let payload = p.payload;
    try {
      payload = structuredClone(p.payload);
    } catch { /* keep the reference */ }
    const e: ProbeEvent = {
      probeId: p.probeId,
      cellId: this.cellId,
      stage: p.stage,
      kind: p.kind,
      payload,
      logicalClock: this.clock++,
      causeId: p.causeId ?? null,
      wallNanos: nowNanos(),
    };
    this.stream.push(e);
    (this.taps.get(p.probeId) ?? []).forEach((fn) => fn(e));
    return `${e.probeId}#${e.logicalClock}`; // usable as a causeId for the next event
  }

  /** The ordered probe stream for the last run (ordered by logicalClock). */
  history(): ProbeEvent[] {
    return this.stream.slice();
  }

  /** Typed + queryable (contract §8): filter by probeId / kind / stage / cause. */
  filter(f: ProbeFilter): ProbeEvent[] {
    return this.stream.filter(
      (e) =>
        (f.probeId === undefined || e.probeId === f.probeId) &&
        (f.probeIdPrefix === undefined || e.probeId.startsWith(f.probeIdPrefix)) &&
        (f.kind === undefined || e.kind === f.kind) &&
        (f.stage === undefined || e.stage === f.stage) &&
        (f.causeId === undefined || e.causeId === f.causeId),
    );
  }

  /** Convenience: the single most recent event for a probeId (asserting helpers). */
  last(probeId: string): ProbeEvent | undefined {
    for (let i = this.stream.length - 1; i >= 0; i--) {
      if (this.stream[i].probeId === probeId) return this.stream[i];
    }
    return undefined;
  }

  /** Subscribe to one live lead. Returns an unsubscribe function. */
  tap(probeId: string, fn: (e: ProbeEvent) => void): () => void {
    const arr = this.taps.get(probeId) ?? [];
    arr.push(fn);
    this.taps.set(probeId, arr);
    return () => this.taps.set(probeId, (this.taps.get(probeId) ?? []).filter((f) => f !== fn));
  }
}
