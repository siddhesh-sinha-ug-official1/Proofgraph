/**
 * Tree 2 seam — capability(lang) → { tier, handle } (LOCAL STUB TYPES, shape
 * per build prompt §7.7(a); Tree 4 consumes, never constructs, a Capability —
 * Tree 2 owns the depth decision tree).
 *
 * `MessageTransports` here is the minimal reader/writer contract the pump (S3)
 * needs. At real-wiring time, vscode-ws-jsonrpc's reader/writer pair adapts to
 * this in a few lines (send ↔ writer.write, onMessage ↔ reader.listen).
 */

export type DepthTier = "CT" | "S" | "G" | "P"; // compiler-truth / structure / grammar / plaintext

export type JsonRpcId = number | string;

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MessageTransports {
  send(msg: JsonRpcMessage): void;
  onMessage(cb: (msg: JsonRpcMessage) => void): () => void;
  onClose(cb: () => void): () => void;
  close(): void;
  /** Human-readable transport description for probes (no secrets). */
  describe(): { kind: "websocket" | "worker" | "inmemory"; url?: string; secret?: string };
}

export interface LspHandle {
  kind: "websocket" | "worker" | "inmemory";
  connect(): Promise<MessageTransports>;
  languageId: string;
}

export interface Capability {
  tier: DepthTier;
  handle: LspHandle;
}

/** Provided by Tree 2 in the real system; tests inject a stub implementation. */
export type CapabilityFn = (lang: string) => Capability;
