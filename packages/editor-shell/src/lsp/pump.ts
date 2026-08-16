/**
 * S3 — LSP message pump (the firehose).
 *
 * Every JSON-RPC frame in and out passes through here. Owns request→response
 * correlation (by JSON-RPC id) and per-request timing. Emits a probe per
 * direction per message PLUS a raw-frame firehose — never sampled (§6.12).
 *
 * SUB200 restructure: inbound frame handling lives in ./incoming.ts, the
 * per-feature payload builders in ./feature-payloads.ts, shared types in
 * ./lsp-types.ts. This module remains the public path.
 */

import type { ProbeBus, ProbeEvent } from "../probe/probe-bus.js";
import type { JsonRpcMessage, MessageTransports } from "../seams/capability.js";
import type { PendingRequest, PublishDiagnosticsParams } from "./lsp-types.js";
import { emitFeatureRequestProbe, emitNotifySpecificProbe } from "./feature-payloads.js";
import { failAllPending, handleIncomingCore, type IncomingContext } from "./incoming.js";

export type { LspDiagnostic, PublishDiagnosticsParams } from "./lsp-types.js";

export class MessagePump {
  private probe: ProbeBus;
  private transports: MessageTransports | null = null;
  private transportClosed = false;
  private nextId = 0;
  private pending = new Map<number, PendingRequest>();
  private detach: (() => void)[] = [];
  /** Causal ref of the outbound frame currently being sent — inbound frames
   *  delivered synchronously during that send chain to it (keystroke→squiggle
   *  chain integrity; null for asynchronous arrivals, honestly). */
  private inFlightCauseRef: string | null = null;
  private diagnosticsHandler:
    | ((params: PublishDiagnosticsParams, causeRef: string) => void)
    | null = null;

  constructor(probe: ProbeBus) {
    this.probe = probe;
  }

  /** Closure context handed to the inbound handler — privates stay private. */
  private incomingCtx(): IncomingContext {
    return {
      probe: this.probe,
      pending: this.pending,
      inFlightCauseRef: () => this.inFlightCauseRef,
      rawFrame: (direction, msg, causeId) => this.rawFrame(direction, msg, causeId),
      send: (msg) => this.transports?.send(msg),
      diagnostics: (params, causeRef) => this.diagnosticsHandler?.(params, causeRef),
    };
  }

  attach(transports: MessageTransports): void {
    this.detachAll();
    this.transports = transports;
    this.transportClosed = false;
    this.detach.push(transports.onMessage((msg) => handleIncomingCore(this.incomingCtx(), msg)));
    this.detach.push(
      transports.onClose(() => {
        this.transportClosed = true;
        failAllPending(this.probe, this.pending, "transport closed");
      }),
    );
  }

  detachAll(): void {
    for (const d of this.detach) d();
    this.detach = [];
    // A pending request can never be answered once we leave this transport:
    // settle each one LOUDLY instead of letting awaiters hang forever
    // (review finding: cell.hover() awaited a dead wire indefinitely).
    failAllPending(this.probe, this.pending, "pump detached from transport");
    this.transports = null;
    this.transportClosed = false;
  }

  private canSend(): boolean {
    return this.transports !== null && !this.transportClosed;
  }

  onDiagnostics(handler: (params: PublishDiagnosticsParams, causeRef: string) => void): void {
    this.diagnosticsHandler = handler;
  }

  private rawFrame(direction: "in" | "out", msg: JsonRpcMessage, causeId: string | null): ProbeEvent {
    const json = JSON.stringify(msg);
    return this.probe.emit(
      "editor.lsp.raw.frame",
      { direction, bytes: json.length, json: msg },
      causeId,
    );
  }

  request(method: string, params: unknown, causeId: string | null = null): Promise<JsonRpcMessage> {
    if (!this.canSend()) {
      // No probes claiming a send that cannot happen — one loud error lead,
      // and the caller gets a settled error response, never a hang.
      this.probe.emit(
        "editor.lsp.error.protocol",
        {
          direction: "out",
          method,
          kind: "sendWhileDisconnected",
          detail: "request attempted while transport is closed/absent; not sent",
        },
        causeId,
      );
      return Promise.resolve({
        jsonrpc: "2.0",
        id: -1,
        error: { code: -32002, message: "editor-shell: transport disconnected; request not sent" },
      });
    }
    const id = ++this.nextId;
    const msg: JsonRpcMessage = { jsonrpc: "2.0", id, method, params };
    const raw = this.rawFrame("out", msg, causeId);
    const reqProbe = this.probe.emit(
      "editor.lsp.out.request",
      { id, method, params },
      this.probe.ref(raw),
    );
    emitFeatureRequestProbe(this.probe, method, id, params, this.probe.ref(reqProbe));
    return new Promise((resolve) => {
      this.pending.set(id, {
        id,
        method,
        sentClock: reqProbe.logicalClock,
        sentRef: this.probe.ref(reqProbe),
        resolve,
      });
      const prev = this.inFlightCauseRef;
      this.inFlightCauseRef = this.probe.ref(raw);
      try {
        this.transports!.send(msg);
      } finally {
        this.inFlightCauseRef = prev;
      }
    });
  }

  /** Returns the method-specific probe (or the raw frame probe) for chaining. */
  notify(method: string, params: unknown, causeId: string | null = null): ProbeEvent {
    if (!this.canSend()) {
      // Never throw from here — this runs inside the buffer edit path, and a
      // disconnected wire must not break typing (review finding).
      return this.probe.emit(
        "editor.lsp.error.protocol",
        {
          direction: "out",
          method,
          kind: "sendWhileDisconnected",
          detail: "notification attempted while transport is closed/absent; not sent",
        },
        causeId,
      );
    }
    const msg: JsonRpcMessage = { jsonrpc: "2.0", method, params };
    const raw = this.rawFrame("out", msg, causeId);
    const rawRef = this.probe.ref(raw);
    const specific = emitNotifySpecificProbe(this.probe, method, params, rawRef);
    const prev = this.inFlightCauseRef;
    this.inFlightCauseRef = rawRef;
    try {
      this.transports!.send(msg);
    } finally {
      this.inFlightCauseRef = prev;
    }
    return specific ?? raw;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  snapshot(): unknown {
    return {
      attached: this.transports !== null,
      nextId: this.nextId,
      pending: [...this.pending.values()].map((pd) => ({ id: pd.id, method: pd.method })),
    };
  }
}
