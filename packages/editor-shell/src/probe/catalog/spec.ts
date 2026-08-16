/**
 * Probe catalog spec types + the section-entry helper. Split out of catalog.ts
 * (SUB200 restructure) — the catalog itself is assembled in ../catalog.ts from
 * the per-stage section modules in this directory, element-for-element
 * identical to the original single-file list.
 */

export type ProbeKind =
  | "input"
  | "output"
  | "value"
  | "decision"
  | "branch"
  | "edge"
  | "node"
  | "state"
  | "call"
  | "timing"
  | "error";

export interface ProbeSpec {
  probeId: string;
  stage: string;
  kind: ProbeKind;
  payloadType: string;
  description: string;
  firehose: boolean;
}

export function p(
  probeId: string,
  stage: string,
  kind: ProbeKind,
  payloadType: string,
  description: string,
  firehose = false,
): ProbeSpec {
  return { probeId, stage, kind, payloadType, description, firehose };
}
