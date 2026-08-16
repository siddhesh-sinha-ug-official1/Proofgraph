/**
 * S2 — Capability connector / LSP transport ("just a wire" — probed and tested
 * as heavily as any feature, because this is the connector that dies).
 *
 * Consumes Tree 2's `capability(lang) → { tier, handle }`; never decides the
 * tier, only honors it. Negotiates positionEncoding (request utf-8; record what
 * the server accepts — the single value that governs every span map in S7/S4).
 *
 * SUB200 restructure: state/option types in ./conn-types.ts, the initialize
 * handshake in ./handshake.ts, the bounded retry loop in ./reconnect.ts.
 * This module remains the public path.
 */

import type { ProbeBus, ProbeEvent } from "../probe/probe-bus.js";
import { redactSecret } from "../probe/probe-bus.js";
import type { Capability, MessageTransports } from "../seams/capability.js";
import type { MessagePump } from "../lsp/pump.js";
import { DEFAULT_CONNECTOR_OPTIONS, type ConnState, type ConnectorOptions } from "./conn-types.js";
import { describeSafely, emitConnectProbes, runHandshake, scrubUrl } from "./handshake.js";
import { runReconnectAttempts } from "./reconnect.js";

export type { ServerCapabilitySummary, ConnState, ConnectorOptions } from "./conn-types.js";
export { DEFAULT_CONNECTOR_OPTIONS } from "./conn-types.js";

export class Connector {
  private probe: ProbeBus;
  private pump: MessagePump;
  private cap: Capability;
  private lang: string;
  private opts: ConnectorOptions;
  private transports: MessageTransports | null = null;
  private closeUnsub: (() => void) | null = null;
  private disposed = false;
  private reconnecting = false;
  private onReopenCb: (() => void) | null = null;
  readonly state: ConnState;

  constructor(
    probe: ProbeBus,
    pump: MessagePump,
    cap: Capability,
    lang: string,
    opts: Partial<ConnectorOptions> = {},
  ) {
    this.probe = probe;
    this.pump = pump;
    this.cap = cap;
    this.lang = lang;
    this.opts = { ...DEFAULT_CONNECTOR_OPTIONS, ...opts };
    this.state = {
      clientName: `proofgraph-${lang}`,
      lang,
      tier: cap.tier,
      phase: "idle",
      positionEncoding: "utf-16", // LSP default until negotiated
      serverCapabilities: null,
      serverInfo: null,
      reconnectAttempts: 0,
    };
  }

  /** Full connect: transport open → initialize → initialized. */
  async connect(causeId: string | null = null): Promise<void> {
    const capRef = emitConnectProbes(this.probe, this.cap, this.lang, causeId);
    await this.openTransportAndInit(capRef);
  }

  private async openTransportAndInit(causeRef: string): Promise<void> {
    this.state.phase = "connecting"; // "open" ONLY after the handshake completes
    const desc = describeSafely(this.cap);
    const openProbe = this.probe.emit(
      "editor.conn.transport.open",
      // URLs carry tokens in query strings in the common websocket-LSP setup:
      // scrub the query before it reaches any probe (review finding).
      { kind: this.cap.handle.kind, url: scrubUrl(desc.url), ...redactSecret(desc.secret) },
      causeRef,
    );
    const openRef = this.probe.ref(openProbe);
    this.probe.emit(
      "editor.conn.transport.state",
      { phase: "connecting", detail: `handle.connect() for ${this.state.clientName}` },
      openRef,
    );

    let transports: MessageTransports;
    try {
      transports = await this.cap.handle.connect();
    } catch (err) {
      this.state.phase = "error";
      this.probe.emit(
        "editor.conn.transport.state",
        { phase: "error", detail: String(err) },
        openRef,
      );
      this.probe.emit(
        "editor.conn.handshake.fail",
        { phase: "transport-open", message: String(err) },
        openRef,
      );
      throw err;
    }

    // Replace the tracked transport: unsubscribe the OLD wire's close
    // listener so a stale abandoned wire closing later can never tear down
    // this session (review finding), and track identity for the same reason.
    this.closeUnsub?.();
    this.transports = transports;
    this.probe.emit(
      "editor.conn.transport.state",
      { phase: "open", detail: `${transports.describe().kind}; handshake pending` },
      openRef,
    );
    const thisTransport = transports;
    this.closeUnsub = transports.onClose(() => this.handleTransportClosed(thisTransport));
    this.pump.attach(transports);

    try {
      await runHandshake(this.probe, this.pump, this.state, this.opts, openRef);
    } catch (err) {
      // Never abandon a half-open wire (review finding: orphaned transports
      // whose eventual close tore down healthy sessions).
      thisTransport.close();
      throw err;
    }
    this.state.phase = "open";
    this.probe.emit(
      "editor.conn.transport.state",
      { phase: "open", detail: "handshake complete; session live" },
      openRef,
    );
  }

  /** Called by the cell after reconnect+re-init succeeds (re-didOpen etc.). */
  onReopen(cb: () => void): void {
    this.onReopenCb = cb;
  }

  private handleTransportClosed(which: MessageTransports): void {
    // Only the CURRENT transport's death matters (stale abandoned wires are
    // ignored), only a fully-open session auto-reconnects (a close during a
    // handshake belongs to the attempt that owns it), and never while a
    // reconnect loop is already running or after dispose (review findings:
    // concurrent reconnect storms; healthy sessions torn down by stale wires).
    if (this.disposed || which !== this.transports || this.reconnecting) return;
    if (this.state.phase !== "open") return;
    this.state.phase = "closed";
    this.probe.emit(
      "editor.conn.transport.state",
      { phase: "closed", detail: "transport closed by peer or failure" },
      null,
    );
    void this.reconnectLoop();
  }

  /** At most ONE reconnect loop runs; attempts live in ./reconnect.ts. */
  private async reconnectLoop(): Promise<void> {
    if (this.reconnecting || this.disposed) return;
    this.reconnecting = true;
    try {
      await runReconnectAttempts({
        probe: this.probe,
        state: this.state,
        opts: this.opts,
        isDisposed: () => this.disposed,
        reopen: (causeRef) => this.openTransportAndInit(causeRef),
        notifyReopened: () => this.onReopenCb?.(),
      });
    } finally {
      this.reconnecting = false;
    }
  }

  dispose(): ProbeEvent {
    this.disposed = true;
    const ev = this.probe.emit("editor.conn.dispose", { clientName: this.state.clientName }, null);
    this.transports?.close();
    this.pump.detachAll();
    return ev;
  }

  snapshot(): ConnState {
    return { ...this.state };
  }
}
