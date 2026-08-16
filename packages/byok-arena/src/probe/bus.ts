// ============================================================================
// Uniform probe bus — §3 Probe Density Contract.
// Every event: typed, catalogued, causally chained, deterministically ordered
// by logicalClock. wallNanos is a SEPARATE field, never used for ordering.
// A lead that exists but isn't in the catalog is a bug — emit() enforces it.
// ============================================================================

export type ProbeKind =
  | "input" | "output" | "value" | "decision" | "branch"
  | "edge" | "node" | "state" | "call" | "timing" | "error";

export interface ProbeEvent {
  probeId: string;        // stable, enumerable id for this lead
  cellId: string;         // always "ai.outlet" for this cell
  stage: string;          // which internal stage emitted it
  kind: ProbeKind;
  payload: unknown;       // the actual value (redacted only for secrets)
  logicalClock: number;   // monotonic per-cell counter — deterministic causal ordering
  causeId: string | null; // "probeId#clock" of the causing event
  wallNanos: number | null; // real time, SEPARATE field, never used for ordering
}

export interface CatalogEntry {
  probeId: string;
  kind: ProbeKind;
  payloadType: string;
  description: string;
}

export class ProbeBus {
  readonly cellId: string;
  private events: ProbeEvent[];
  private clock: number;
  private taps: Map<string, Set<(e: ProbeEvent) => void>>;
  private catalog: Map<string, CatalogEntry>;
  private logs: string[];
  private errors: { message: string; stack?: string }[];
  private nanoClock: () => bigint;

  constructor(catalog: CatalogEntry[], nanoClock?: () => bigint) {
    this.cellId = "ai.outlet";
    this.events = [];
    this.clock = 0;
    this.taps = new Map();
    this.logs = [];
    this.errors = [];
    this.catalog = new Map();
    for (const entry of catalog) {
      if (this.catalog.has(entry.probeId)) {
        throw new Error(`duplicate catalog probeId: ${entry.probeId}`);
      }
      this.catalog.set(entry.probeId, entry);
    }
    this.nanoClock = nanoClock ?? (() => process.hrtime.bigint());
  }

  /** Current wall time in nanos (injectable for deterministic tests). */
  nowNanos(): bigint {
    return this.nanoClock();
  }

  /**
   * Emit one probe event. Throws if the probeId is not catalogued or the kind
   * disagrees with the catalog — "a lead that exists but isn't in the catalog
   * is a bug" is enforced at runtime, not just asserted in tests.
   */
  emit(probeId: string, stage: string, kind: ProbeKind, payload: unknown, causeId: string | null = null): ProbeEvent {
    const entry = this.catalog.get(probeId);
    if (!entry) {
      throw new Error(`probe not in catalog (a lead that exists but isn't catalogued is a bug): ${probeId}`);
    }
    if (entry.kind !== kind) {
      throw new Error(`probe kind mismatch for ${probeId}: catalog says "${entry.kind}", emit says "${kind}"`);
    }
    // Freeze the payload at emit time so later mutation can't rewrite history.
    let frozen: unknown = payload;
    try {
      frozen = structuredClone(payload);
    } catch {
      // non-cloneable payloads (shouldn't happen — all payloads are JSON-ish) kept by reference
    }
    const ev: ProbeEvent = {
      probeId,
      cellId: this.cellId,
      stage,
      kind,
      payload: frozen,
      logicalClock: this.clock++,
      causeId,
      wallNanos: Number(this.nanoClock()),
    };
    this.events.push(ev);
    const subs = this.taps.get(probeId);
    if (subs) for (const fn of subs) fn(ev);
    return ev;
  }

  /** Causal reference for an event — used as causeId of downstream events. */
  ref(ev: ProbeEvent): string {
    return `${ev.probeId}#${ev.logicalClock}`;
  }

  /** The ordered probe stream for the run so far. */
  history(): ProbeEvent[] {
    return this.events.slice();
  }

  /** All events for one lead. */
  find(probeId: string): ProbeEvent[] {
    return this.events.filter((e) => e.probeId === probeId);
  }

  /** Most recent event for one lead, or undefined. */
  last(probeId: string): ProbeEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].probeId === probeId) return this.events[i];
    }
    return undefined;
  }

  /** Filter by kind and/or stage prefix — probes are typed + queryable (§3 rule 8). */
  query(filter: { kind?: ProbeKind; stagePrefix?: string; probeIdPrefix?: string }): ProbeEvent[] {
    return this.events.filter((e) =>
      (filter.kind === undefined || e.kind === filter.kind) &&
      (filter.stagePrefix === undefined || e.stage.startsWith(filter.stagePrefix)) &&
      (filter.probeIdPrefix === undefined || e.probeId.startsWith(filter.probeIdPrefix)));
  }

  /** Subscribe to one live lead. Returns an unsubscribe function. */
  tap(probeId: string, fn: (e: ProbeEvent) => void): () => void {
    if (!this.catalog.has(probeId)) {
      throw new Error(`cannot tap uncatalogued probeId: ${probeId}`);
    }
    let subs = this.taps.get(probeId);
    if (!subs) {
      subs = new Set();
      this.taps.set(probeId, subs);
    }
    subs.add(fn);
    return () => { subs.delete(fn); };
  }

  /** The full list of every available lead — the cell enumerates its own leads. */
  probeCatalog(): CatalogEntry[] {
    return [...this.catalog.values()];
  }

  /** A visible log line (also scanned by the secret-leak scan). No log-level gating. */
  log(line: string): void {
    this.logs.push(line);
  }

  /** Record a caught error object (also scanned by the secret-leak scan). */
  recordError(err: unknown): void {
    if (err instanceof Error) {
      this.errors.push({ message: err.message, stack: err.stack });
    } else {
      this.errors.push({ message: String(err) });
    }
  }

  getLogs(): string[] {
    return this.logs.slice();
  }

  getErrors(): { message: string; stack?: string }[] {
    return this.errors.slice();
  }

  /** ENTIRE internal state at the moment of call (§3 rule 4). */
  dump(): {
    cellId: string;
    logicalClock: number;
    eventCount: number;
    events: ProbeEvent[];
    logs: string[];
    errors: { message: string; stack?: string }[];
    tappedProbeIds: string[];
    catalogSize: number;
  } {
    return {
      cellId: this.cellId,
      logicalClock: this.clock,
      eventCount: this.events.length,
      events: this.events.slice(),
      logs: this.logs.slice(),
      errors: this.errors.slice(),
      tappedProbeIds: [...this.taps.keys()].filter((k) => (this.taps.get(k)?.size ?? 0) > 0),
      catalogSize: this.catalog.size,
    };
  }

  reset(): void {
    this.events = [];
    this.clock = 0;
    this.logs = [];
    this.errors = [];
  }
}
