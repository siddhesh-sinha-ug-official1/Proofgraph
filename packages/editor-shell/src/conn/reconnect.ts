/**
 * S2 bounded reconnect attempts (SUB200 restructure: split from
 * Connector.reconnectLoop, logic and probes verbatim). The single-loop guard
 * (`reconnecting`) stays in the Connector, wrapping this in try/finally.
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { ConnState, ConnectorOptions } from "./conn-types.js";

export interface ReconnectHost {
  probe: ProbeBus;
  state: ConnState;
  opts: ConnectorOptions;
  isDisposed(): boolean;
  /** Re-run transport open + handshake, causally chained to the reconnect probe. */
  reopen(causeRef: string): Promise<void>;
  /** The cell's onReopen callback (re-didOpen etc.). */
  notifyReopened(): void;
}

/**
 * Bounded reconnect: the retry bound is a CAP and is logged on every attempt
 * (Operating Contract rule 8 — no silent give-up).
 */
export async function runReconnectAttempts(host: ReconnectHost): Promise<void> {
  for (let attempt = 1; attempt <= host.opts.maxReconnectAttempts; attempt++) {
    if (host.isDisposed()) return;
    host.state.reconnectAttempts = attempt;
    const backoffMs =
      host.opts.backoffMs[Math.min(attempt - 1, host.opts.backoffMs.length - 1)] ?? 0;
    const rp = host.probe.emit(
      "editor.conn.reconnect",
      { attempt, maxAttempts: host.opts.maxReconnectAttempts, backoffMs },
      null,
    );
    if (backoffMs > 0) await new Promise((r) => setTimeout(r, backoffMs));
    if (host.isDisposed()) return; // disposed during backoff: stop cold (review finding)
    try {
      await host.reopen(host.probe.ref(rp));
      host.notifyReopened();
      return;
    } catch (err) {
      // handshake.fail / transport.state error probes already emitted inside;
      // log the attempt-level failure for completeness.
      host.probe.emit("editor.conn.transport.state",
        { phase: "reconnect-attempt-error", attempt, detail: String(err) }, null);
    }
  }
  host.state.phase = "closed";
  host.probe.emit(
    "editor.conn.transport.state",
    {
      phase: "closed",
      detail: `reconnect cap reached (${host.opts.maxReconnectAttempts} attempts) — giving up LOUDLY, not silently`,
    },
    null,
  );
}
