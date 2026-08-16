/**
 * ASSEMBLY Phase 1 — the editor-shell WALL: the minimal, clean, versioned,
 * typed face this cell presents to its neighbors (SEAM-MAP: V2 consumes the
 * cell's CellConfig capability seam; V5 consumes the bus). Promoted OVER the
 * cell's diagnostic pins, never replacing them — every pin stays reachable
 * through `pins` (the "10 Fitbit pins under the 2-pin charger").
 *
 * Face (frozen by the master contract + seam map):
 *   createEditorWall(cfg) → { wallVersion, bus, update(nodes), dispose(), pins }
 *   + WALL_VERSION + the BusEvent type re-export.
 *
 * - `bus` is the cell's selection event bus speaking BusEvent
 *   {type:"node.select", nodeId, origin:"editor"|"graph", clock} EXACTLY as
 *   the cell speaks it today. Phase 2's V5 adapter maps shapes — not this wall.
 * - `update(nodes)` is the path by which fresh schema nodes/verdicts arrive:
 *   it wraps the cell's node-refresh mechanism (cell.updateSchemaNodes —
 *   rebuildIndex → repaintVerdicts → emitViewport, the same machinery every
 *   buffer edit runs), never a silent re-mount, never a re-open.
 * - `dispose()` tears down cell + connections (didClose → shutdown → exit →
 *   adapter/transport teardown). Idempotent.
 * - `pins` delegates to the cell's existing diagnostic quartet.
 *
 * Schema PIN: asserted at construction against the cell's verified-in-sync
 * copies (src/schema/pin.ts + src/schema/schema.ts — pattern (b) of the
 * Phase-0 swap; a static cross-package import is blocked by tsconfig rootDir
 * and the browser tier has no file I/O). The conformance test closes the loop
 * to the REAL packages/schema at runtime: it recomputes the canonical hash of
 * schema.json and asserts this wall's recorded pin equals canonical truth.
 * On drift the wall refuses to stand: failure-class=schema-pin-mismatch.
 *
 * Honest ceiling propagates THROUGH the wall unchanged: tier != CT can never
 * surface green; fill "unknown" renders unknown; a null outline renders
 * "not-yet-computed" — the wall adds no interpretation and fabricates no tier,
 * no verdict, no green.
 */

import type { ProbeEvent, TapHandler } from "./probe/probe-bus.js";
import type { ProbeSpec } from "./probe/catalog.js";
import type { SelectionBus } from "./seams/bus.js";
import type { SchemaNode } from "./schema/schema.js";
import { SCHEMA_VERSION } from "./schema/schema.js";
import { checkPin } from "./schema/pin.js";
import { createEditorShellCell, type CellConfig, type EditorShellCell } from "./cell.js";

// The bus shape neighbors consume — re-exported so a consumer of the wall
// needs no deep import (Phase 2 adapts shapes; this is the cell's own shape).
export type { BusEvent, SelectionBus } from "./seams/bus.js";

export const WALL_VERSION = "editor-shell-wall/1.0.0" as const;

/**
 * The wall's OWN record of the canonical schema identity it stands on.
 * Deliberately literal (not derived from the pin copy) so that a re-sync of
 * the cell's copies without a deliberate wall re-pin is caught at
 * construction, not silently absorbed.
 */
export const WALL_SCHEMA_PIN = {
  schemaVersion: "v0",
  schemaHash: "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c",
} as const;

/** Pins accessor — the cell's existing diagnostic quartet, delegated 1:1. */
export interface EditorWallPins {
  probeCatalog(): ProbeSpec[];
  dump(): unknown;
  history(): ProbeEvent[];
  tap(probeId: string, fn: TapHandler): () => void;
}

/** The wall face. Exactly the seam-map surface + pins — nothing more. */
export interface EditorWall {
  readonly wallVersion: typeof WALL_VERSION;
  /** The selection event bus (node.select only) — the V5 seam, cell shape, ids byte-identical. */
  readonly bus: SelectionBus;
  /** Fresh schema nodes/verdicts arrive here; rejects with failure-class=wall-disposed after dispose(). */
  update(nodes: SchemaNode[]): void;
  /** Tear down the cell + connections cleanly. Idempotent. */
  dispose(reason?: string): Promise<void>;
  readonly pins: EditorWallPins;
}

