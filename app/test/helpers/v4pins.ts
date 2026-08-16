/**
 * SUB200 restructure (wave 2) — shared pin/bus/dump helpers for the
 * v4.serve.* seam suites, hoisted VERBATIM from v4.serve.test.tsx.
 */

import { createHash } from "node:crypto";
import { expect } from "vitest";

import { idByteOffsets, utf8Identical } from "../../src/graphSource";
import type { GraphViewWall } from "@graph-view/src/wall";
import { getJson } from "./v4hub";

export const sha256 = (data: Uint8Array | string): string =>
  createHash("sha256").update(data).digest("hex");

// ── the local bus handed to the graph-view wall (assembly-owned; select-only —
// no hover, so the wall must degrade OUT LOUD via link.hover.unsupported) ─────
export interface LocalBus {
  emitted: Array<{ type: string; nodeId: string; source: string }>;
  emit(evt: { type: "select"; nodeId: string; source: string }): void;
  on(type: "select", cb: (evt: { nodeId: string; source: string }) => void): () => void;
}
export function localBus(): LocalBus {
  const subs: Array<(evt: { nodeId: string; source: string }) => void> = [];
  const emitted: LocalBus["emitted"] = [];
  return {
    emitted,
    emit(evt) {
      emitted.push(evt);
      subs.forEach((cb) => cb({ nodeId: evt.nodeId, source: evt.source }));
    },
    on(_type, cb) {
      subs.push(cb);
      return () => {
        const i = subs.indexOf(cb);
        if (i >= 0) subs.splice(i, 1);
      };
    },
  };
}

// ── pin helpers ───────────────────────────────────────────────────────────────
export type AnyEvent = { probeId: string; payload: any; logicalClock: number; causeId?: string | null };
export const of = (events: AnyEvent[], probeId: string): AnyEvent[] =>
  events.filter((e) => e.probeId === probeId);
export const last = (events: AnyEvent[], probeId: string): AnyEvent => {
  const hits = of(events, probeId);
  expect(hits.length, `expected at least one ${probeId} pin`).toBeGreaterThan(0);
  return hits[hits.length - 1];
};

export const PINS_LIMIT = 100000; // explicit override of the hub's 2000/stream tail bound
export async function pinsHistory(base: string): Promise<any> {
  const { status, body } = await getJson(`${base}/pins/history?limit=${PINS_LIMIT}`);
  expect(status).toBe(200);
  // The tail bound is honored OUT LOUD: assert nothing was truncated at this limit.
  for (const name of ["structure-extractor", "graph-model"]) {
    expect(body.cells[name].available).toBe(true);
    expect(body.cells[name].truncated, `${name} stream truncated at limit=${PINS_LIMIT}`).toBe(false);
  }
  expect(body.hub.truncated).toBe(false);
  return body;
}

// ── helpers over the view dump ────────────────────────────────────────────────
export const rfPartition = (wall: GraphViewWall) => {
  const dump = wall.pins.dump();
  return {
    dump,
    // Real schema nodes only: the view synthesizes GHOST placeholder nodes for
    // legal unresolved lead targets (data.placeholder:true) — they are probed,
    // banner-accounted render artifacts, never part of the served node set.
    nodeIds: dump.rfNodes.filter((n: any) => !n.data.placeholder).map((n: any) => n.id as string),
    placeholderIds: dump.rfNodes.filter((n: any) => n.data.placeholder).map((n: any) => n.id as string),
    resolvedEdgeIds: dump.rfEdges.filter((e: any) => e.type === "resolvedEdge").map((e: any) => e.id as string),
    leadEdgeIds: dump.rfEdges.filter((e: any) => e.type === "leadEdge").map((e: any) => e.id as string),
  };
};
export const setEq = (a: string[], b: string[]) => {
  expect(new Set(a).size).toBe(a.length);
  expect(new Set(b).size).toBe(b.length);
  expect([...a].sort()).toEqual([...b].sort());
};
/** Byte-level identity: every id of `ids` appears in `reference` with UTF-8-identical
 *  bytes (not merely ===), and its literal byte sequence exists in `payload`. */
export const byteIdentical = (ids: string[], reference: string[], payload: Uint8Array) => {
  const refSorted = [...reference].sort();
  const idsSorted = [...ids].sort();
  expect(idsSorted.length).toBe(refSorted.length);
  idsSorted.forEach((id, i) => {
    expect(utf8Identical(id, refSorted[i]), `utf-8 byte mismatch: ${id} vs ${refSorted[i]}`).toBe(true);
    expect(idByteOffsets(payload, id).length, `id ${id} not byte-present in payload`).toBeGreaterThan(0);
  });
};
