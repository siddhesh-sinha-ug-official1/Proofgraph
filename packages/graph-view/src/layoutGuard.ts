/**
 * S4 — LAYOUT edge-set guard (Term 3 of the edge-equality chain). Split from
 * layout.ts (SUB200 restructure); layout.ts re-exports both names, so importers
 * of "./layout" are unchanged.
 */

import type { ProbeBus } from "./probeBus";

const STAGE = "S4";

export class EngineEdgeSetViolation extends Error {
  constructor(message: string, readonly missing: string[], readonly invented: string[], readonly duplicated: string[]) {
    super(message);
    this.name = "EngineEdgeSetViolation";
  }
}

/**
 * Term-3 enforcement of the edge-equality chain: the engine's OUTPUT edge-id
 * multiset must equal its INPUT multiset. An engine that eats, invents, or
 * duplicates an edge fails loudly here (layout.error + throw) — the catalog's
 * claim that "an engine that drops an edge is caught here" is enforced, not
 * aspirational. Exported so the gate can be negative-tested without a doctored
 * engine build.
 */
export function enforceEngineEdgeSet(
  inIds: string[],
  outIds: string[],
  bus: ProbeBus,
  causeId: string,
  elkInputEcho: object,
): void {
  const count = (ids: string[]) => {
    const m = new Map<string, number>();
    for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  };
  const inCount = count(inIds);
  const outCount = count(outIds);
  const missing = [...inCount.keys()].filter((id) => (outCount.get(id) ?? 0) < inCount.get(id)!);
  const invented = [...outCount.keys()].filter((id) => (outCount.get(id) ?? 0) > (inCount.get(id) ?? 0) && !inCount.has(id));
  const duplicated = [...outCount.keys()].filter((id) => inCount.has(id) && outCount.get(id)! > inCount.get(id)!);
  if (missing.length || invented.length || duplicated.length) {
    const message =
      `engine edge-set violation: missing=[${missing.join(",")}] invented=[${invented.join(",")}] duplicated=[${duplicated.join(",")}]`;
    bus.emit({
      probeId: "layout.error", stage: STAGE, kind: "error",
      payload: { message, elkInputEcho },
      causeId,
    });
    throw new EngineEdgeSetViolation(message, missing, invented, duplicated);
  }
}
