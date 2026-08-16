/**
 * Cell configuration types + defaults (SUB200 restructure: split from
 * cell.ts, verbatim).
 */

import type { SchemaNode } from "../schema/schema.js";
import type { CapabilityFn } from "../seams/capability.js";
import type { SelectionBus } from "../seams/bus.js";
import type { EditorAdapter } from "../mount/adapter.js";
import type { MountConfig } from "../mount/mount.js";
import type { ConnectorOptions } from "../conn/connector.js";

export interface CellConfig {
  adapter: EditorAdapter;
  capability: CapabilityFn;
  bus: SelectionBus;
  schemaNodes: SchemaNode[];
  file: {
    uri: string;
    bytes: Uint8Array;
    languageId: string;
    /** Schema language for capability lookup (may differ from editor languageId). */
    lang: string;
  };
  mount?: Partial<MountConfig>;
  connector?: Partial<ConnectorOptions>;
  /** Inject () => null for byte-identical histories across runs. */
  wallClock?: () => number | null;
}

export const DEFAULT_MOUNT: MountConfig = {
  fontFamily: "JetBrains Mono",
  fontLigatures: true,
  theme: "proofgraph-darcula",
  requestedPositionEncoding: "utf-8",
  readOnly: false,
};

export function clockOfRef(ref: string): number {
  return Number(ref.slice(ref.lastIndexOf("@") + 1));
}
