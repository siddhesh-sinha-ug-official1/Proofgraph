/**
 * StubLanguageServer — the Tree 2 stand-in language server (transcript D1).
 *
 * Speaks real JSON-RPC 2.0 over a MessageTransports side, deterministically:
 * - initialize/initialized handshake with configurable positionEncoding
 *   ("accept-utf8" | "force-utf16" | "omit" = LSP default utf-16);
 * - diagnostics computed from PATTERN RULES against the CURRENT document text
 *   (so removing the error clears the squiggle, like a real checker);
 * - documentSymbol / hover / definition / completion / foldingRange /
 *   semanticTokens answered from fixture metadata + its own INDEPENDENT
 *   text→position math (a second implementation, so span agreement between
 *   server and cell is a real cross-check, not the same code twice);
 * - misbehavior switches for the failure-class tests: stale-version
 *   diagnostics, orphan responses, failing initial connects.
 *
 * All position math here converts through the NEGOTIATED encoding.
 *
 * SUB200 restructure: config types in ./stub-server-config.ts, the position
 * math + diagnostics builder in ./stub-server-text.ts, feature-request
 * handlers in ./stub-server-features.ts, the initialize handshake in
 * ./stub-server-init.ts. This module keeps its public path.
 */

import type { JsonRpcMessage, MessageTransports } from "../../src/seams/capability.js";
import {
  DEFAULT_STUB_SERVER_CONFIG,
  type DocState,
  type StubServerConfig,
} from "./stub-server-config.js";
import { buildDiagnostics, byteSpanToLspRange, wordAt } from "./stub-server-text.js";
import { handleFeatureRequest } from "./stub-server-features.js";
import { handleInitialize } from "./stub-server-init.js";

export type {
  DiagnosticRule,
  SymbolMeta,
  StubServerFixtureMeta,
  StubServerConfig,
} from "./stub-server-config.js";
export { DEFAULT_STUB_SERVER_CONFIG } from "./stub-server-config.js";

export class StubLanguageServer {
  readonly cfg: StubServerConfig;
  private transports: MessageTransports | null = null;
  /** @internal exposed for the feature-handler module. */
  doc: DocState | null = null;
  /** @internal negotiated encoding. */
  encoding: "utf-8" | "utf-16" = "utf-16";
  /** @internal exposed for the initialize-handler module. */
  initializeFailuresLeft: number;
  private nextServerRequestId = 1000;
  readonly log: JsonRpcMessage[] = [];

  constructor(cfg: Partial<StubServerConfig> = {}) {
    this.cfg = {
      ...DEFAULT_STUB_SERVER_CONFIG,
      ...cfg,
      meta: { ...DEFAULT_STUB_SERVER_CONFIG.meta, ...(cfg.meta ?? {}) },
      advertise: { ...DEFAULT_STUB_SERVER_CONFIG.advertise, ...(cfg.advertise ?? {}) },
      behaviors: { ...DEFAULT_STUB_SERVER_CONFIG.behaviors, ...(cfg.behaviors ?? {}) },
    };
    this.initializeFailuresLeft = this.cfg.behaviors.failInitializeTimes;
  }

  attach(serverSide: MessageTransports): void {
    this.transports = serverSide;
    serverSide.onMessage((msg) => this.handle(msg));
  }

  /** Drop the wire mid-session (reconnect test). */
  dropTransport(): void {
    this.transports?.close();
  }

  currentDocVersion(): number | null {
    return this.doc?.version ?? null;
  }

  /** @internal exposed for the initialize-handler module. */
  send(msg: JsonRpcMessage): void {
    this.log.push(msg);
    this.transports?.send(msg);
  }

  /** @internal exposed for the feature-handler module. */
  respond(id: JsonRpcMessage["id"], result: unknown): void {
    this.send({ jsonrpc: "2.0", id, result });
  }

  private handle(msg: JsonRpcMessage): void {
    if (msg.method === "initialize") {
      handleInitialize(this, msg);
      return;
    }
    if (handleFeatureRequest(this, msg)) return;

    switch (msg.method) {
      case "initialized":
        if (this.cfg.behaviors.requestConfiguration) {
          this.send({
            jsonrpc: "2.0",
            id: this.nextServerRequestId++,
            method: "workspace/configuration",
            params: { items: [{ section: "python.analysis" }] },
          });
        }
        return;
      case "textDocument/didOpen": {
        const p = msg.params as {
          textDocument: { uri: string; text: string; version: number };
        };
        this.doc = { uri: p.textDocument.uri, text: p.textDocument.text, version: p.textDocument.version };
        if (this.cfg.behaviors.progressOnOpen) {
          this.send({ jsonrpc: "2.0", method: "window/logMessage", params: { type: 3, message: "stub server: indexing" } });
          this.send({ jsonrpc: "2.0", method: "$/progress", params: { token: "idx-1", value: { kind: "begin", message: "indexing" } } });
          this.send({ jsonrpc: "2.0", method: "$/progress", params: { token: "idx-1", value: { kind: "end", message: "done" } } });
        }
        this.publishDiagnostics();
        return;
      }
      case "textDocument/didChange": {
        const p = msg.params as {
          textDocument: { uri: string; version: number };
          contentChanges: { text: string }[];
        };
        if (!this.doc) return;
        const stalePrevText = this.doc.text;
        const stalePrevVersion = this.doc.version;
        this.doc.version = p.textDocument.version;
        this.doc.text = p.contentChanges[p.contentChanges.length - 1]?.text ?? this.doc.text;
        if (this.cfg.behaviors.staleOnNextChange) {
          this.cfg.behaviors.staleOnNextChange = false;
          // A slow checker publishing against the PREVIOUS snapshot.
          this.publishDiagnosticsFor(stalePrevText, stalePrevVersion);
        }
        this.publishDiagnostics();
        return;
      }
      case "textDocument/didClose":
        this.doc = null;
        return;
      case "shutdown":
        this.respond(msg.id, null);
        return;
      case "exit":
        return;
      default:
        if (msg.id !== undefined) {
          this.send({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: -32601, message: `stub server: unhandled method ${msg.method}` },
          });
        }
        return;
    }
  }

  /** Absolute file byte span (incl. BOM) → LSP range in the negotiated encoding. */
  byteSpanToRange(byteStart: number, byteEnd: number): ReturnType<typeof byteSpanToLspRange> {
    return byteSpanToLspRange(
      this.doc?.text ?? "",
      this.cfg.meta.bomBytes,
      byteStart,
      byteEnd,
      this.encoding,
    );
  }

  /** @internal word under the request's position, in the negotiated encoding. */
  wordAtParams(params: unknown): ReturnType<typeof wordAt> {
    const p = params as { position?: { line: number; character: number } };
    if (!this.doc || !p.position) return null;
    return wordAt(this.doc.text, p.position, this.encoding);
  }

  private publishDiagnostics(): void {
    if (!this.doc) return;
    this.publishDiagnosticsFor(this.doc.text, this.doc.version);
  }

  private publishDiagnosticsFor(text: string, version: number): void {
    if (!this.doc) return;
    const diagnostics = buildDiagnostics(
      text,
      this.cfg.meta.diagnosticRules,
      this.cfg.name,
      this.doc.uri,
      this.encoding,
    );
    this.send({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: this.doc.uri, version, diagnostics },
    });
  }
}
