/**
 * S6 brushing-test probe payload shapes (SUB200 restructure: split from
 * 03-brushing.test.ts, verbatim).
 */

import type { TextRange } from "../../src/mount/adapter.js";

export type EmitBusPayload = {
  busEvent: { type: string; nodeId: string; origin: string; clock: number };
};
export type ResolvePayload = { nodeId: string; matchKind: string };
export type RevealPayload = {
  nodeId: string;
  monacoRange: TextRange;
  revealed: string;
  highlightApplied: boolean;
};
export type LookupPayload = { nodeId: string; found: boolean; span: unknown };
export type RecvMissPayload = { nodeId: string; reason: string };
export type EmitMissPayload = { position: { line: number; column: number }; reason: string };
export type MultiPayload = { selectionCount: number; nodeIds: string[]; policy: string; reason: string };
export type GuardPayload = { nodeId: string; suppressedReEmit: boolean; reason: string };
export type AmbiguousPayload = {
  candidates: string[];
  chosen: string;
  rule: string;
  reason: string;
};
export type TimingPayload = {
  emitToBusClockDelta: number | null;
  busToHighlightClockDelta: number | null;
};
