/**
 * The exhaustive probe catalog — §6 of the Tree 4 build prompt (ids/order
 * transcribed 1:1; payloadType field lists that had drifted from the emitted
 * payloads were refreshed in the adversarial claim audit — see the
 * section-module headers). Every lead the cell can emit
 * is enumerated here; ProbeBus.emit throws on any probeId absent from this
 * list, so catalog and reality cannot drift apart.
 *
 * probeId convention: editor.<stage>.<thing>.<detail>
 * stage ∈ mount | buffer | conn | lsp | diag | verdict | select | map | render | probe | gate | wall
 * (wall added ASSEMBLY Phase 1 — leads for wall-face decisions; additive only,
 * the catalog never shrinks.)
 * Firehose leads are marked firehose:true — emitted in full, never sampled (§6.12).
 *
 * SUB200 restructure: the section entries live in ./catalog/ (one module per
 * stage group, verbatim); this module assembles them IN THE ORIGINAL ORDER —
 * the assembled catalog is element-for-element identical to the old single
 * file (same ids, same order, 128 entries).
 */

export type { ProbeKind, ProbeSpec } from "./catalog/spec.js";
import type { ProbeSpec } from "./catalog/spec.js";
import { MOUNT_PROBES, BUFFER_PROBES } from "./catalog/mount-buffer.js";
import { CONN_PROBES, LSP_PROBES } from "./catalog/conn-lsp.js";
import { DIAG_PROBES, VERDICT_PROBES } from "./catalog/diag-verdict.js";
import { SELECT_PROBES, MAP_PROBES } from "./catalog/select-map.js";
import {
  RENDER_PROBES,
  PROBE_PROBES,
  GATE_PROBES,
  WALL_PROBES,
} from "./catalog/render-gate-wall.js";

export const PROBE_CATALOG: ProbeSpec[] = [
  ...MOUNT_PROBES,
  ...BUFFER_PROBES,
  ...CONN_PROBES,
  ...LSP_PROBES,
  ...DIAG_PROBES,
  ...VERDICT_PROBES,
  ...SELECT_PROBES,
  ...MAP_PROBES,
  ...RENDER_PROBES,
  ...PROBE_PROBES,
  ...GATE_PROBES,
  ...WALL_PROBES,
];

export const FIREHOSE_IDS = PROBE_CATALOG.filter((s) => s.firehose).map((s) => s.probeId);
