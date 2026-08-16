/**
 * PHASE 1 — THE WALL (graph-view-wall/1.0.0).
 *
 * The minimal, clean, versioned, typed face this cell presents to its neighbors
 * (SEAM-MAP V4: the hub serves a canonical envelope; V5: the editor joins via the
 * shared-ID event bus) — promoted OVER the cell's diagnostic pins, never replacing
 * them (WALL-CONVENTIONS rules 1–3). The wall wraps runGraphView; it adds NO new
 * pipeline behavior, only:
 *   - a construction-time schema-PIN assert (rule 4) — the wall carries its own
 *     copy of the pinned (schemaVersion, schemaHash) pair and refuses loudly to
 *     stand on a drifted canonical schema (failure-class=schema-pin-mismatch);
 *   - the pins accessor {probeCatalog, dump, history, tap} delegating to the
 *     cell's existing introspection quartet (rule 3 — the 10 Fitbit pins stay
 *     reachable under the 2-pin charger);
 *   - envelope honesty: a served graph the pins prove was rejected whole
 *     (ingest.envelope.version ok:false) is a wall REJECTION with a named
 *     failure class and the pins attached — never a silently-empty render;
 *   - four wall.* leads (cataloged; the catalog only grows) so the wall's own
 *     decisions are on the same probe stream as everything else.
 *
 * The bus argument is THIS cell's GraphEventBus interface exactly as it stands
 * today ({type:'select', nodeId, source} + optional hover — see eventBus.ts,
 * quoted verbatim in MEMBRANE-SPEC.md). Phase 2 builds the T4↔T5 shape-mapping
 * adapter (SEAM-MAP V5); the wall does NOT adapt to the editor's shape.
 *
 * SUB200 restructure: the wall's carried identity, contracts, and error class
 * live in wallTypes.ts, re-exported here — importers of "./wall" are unchanged.
 */

import { runGraphView, type GraphViewCell } from "./cell";
import { ProbeBus } from "./probeBus";
import { KNOWN_PROBE_IDS, probeCatalog } from "./probeCatalog";
import type { GraphEventBusWithHover } from "./eventBus";
import { checkPin, PINNED_SCHEMA_VERSION } from "../../schema/gen/pin";
import { SCHEMA_VERSION } from "./schema";
import {
  GraphViewWallError, WALL_SCHEMA_HASH, WALL_SCHEMA_VERSION, WALL_VERSION,
  type WallFailureClass, type WallOptions, type WallPins,
} from "./wallTypes";

export {
  GraphViewWallError, WALL_SCHEMA_HASH, WALL_SCHEMA_VERSION, WALL_VERSION,
} from "./wallTypes";
export type { WallFailureClass, WallOptions, WallPins } from "./wallTypes";

const STAGE = "W"; // the wall is not a pipeline stage; its leads sit beside S0–S7

/** The face: the cell handle (unchanged — the wall promotes it, additive-only)
 *  plus the pins quartet. Nothing else leaks through (rule 2). */
export interface GraphViewWall {
  cell: GraphViewCell;
  pins: WallPins;
}

