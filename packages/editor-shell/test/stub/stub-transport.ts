/**
 * In-memory MessageTransports pair — synchronous, FIFO, deterministic delivery
 * (Probe Density rule 6: same input → same probe stream). `close()` on either
 * side fires onClose on both, which is how the reconnect test (§9.16) drops
 * the wire mid-session.
 */

import type { JsonRpcMessage, MessageTransports } from "../../src/seams/capability.js";

type Handler = (msg: JsonRpcMessage) => void;

class Side implements MessageTransports {
  private peer: Side | null = null;
  private handlers: Handler[] = [];
  private closeHandlers: Array<() => void> = [];
  closed = false;
  readonly sent: JsonRpcMessage[] = [];
  readonly received: JsonRpcMessage[] = [];
  private desc: { kind: "inmemory"; url?: string; secret?: string };

  constructor(desc: { url?: string; secret?: string } = {}) {
    this.desc = { kind: "inmemory", ...desc };
  }

  bind(peer: Side): void {
    this.peer = peer;
  }

  send(msg: JsonRpcMessage): void {
    if (this.closed) return;
    this.sent.push(msg);
    // Deep-copy through JSON, matching a real wire (no shared references).
    const wire = JSON.parse(JSON.stringify(msg)) as JsonRpcMessage;
    this.peer?.deliver(wire);
  }

  private deliver(msg: JsonRpcMessage): void {
    if (this.closed) return;
    this.received.push(msg);
    for (const h of [...this.handlers]) h(msg);
  }

  onMessage(cb: Handler): () => void {
    this.handlers.push(cb);
    return () => {
      const i = this.handlers.indexOf(cb);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }

  onClose(cb: () => void): () => void {
    this.closeHandlers.push(cb);
    return () => {
      const i = this.closeHandlers.indexOf(cb);
      if (i >= 0) this.closeHandlers.splice(i, 1);
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const h of [...this.closeHandlers]) h();
    this.peer?.closeFromPeer();
  }

  private closeFromPeer(): void {
    if (this.closed) return;
    this.closed = true;
    for (const h of [...this.closeHandlers]) h();
  }

  describe(): { kind: "inmemory"; url?: string; secret?: string } {
    return { ...this.desc };
  }
}

export function createTransportPair(desc: { url?: string; secret?: string } = {}): {
  clientSide: MessageTransports;
  serverSide: MessageTransports;
} {
  const a = new Side(desc);
  const b = new Side(desc);
  a.bind(b);
  b.bind(a);
  return { clientSide: a, serverSide: b };
}