/** The wall takes the cell's own config — headless (StubEditorAdapter) and
 *  browser (MonacoEditorAdapter) tiers use the SAME face. */
export type EditorWallConfig = CellConfig;

/**
 * Mount the editor-shell cell behind its wall: construct → assert schema PIN
 * (refuse loudly on drift) → open (mount, connect, didOpen, first verdict
 * paint) → hand back the face. On a failed open the partially-built cell is
 * disposed before the error propagates — no half-mounted zombie.
 */
export async function createEditorWall(cfg: EditorWallConfig): Promise<EditorWall> {
  const cell: EditorShellCell = createEditorShellCell(cfg);

  // ── Schema PIN assert — BEFORE any mount/connect work. ────────────────────
  try {
    // Wall record vs the verified-in-sync pin copy (catches a re-synced copy
    // under an un-re-pinned wall, and vice versa)…
    checkPin(WALL_SCHEMA_PIN.schemaVersion, WALL_SCHEMA_PIN.schemaHash);
    // …and vs the schema surface the cell actually computes verdicts with.
    if (SCHEMA_VERSION !== WALL_SCHEMA_PIN.schemaVersion) {
      throw new Error(
        "failure-class=schema-pin-mismatch: wall pinned schemaVersion " +
          JSON.stringify(WALL_SCHEMA_PIN.schemaVersion) +
          " != cell schema seam SCHEMA_VERSION " +
          JSON.stringify(SCHEMA_VERSION),
      );
    }
  } catch (err) {
    cell.probe.emit("editor.wall.pin.check", {
      wallVersion: WALL_VERSION,
      schemaVersion: WALL_SCHEMA_PIN.schemaVersion,
      schemaHash: WALL_SCHEMA_PIN.schemaHash,
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
    });
    throw err; // the wall refuses to stand on a drifted schema
  }
  cell.probe.emit("editor.wall.pin.check", {
    wallVersion: WALL_VERSION,
    schemaVersion: WALL_SCHEMA_PIN.schemaVersion,
    schemaHash: WALL_SCHEMA_PIN.schemaHash,
    pass: true,
    reason: "wall pin == verified-in-sync pin copy == cell schema seam",
  });

  // ── Mount lifecycle. ───────────────────────────────────────────────────────
  try {
    await cell.open();
  } catch (err) {
    await cell.dispose("wall: open() failed").catch(() => {});
    throw err;
  }
  cell.probe.emit("editor.wall.mount", {
    wallVersion: WALL_VERSION,
    uri: cfg.file.uri,
    lang: cfg.file.lang,
    nodeCount: cfg.schemaNodes.length,
  });

  let disposed = false;

  return {
    wallVersion: WALL_VERSION,

    bus: cfg.bus,

    update(nodes: SchemaNode[]): void {
      if (disposed) {
        cell.probe.emit("editor.wall.update.nodes", {
          nodeCount: nodes.length,
          accepted: false,
          reason: "failure-class=wall-disposed",
        });
        throw new Error(
          "failure-class=wall-disposed: update() after dispose() — re-mount via createEditorWall, never silently revive",
        );
      }
      const updateProbe = cell.probe.emit("editor.wall.update.nodes", {
        nodeCount: nodes.length,
        accepted: true,
        reason: "fresh schema nodes/verdicts via the wall face",
      });
      cell.updateSchemaNodes(nodes, cell.probe.ref(updateProbe));
    },

    async dispose(reason = "wall.dispose()"): Promise<void> {
      if (disposed) return; // idempotent — the cell's dispose also guards itself
      disposed = true;
      cell.probe.emit("editor.wall.dispose", { wallVersion: WALL_VERSION, reason });
      await cell.dispose(reason);
    },

    pins: {
      probeCatalog: () => cell.probeCatalog(),
      dump: () => cell.dump(),
      history: () => cell.history(),
      tap: (probeId: string, fn: TapHandler) => cell.tap(probeId, fn),
    },
  };
}
