/**
 * PHASE 1 — THE WALL, shared shapes and carried identity (graph-view-wall/1.0.0).
 * Split from wall.ts (SUB200 restructure); wall.ts re-exports everything here,
 * so importers of "./wall" are unchanged.
 */

import type { CellDump } from "./cell";
import type { ProbeEvent } from "./probeBus";
import type { ProbeCatalogEntry } from "./probeCatalog";
import type { CapConfig } from "./cap";

export const WALL_VERSION = "graph-view-wall/1.0.0" as const;

/**
 * The schema pin the wall CARRIES (WALL-CONVENTIONS rule 4). Deliberately literal
 * copies, not re-exports: at construction they are asserted against the canonical
 * gen/pin.ts constants (swap pattern (b) — extracted-constant equality), so a
 * regenerated/drifted canonical schema makes the wall refuse to stand, loudly.
 */
export const WALL_SCHEMA_VERSION = "v0" as const;
export const WALL_SCHEMA_HASH =
  "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c" as const;

/** Failure classes the wall itself raises (the cell's own named violation classes
 *  — EdgeSetViolation, NodeSetViolation, LeadPromotionViolation — propagate through
 *  the wall UNCHANGED; the wall extends the vocabulary, never renames it). */
export type WallFailureClass = "schema-pin-mismatch" | "envelope-rejected";

/** Rule 3 — the pins accessor: the cell's existing introspection quartet,
 *  reachable through the wall, delegating, never re-implemented. */
export interface WallPins {
  probeCatalog(): ProbeCatalogEntry[];
  dump(): CellDump;
  history(): ProbeEvent[];
  tap(probeId: string, fn: (e: ProbeEvent) => void): () => void;
}

/** Minimal options face: cap config passthrough ONLY. Every cap stays probed +
 *  bannered by the cell (no silent caps through the wall); the cell's other
 *  RunOptions (engine, worker, test seams, hooks) are cell-face concerns and do
 *  not cross the wall. */
export interface WallOptions {
  capConfig?: Partial<CapConfig>;
}

/** Every wall rejection is a NAMED failure class with the pins attached whenever
 *  a probe stream exists — a refused wall is still introspectable (rule 5:
 *  declared behavior, including refusal, never diverges from probed behavior). */
export class GraphViewWallError extends Error {
  constructor(
    readonly failureClass: WallFailureClass,
    message: string,
    readonly pins: WallPins | null = null,
  ) {
    super(`failure-class=${failureClass}: ${message}`);
    this.name = "GraphViewWallError";
  }
}
