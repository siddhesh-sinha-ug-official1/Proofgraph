/**
 * S2 connector state/option types (SUB200 restructure: split from
 * connector.ts, verbatim).
 */

import type { Capability } from "../seams/capability.js";
import type { PositionEncoding } from "../map/span-index.js";

export interface ServerCapabilitySummary {
  hoverProvider: boolean;
  definitionProvider: boolean;
  documentSymbolProvider: boolean;
  callHierarchyProvider: boolean;
  typeHierarchyProvider: boolean;
  semanticTokensProvider: boolean;
  completionProvider: boolean;
  foldingRangeProvider: boolean;
}

export interface ConnState {
  clientName: string;
  lang: string;
  tier: Capability["tier"];
  phase: "idle" | "connecting" | "open" | "closed" | "error";
  positionEncoding: PositionEncoding;
  serverCapabilities: ServerCapabilitySummary | null;
  serverInfo: { name: string; version: string } | null;
  reconnectAttempts: number;
}

export interface ConnectorOptions {
  maxReconnectAttempts: number;
  backoffMs: number[];
  requestedPositionEncoding: "utf-8";
}

export const DEFAULT_CONNECTOR_OPTIONS: ConnectorOptions = {
  maxReconnectAttempts: 3,
  backoffMs: [0, 0, 0],
  requestedPositionEncoding: "utf-8",
};
