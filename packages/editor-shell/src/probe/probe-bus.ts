/**
 * S8b — Probe bus / instrumentation core (Probe Density Contract, rules 1–9).
 *
 * Every stage of the editor-shell cell emits through one ProbeBus instance.
 * - `logicalClock` is the ONLY ordering key (monotonic per cell, rule 6).
 * - `causeId` is "<probeId>@<clock>" of the causing event (rule on §6.0).
 * - `wallNanos` is real time in a SEPARATE field, never used for ordering.
 * - Emitting a probeId that is not in the catalog THROWS: a lead that exists
 *   but is not cataloged is a bug (rule 3), enforced at runtime.
 * - No sampling, no log-level gating, no silent drop (rule 5).
 */

import { PROBE_CATALOG, type ProbeSpec, type ProbeKind } from "./catalog.js";

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

export type TapHandler = (e: ProbeEvent) => void;

/** Default wall clock: browser/node performance.now() promoted to nanoseconds. */
function defaultWallNanos(): number | null {
  const p = (globalThis as { performance?: { now(): number } }).performance;
  return p ? Math.round(p.now() * 1e6) : null;
}

export interface ProbeBusOptions {
  cellId?: string;
  /** Inject null-returning clock for byte-identical histories across runs. */
  wallClock?: () => number | null;
}

export class ProbeBus {
  readonly cellId: string;
  private clock = 0;
  private events: ProbeEvent[] = [];
  private taps = new Map<string, Set<TapHandler>>();
  private specById = new Map<string, ProbeSpec>();
  private wallClock: () => number | null;
  /** probeIds that were emitted this run (for catalog-completeness checks). */
  private firedIds = new Set<string>();

  constructor(opts: ProbeBusOptions = {}) {
    this.cellId = opts.cellId ?? "editor-shell";
    this.wallClock = opts.wallClock ?? defaultWallNanos;
    for (const spec of PROBE_CATALOG) {
      if (this.specById.has(spec.probeId)) {
        throw new Error(`duplicate probe catalog entry: ${spec.probeId}`);
      }
      this.specById.set(spec.probeId, spec);
    }
  }

  /**
   * Emit one probe event. Returns the event so callers can chain causeIds via
   * `bus.ref(event)`. Throws on an uncataloged probeId (Probe Density rule 3).
   */
  emit(probeId: string, payload: unknown, causeId: string | null = null): ProbeEvent {
    const spec = this.specById.get(probeId);
    if (!spec) {
      throw new Error(
        `probe "${probeId}" fired but is not in probeCatalog() — a lead that exists but isn't cataloged is a bug`,
      );
    }
    const event: ProbeEvent = {
      probeId,
      cellId: this.cellId,
      stage: spec.stage,
      kind: spec.kind,
      payload,
      logicalClock: ++this.clock,
      causeId,
      // wallNanos filled on timing leads (and only there by default) so
      // deterministic histories differ only where the contract allows.
      wallNanos: spec.kind === "timing" ? this.wallClock() : null,
    };
    this.events.push(event);
    this.firedIds.add(probeId);
    const handlers = this.taps.get(probeId);
    if (handlers) for (const h of [...handlers]) h(event);
    const all = this.taps.get("*");
    if (all) for (const h of [...all]) h(event);
    return event;
  }

  /** "<probeId>@<clock>" reference for use as a causeId. */
  ref(e: ProbeEvent): string {
    return `${e.probeId}@${e.logicalClock}`;
  }

  /** Full catalog — every available lead (Probe Density rule 3). */
  probeCatalog(): ProbeSpec[] {
    return [...PROBE_CATALOG];
  }

  /** Ordered probe stream for this run (Probe Density rule 4). */
  history(): ProbeEvent[] {
    return [...this.events];
  }

  /** Subscribe to one live lead ("*" taps everything). Returns unsubscribe. */
  tap(probeId: string, handler: TapHandler): () => void {
    if (probeId !== "*" && !this.specById.has(probeId)) {
      throw new Error(`tap on unknown probeId "${probeId}"`);
    }
    let set = this.taps.get(probeId);
    if (!set) {
      set = new Set();
      this.taps.set(probeId, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  /** Every probeId that fired this run. */
  firedProbeIds(): string[] {
    return [...this.firedIds].sort();
  }

  currentClock(): number {
    return this.clock;
  }

  /** Query helpers (Probe Density rule 8 — typed + filterable). */
  byId(probeId: string): ProbeEvent[] {
    return this.events.filter((e) => e.probeId === probeId);
  }
  byKind(kind: ProbeKind): ProbeEvent[] {
    return this.events.filter((e) => e.kind === kind);
  }
  byStage(stage: string): ProbeEvent[] {
    return this.events.filter((e) => e.stage === stage);
  }
  /** Follow a causal chain backwards from an event to its root. */
  causeChain(e: ProbeEvent): ProbeEvent[] {
    const chain: ProbeEvent[] = [e];
    let cur = e;
    while (cur.causeId) {
      const at = cur.causeId.lastIndexOf("@");
      const clock = Number(cur.causeId.slice(at + 1));
      const id = cur.causeId.slice(0, at);
      const found = this.events.find((x) => x.logicalClock === clock && x.probeId === id);
      if (!found) break;
      chain.push(found);
      cur = found;
    }
    return chain.reverse();
  }
}

/** Redaction helper (Probe Density rule 9): secrets show presence + last-4 only.
 *  Secrets of 8 chars or fewer show presence alone — last-4 of a short secret
 *  would leak half or all of it (review finding). */
export function redactSecret(secret: string | null | undefined): {
  secretPresent: boolean;
  secretLast4: string | null;
} {
  if (!secret) return { secretPresent: false, secretLast4: null };
  if (secret.length <= 8) return { secretPresent: true, secretLast4: null };
  return { secretPresent: true, secretLast4: secret.slice(-4) };
}
