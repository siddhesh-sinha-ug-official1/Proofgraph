/**
 * §9.4 green-guard test payload shapes + paint reader (SUB200 restructure:
 * split from 04-green-guard.test.ts, verbatim).
 */

import assert from "node:assert/strict";
import type { ProbeBus } from "../../src/probe/probe-bus.js";
import { payloadsOf } from "../stub/assert-probes.js";

export interface GreenGuardPayload {
  nodeId: string;
  wouldBeGreen: boolean;
  greenAllowed: boolean;
  tier: string;
  source: string;
  reason: string;
}

export interface GreenBlockedPayload {
  nodeId: string;
  downgradedTo: string;
  tier: string;
  reason: string;
}

export interface GutterPaintPayload {
  nodeId: string;
  lineNumber: number;
  glyphClass: string;
  color: string;
  status: string;
}

export interface TierGuardPayload {
  tier: string;
  liveGreenAllowed: boolean;
  reason: string;
}

export function paintsFor(bus: ProbeBus, nodeId: string): GutterPaintPayload[] {
  const paints = payloadsOf<GutterPaintPayload>(bus, "editor.verdict.gutter.paint").filter(
    (p) => p.nodeId === nodeId,
  );
  assert.ok(paints.length > 0, `no editor.verdict.gutter.paint for node ${nodeId}`);
  return paints;
}
