/**
 * S6 — the named violation classes the render commit gate throws. Split from
 * renderGate.ts (SUB200 restructure); renderGate.ts re-exports all three, so
 * importers of "./renderGate" are unchanged. The names propagate through the
 * wall UNCHANGED (see wall.ts) — they are part of the failure vocabulary.
 */

export class EdgeSetViolation extends Error {
  constructor(message: string, readonly eaten: string[], readonly phantom: string[]) {
    super(message);
    this.name = "EdgeSetViolation";
  }
}
export class NodeSetViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeSetViolation";
  }
}
export class LeadPromotionViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadPromotionViolation";
  }
}
