/**
 * S3 inbound frame handling (SUB200 restructure: split from
 * MessagePump.handleIncoming / failAllPending, logic and probes verbatim).
 * The pump hands over a context of closures so its private state stays private.
 */

import type { ProbeBus, ProbeEvent } from "../probe/probe-bus.js";
import type { JsonRpcMessage } from "../seams/capability.js";
import type { PendingRequest, PublishDiagnosticsParams } from "./lsp-types.js";
import { featureResponsePayload } from "./feature-payloads.js";
import { RESPONSE_PROBE } from "./lsp-types.js";

export interface IncomingContext {
  probe: ProbeBus;
  pending: Map<number, PendingRequest>;
  inFlightCauseRef(): string | null;
  rawFrame(direction: "in" | "out", msg: JsonRpcMessage, causeId: string | null): ProbeEvent;
  send(msg: JsonRpcMessage): void;
  diagnostics(params: PublishDiagnosticsParams, causeRef: string): void;
}

/** Settle every pending request with a synthetic error + an error probe. */
export function failAllPending(
  probe: ProbeBus,
  pending: Map<number, PendingRequest>,
  why: string,
): void {
  for (const [id, p] of [...pending]) {
    pending.delete(id);
    probe.emit(
      "editor.lsp.error.protocol",
      {
        direction: "in",
        method: p.method,
        kind: "transportClosed",
        detail: `pending request ${id} (${p.method}) orphaned: ${why}`,
      },
      p.sentRef,
    );
    p.resolve({
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: `editor-shell: ${why} before response` },
    });
  }
}

export function handleIncomingCore(ctx: IncomingContext, msg: JsonRpcMessage): void {
  const { probe } = ctx;
  if (!msg || msg.jsonrpc !== "2.0" || (msg.id === undefined && !msg.method)) {
    probe.emit(
      "editor.lsp.error.protocol",
      { direction: "in", kind: "malformed", detail: "frame is not a JSON-RPC 2.0 message", frame: msg },
      ctx.inFlightCauseRef(),
    );
    return;
  }
  // Frames delivered synchronously inside one of our sends chain to that
  // send's raw frame (restores the keystroke→squiggle causal chain over
  // fast transports); asynchronous arrivals honestly carry null.
  const raw = ctx.rawFrame("in", msg, ctx.inFlightCauseRef());
  const rawRef = probe.ref(raw);

  // Response to one of our requests.
  if (msg.id !== undefined && msg.method === undefined) {
    const idNum = typeof msg.id === "number" ? msg.id : Number(msg.id);
    const pending = ctx.pending.get(idNum);
    if (!pending) {
      probe.emit(
        "editor.lsp.correlate.orphanResponse",
        { id: msg.id, reason: "response id was never sent or already resolved" },
        rawRef,
      );
      return;
    }
    ctx.pending.delete(idNum);
    const respProbe = probe.emit(
      "editor.lsp.in.response",
      {
        id: msg.id,
        method: pending.method,
        result: msg.result,
        error: msg.error,
        clockDelta: raw.logicalClock - pending.sentClock,
      },
      pending.sentRef,
    );
    const respRef = probe.ref(respProbe);
    const featureProbeId = RESPONSE_PROBE[pending.method];
    if (featureProbeId) {
      probe.emit(featureProbeId, featureResponsePayload(pending.method, msg), respRef);
    }
    probe.emit(
      "editor.lsp.timing.request",
      {
        id: msg.id,
        method: pending.method,
        clockDelta: respProbe.logicalClock - pending.sentClock,
      },
      respRef,
    );
    pending.resolve(msg);
    return;
  }

  // Server-initiated request (has both id and method).
  if (msg.id !== undefined && msg.method !== undefined) {
    if (msg.method === "workspace/configuration") {
      const items = (msg.params as { items?: unknown[] })?.items ?? [];
      probe.emit(
        "editor.lsp.in.configuration",
        { items, answered: items.map(() => ({})) },
        rawRef,
      );
      ctx.send({ jsonrpc: "2.0", id: msg.id, result: items.map(() => ({})) });
    } else {
      probe.emit(
        "editor.lsp.error.protocol",
        { direction: "in", method: msg.method, kind: "unhandled", detail: "server request we do not handle; answered MethodNotFound" },
        rawRef,
      );
      ctx.send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `method not handled by editor-shell: ${msg.method}` },
      });
    }
    return;
  }

  // Notification.
  switch (msg.method) {
    case "textDocument/publishDiagnostics": {
      const params = msg.params as PublishDiagnosticsParams;
      const diagProbe = probe.emit(
        "editor.lsp.in.diagnostics",
        {
          uri: params.uri,
          version: params.version ?? null,
          count: params.diagnostics.length,
          diagnostics: params.diagnostics.map((d) => ({
            range: d.range,
            severity: d.severity ?? null,
            message: d.message,
            source: d.source ?? null,
            code: d.code ?? null,
          })),
        },
        rawRef,
      );
      ctx.diagnostics(params, probe.ref(diagProbe));
      return;
    }
    case "$/progress": {
      const p = msg.params as { token?: unknown; value?: { kind?: string; message?: string } };
      probe.emit(
        "editor.lsp.in.progress",
        { token: p?.token, kind: p?.value?.kind ?? "report", message: p?.value?.message ?? null },
        rawRef,
      );
      return;
    }
    case "window/logMessage": {
      const p = msg.params as { type?: number; message?: string };
      probe.emit("editor.lsp.in.logMessage", { type: p?.type, message: p?.message }, rawRef);
      return;
    }
    case "window/showMessage": {
      const p = msg.params as { type?: number; message?: string };
      probe.emit("editor.lsp.in.showMessage", { type: p?.type, message: p?.message }, rawRef);
      return;
    }
    default:
      probe.emit(
        "editor.lsp.in.notification",
        { method: msg.method, params: msg.params },
        rawRef,
      );
      return;
  }
}
