/**
 * S4 — LAYOUT. The one external call: hand the ElkGraph to a layout engine, await
 * coordinates. elkjs (EPL-2.0) is the deliberate default for quality (real port
 * constraints, most configurable layered implementation); @dagrejs/dagre (MIT) is
 * the vetted pure-permissive fallback. elkjs blocks the main thread on large graphs,
 * so in a browser it runs in a Web Worker; under Node there is no Worker and the
 * decision probe says so out loud.
 *
 * SUB200 restructure: this module is the facade + orchestrator. The shared shapes
 * live in layoutTypes.ts, the elkjs half in layoutElk.ts, the dagre half in
 * layoutDagre.ts, and the Term-3 edge-set guard in layoutGuard.ts — all
 * re-exported here so importers of "./layout" are unchanged.
 */

import type { ProbeBus } from "./probeBus";
import type { ElkGraph } from "./layoutIn";
import { engineVersion, type EngineName, type LayoutOptions, type LayoutOutput } from "./layoutTypes";
import { normalizeElkResult, runElk } from "./layoutElk";
import { runDagre } from "./layoutDagre";
import { enforceEngineEdgeSet } from "./layoutGuard";

export type {
  ElkPoint, ElkSection, ElkResultNode, ElkResultEdge, ElkResult,
  EngineName, LayoutOptions, LayoutOutput,
} from "./layoutTypes";
export { EngineEdgeSetViolation, enforceEngineEdgeSet } from "./layoutGuard";

const STAGE = "S4";

interface EngineIdentity { name: EngineName; version: string; spdx: string }

export async function layout(elkGraph: ElkGraph, bus: ProbeBus, layoutInCause: string, opts: LayoutOptions = {}): Promise<LayoutOutput> {
  const engineName: EngineName = opts.engine ?? "elkjs";
  const identity: EngineIdentity = {
    name: engineName,
    version: await engineVersion(engineName),
    spdx: engineName === "elkjs" ? "EPL-2.0" : "MIT",
  };

  const requestCause = bus.emit({
    probeId: "layout.call.request", stage: STAGE, kind: "call",
    payload: elkGraph,
    causeId: layoutInCause,
  });

  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let raw: unknown;
  let worker = false;
  try {
    if (engineName === "elkjs") {
      const out = await runElk(elkGraph, bus, requestCause, opts);
      raw = out.raw; worker = out.worker;
    } else {
      const out = await runDagre(elkGraph, bus, requestCause);
      raw = out.raw; worker = out.worker;
    }
  } catch (err) {
    bus.emit({
      probeId: "layout.error", stage: STAGE, kind: "error",
      payload: { message: err instanceof Error ? err.message : String(err), elkInputEcho: elkGraph },
      causeId: requestCause,
    });
    throw err;
  }
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

  // Honest provenance for the coordinates: which engine, which version, which license,
  // on or off the main thread.
  bus.emit({
    probeId: "layout.engine", stage: STAGE, kind: "value",
    payload: { name: identity.name, version: identity.version, spdx: identity.spdx, worker },
    causeId: requestCause,
  });

  const result = normalizeElkResult(raw);
  const responseCause = bus.emit({
    probeId: "layout.call.response", stage: STAGE, kind: "call",
    payload: raw,
    causeId: requestCause,
  });
  for (const n of result.children) {
    bus.emit({
      probeId: "layout.out.node", stage: STAGE, kind: "node",
      payload: { id: n.id, x: n.x, y: n.y, width: n.width, height: n.height },
      causeId: responseCause,
    });
  }
  for (const e of result.edges) {
    bus.emit({
      probeId: "layout.out.edge", stage: STAGE, kind: "edge",
      payload: { id: e.id, sections: e.sections },
      causeId: responseCause,
    });
  }
  bus.emit({
    probeId: "layout.out.edgeCount", stage: STAGE, kind: "value",
    payload: { count: result.edges.length },
    causeId: responseCause,
  });
  bus.emit({
    probeId: "layout.timing", stage: STAGE, kind: "timing",
    payload: { wallNanos: Math.round((t1 - t0) * 1e6), nodeCount: result.children.length, edgeCount: result.edges.length },
    causeId: responseCause,
  });

  // Term 3 of the chain is ENFORCED, not just probed: layout.in ids == layout.out ids.
  enforceEngineEdgeSet(
    elkGraph.edges.map((e) => e.id),
    result.edges.map((e) => e.id),
    bus,
    responseCause,
    elkGraph,
  );

  return { result, engine: { ...identity, worker }, cause: responseCause };
}