export async function createGraphViewWall(
  schemaJson: unknown,
  eventBus: GraphEventBusWithHover,
  opts: WallOptions = {},
): Promise<GraphViewWall> {
  // The wall owns the probe bus so its own leads AND the run's leads share one
  // stream — and so pins survive any rejection raised below.
  const probeBus = new ProbeBus(KNOWN_PROBE_IDS);

  const constructCause = probeBus.emit({
    probeId: "wall.construct", stage: STAGE, kind: "call",
    payload: {
      wallVersion: WALL_VERSION,
      schemaVersion: WALL_SCHEMA_VERSION,
      schemaHash: WALL_SCHEMA_HASH,
      capConfigOverridden: opts.capConfig !== undefined,
    },
    causeId: null,
  });

  // ── PIN assert at construction (rule 4): the wall's carried pin vs the
  // canonical gen/pin.ts constants, plus the generated-artifact cross-check
  // (gen/graph-schema.ts SCHEMA_VERSION vs gen/pin.ts PINNED_SCHEMA_VERSION —
  // a partially regenerated gen/ folder is ALSO drift). Refuse loudly on drift.
  let pinReason: string | null = null;
  try {
    checkPin(WALL_SCHEMA_VERSION, WALL_SCHEMA_HASH);
    if ((SCHEMA_VERSION as string) !== (PINNED_SCHEMA_VERSION as string)) {
      throw new Error(
        `failure-class=schema-pin-mismatch: gen/graph-schema.ts SCHEMA_VERSION ${JSON.stringify(SCHEMA_VERSION)}` +
        ` != gen/pin.ts PINNED_SCHEMA_VERSION ${JSON.stringify(PINNED_SCHEMA_VERSION)} — partially regenerated schema package`,
      );
    }
  } catch (e) {
    pinReason = e instanceof Error ? e.message : String(e);
  }
  const pinAssertCause = probeBus.emit({
    probeId: "wall.pin.assert", stage: STAGE, kind: "decision",
    payload: {
      ok: pinReason === null,
      carriedVersion: WALL_SCHEMA_VERSION,
      pinnedVersion: PINNED_SCHEMA_VERSION,
      carriedHash: WALL_SCHEMA_HASH,
      ...(pinReason !== null ? { reason: pinReason } : {}),
    },
    causeId: constructCause,
  });
  if (pinReason !== null) {
    probeBus.emit({
      probeId: "wall.face.reject", stage: STAGE, kind: "error",
      payload: { failureClass: "schema-pin-mismatch", reason: pinReason },
      causeId: pinAssertCause,
    });
    // No cell exists yet; history/catalog stay reachable through the error's pins.
    throw new GraphViewWallError("schema-pin-mismatch", pinReason, busOnlyPins(probeBus));
  }

  // ── Run the cell EXACTLY as it stands (the wall adds nothing to S0–S7).
  let cell: GraphViewCell;
  try {
    cell = await runGraphView(schemaJson, eventBus, { capConfig: opts.capConfig, bus: probeBus });
  } catch (err) {
    // A cell gate violation (EdgeSetViolation / NodeSetViolation /
    // LeadPromotionViolation) crosses the wall UNCHANGED — probed, then rethrown.
    probeBus.emit({
      probeId: "wall.face.reject", stage: STAGE, kind: "error",
      payload: {
        failureClass: err instanceof Error ? err.name : "unknown",
        reason: err instanceof Error ? err.message : String(err),
      },
      causeId: pinAssertCause,
    });
    throw err;
  }

  const pins: WallPins = {
    probeCatalog: () => cell.probeCatalog(),
    dump: () => cell.dump(),
    history: () => cell.history(),
    tap: (probeId, fn) => cell.tap(probeId, fn),
  };

  // ── Envelope honesty: the wall declares ONLY what the pins prove was ingested.
  // A payload ingest rejected whole (ruling 3 + pin) must not surface as a
  // silently-empty-but-standing wall — it is a named rejection, pins attached.
  const envelopePin = probeBus.last("ingest.envelope.version");
  const env = envelopePin?.payload as { present: boolean; ok: boolean; value?: string } | undefined;
  if (env === undefined || !env.ok) {
    const failureClass: WallFailureClass = env?.present ? "schema-pin-mismatch" : "envelope-rejected";
    const reason = env === undefined
      ? "ingest.envelope.version pin missing from the stream — the wall cannot prove the envelope was checked"
      : env.present
        ? `served envelope schemaVersion ${JSON.stringify(env.value)} != pinned ${JSON.stringify(PINNED_SCHEMA_VERSION)} — rejected whole at ingest (assembly ruling 3 + schema pin)`
        : `served envelope has no schemaVersion — the canonical envelope {schemaVersion:${JSON.stringify(PINNED_SCHEMA_VERSION)},nodes,edges,leads} requires it (assembly ruling 3); rejected whole at ingest`;
    probeBus.emit({
      probeId: "wall.face.reject", stage: STAGE, kind: "error",
      payload: { failureClass, reason },
      causeId: envelopePin ? `${envelopePin.probeId}#${envelopePin.logicalClock}` : pinAssertCause,
    });
    throw new GraphViewWallError(failureClass, reason, pins);
  }

  // ── The declared face summary — one pinned lead the conformance test holds
  // against pin-level truth (declared may never diverge from probed).
  probeBus.emit({
    probeId: "wall.face.result", stage: STAGE, kind: "output",
    payload: {
      wallVersion: WALL_VERSION,
      nodes: cell.rfNodes.length,
      edges: cell.rfEdges.length,
      leads: cell.rfEdges.filter((e) => e.type === "leadEdge").length,
      engine: cell.engine.name,
      capMode: cell.cap.mode,
      bannerShown: cell.banner.bannerShown,
    },
    causeId: pinAssertCause,
  });

  return { cell, pins };
}

/** Pins for a wall that refused BEFORE a cell existed: the catalog is static and
 *  history/tap come from the wall's own bus; dump() honestly refuses — there is
 *  no cell state to dump, and fabricating one would be a fake pin. */
function busOnlyPins(probeBus: ProbeBus): WallPins {
  return {
    probeCatalog: () => probeCatalog(),
    dump: () => {
      throw new GraphViewWallError(
        "schema-pin-mismatch",
        "wall refused at construction — no cell stands, so there is no dump; read history()/tap() for the refusal stream",
      );
    },
    history: () => probeBus.history(),
    tap: (probeId, fn) => probeBus.tap(probeId, fn),
  };
}
