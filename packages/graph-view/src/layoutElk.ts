/**
 * S4 — LAYOUT, elkjs engine half (EPL-2.0, the deliberate default for quality:
 * real port constraints, most configurable layered implementation). elkjs blocks
 * the main thread on large graphs, so in a browser it runs in a Web Worker;
 * under Node there is no Worker and the decision probe says so out loud.
 * Split from layout.ts (SUB200 restructure).
 */

import type { ProbeBus } from "./probeBus";
import type { ElkGraph } from "./layoutIn";
import type { ElkPoint, ElkResult, LayoutOptions } from "./layoutTypes";

const STAGE = "S4";

export async function runElk(elkGraph: ElkGraph, bus: ProbeBus, requestCause: string, opts: LayoutOptions): Promise<{ raw: unknown; worker: boolean }> {
  const workerAvailable = typeof Worker !== "undefined" && !!opts.workerFactory;
  const decisionCause = bus.emit({
    probeId: "layout.worker.decision", stage: STAGE, kind: "decision",
    payload: {
      useWorker: workerAvailable,
      reason: workerAvailable
        ? "Web Worker available — elkjs blocks the main thread on large graphs, so layout runs off-thread"
        : typeof Worker === "undefined"
          ? "no Web Worker in this environment (Node/test) — bundled main-thread elkjs"
          : "no worker factory injected — bundled main-thread elkjs",
      nodeCount: elkGraph.children.length,
    },
    causeId: requestCause,
  });

  if (workerAvailable) {
    const spawnCause = bus.emit({
      probeId: "layout.worker.spawn", stage: STAGE, kind: "call",
      payload: { workerUrl: opts.workerUrl ?? "elkjs/lib/elk-worker.min.js (vite-bundled)" },
      causeId: decisionCause,
    });
    const mod = await import("elkjs/lib/elk-api.js");
    const ElkCtor = (mod as { default?: unknown }).default ?? mod;
    const elk = new (ElkCtor as new (o: object) => {
      layout: (g: object) => Promise<unknown>;
      terminateWorker: () => void;
    })({ workerFactory: opts.workerFactory! });
    const postBytes = JSON.stringify(elkGraph).length;
    bus.emit({
      probeId: "layout.worker.message", stage: STAGE, kind: "call",
      payload: { direction: "post", bytes: postBytes }, causeId: spawnCause,
    });
    try {
      const raw = await elk.layout(elkGraph as unknown as object);
      bus.emit({
        probeId: "layout.worker.message", stage: STAGE, kind: "call",
        payload: { direction: "receive", bytes: JSON.stringify(raw).length }, causeId: spawnCause,
      });
      // Tear the worker down FOR REAL before the probe says so — the probe reports
      // an event that happened, not an intention.
      elk.terminateWorker();
      bus.emit({
        probeId: "layout.worker.terminate", stage: STAGE, kind: "state",
        payload: { reason: "idle" }, causeId: spawnCause,
      });
      return { raw, worker: true };
    } catch (err) {
      elk.terminateWorker();
      bus.emit({
        probeId: "layout.worker.terminate", stage: STAGE, kind: "state",
        payload: { reason: "error" }, causeId: spawnCause,
      });
      throw err;
    }
  }

  const mod = await import("elkjs/lib/elk.bundled.js");
  const ElkCtor = (mod as { default?: unknown }).default ?? mod;
  const elk = new (ElkCtor as new () => { layout: (g: object) => Promise<unknown> })();
  const raw = await elk.layout(elkGraph as unknown as object);
  return { raw, worker: false };
}

export function normalizeElkResult(raw: unknown): ElkResult {
  const r = raw as {
    children?: { id: string; x?: number; y?: number; width?: number; height?: number }[];
    edges?: { id: string; sections?: { startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }[] }[];
  };
  return {
    children: (r.children ?? []).map((c) => ({
      id: c.id,
      x: c.x ?? Number.NaN,
      y: c.y ?? Number.NaN,
      width: c.width ?? 0,
      height: c.height ?? 0,
    })),
    edges: (r.edges ?? []).map((e) => ({
      id: e.id,
      sections: (e.sections ?? []).map((s) => ({
        startPoint: s.startPoint, endPoint: s.endPoint, bendPoints: s.bendPoints ?? [],
      })),
    })),
  };
}
