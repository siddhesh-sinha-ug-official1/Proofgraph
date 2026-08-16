/**
 * Shared substrate for the probe-catalog section modules: the entry shape and
 * the E() constructor. The catalog itself is assembled — section by section, in
 * stage order — by probeCatalog.ts (the aggregator/facade). A membrane never
 * deletes a pin: sections may only grow.
 */

import type { ProbeKind } from "./probeBus";

export interface ProbeCatalogEntry {
  probeId: string;
  kind: ProbeKind;
  payloadType: string;
  description: string;
}

export const E = (probeId: string, kind: ProbeKind, payloadType: string, description: string): ProbeCatalogEntry =>
  ({ probeId, kind, payloadType, description });
