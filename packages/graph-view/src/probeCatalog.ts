/**
 * probeCatalog() — the cell enumerates its own gajillion leads (Probe Density Contract §3).
 * A lead that exists at runtime but isn't listed here is a build-failing bug (gate 16).
 *
 * NOTE: the build prompt says "61 leads"; enumerating §6 verbatim yields 84 distinct
 * probeIds (S0:15, S1:9, S2:10, S3:6, S4:12, S5:4, S6:14, S7:14). 61 is documented as
 * a floor, not a ceiling — this catalog carries all 84, plus 3 local leads
 * (cap.edge.dropped, link.echo.ignored, link.hover.unsupported), plus 2 Phase-0
 * assembly leads for the canonical-envelope decisions (ingest.envelope.version,
 * ingest.edge.segregation — ruling 3), plus 4 Phase-1 wall leads for the wall's
 * own decisions (wall.construct, wall.pin.assert, wall.face.result,
 * wall.face.reject — stage "W", see src/wall.ts + MEMBRANE-SPEC.md).
 * A membrane never deletes a pin: 93 total.
 *
 * SUB200 restructure: the entries live in section modules (catalogIngestCap.ts
 * S0+S1, catalogVerdictLayout.ts S2–S4, catalogRenderLink.ts S5–S7+W, shapes in
 * catalogKit.ts); this facade concatenates them IN STAGE ORDER — verified
 * element-for-element identical to the pre-split single list at the split.
 * (Claim-audit round: payloadType text on 6 entries was later corrected to
 * match the emitted payloads; probeIds, order, and count 93 unchanged.)
 */

export type { ProbeCatalogEntry } from "./catalogKit";
import type { ProbeCatalogEntry } from "./catalogKit";
import { CATALOG_S0, CATALOG_S1 } from "./catalogIngestCap";
import { CATALOG_S2, CATALOG_S3, CATALOG_S4 } from "./catalogVerdictLayout";
import { CATALOG_S5, CATALOG_S6, CATALOG_S7, CATALOG_W } from "./catalogRenderLink";

export const PROBE_CATALOG: ProbeCatalogEntry[] = [
  ...CATALOG_S0,
  ...CATALOG_S1,
  ...CATALOG_S2,
  ...CATALOG_S3,
  ...CATALOG_S4,
  ...CATALOG_S5,
  ...CATALOG_S6,
  ...CATALOG_S7,
  ...CATALOG_W,
];

export const KNOWN_PROBE_IDS: ReadonlySet<string> = new Set(PROBE_CATALOG.map((e) => e.probeId));

/** Self-describing entry point (Probe Density Contract §3). */
export function probeCatalog(): ProbeCatalogEntry[] {
  return PROBE_CATALOG.slice();
}
