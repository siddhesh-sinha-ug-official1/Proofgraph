/**
 * S3 per-feature probe payload builders (SUB200 restructure: split from
 * pump.ts, logic and payload shapes verbatim).
 */

import type { ProbeBus, ProbeEvent } from "../probe/probe-bus.js";
import type { JsonRpcMessage } from "../seams/capability.js";
import { REQUEST_PROBE } from "./lsp-types.js";

/** Emit the method-specific request probe (hover/definition/symbol/completion). */
export function emitFeatureRequestProbe(
  probe: ProbeBus,
  method: string,
  id: number,
  params: unknown,
  reqRef: string,
): void {
  const featureProbeId = REQUEST_PROBE[method];
  if (!featureProbeId) return;
  const p = params as { textDocument?: { uri?: string }; position?: unknown; context?: { triggerKind?: number } };
  probe.emit(
    featureProbeId,
    method === "textDocument/documentSymbol"
      ? { id, uri: p?.textDocument?.uri }
      : method === "textDocument/completion"
        ? { id, uri: p?.textDocument?.uri, position: p?.position, triggerKind: p?.context?.triggerKind ?? 1 }
        : { id, uri: p?.textDocument?.uri, position: p?.position },
    reqRef,
  );
}

/** Emit the method-specific outbound-notification probe; null if unlisted. */
export function emitNotifySpecificProbe(
  probe: ProbeBus,
  method: string,
  params: unknown,
  rawRef: string,
): ProbeEvent | null {
  let specific: ProbeEvent | null = null;
  const p = params as {
    textDocument?: { uri?: string; languageId?: string; version?: number; text?: string };
    contentChanges?: unknown[];
  };
  switch (method) {
    case "textDocument/didOpen":
      specific = probe.emit(
        "editor.lsp.out.didOpen",
        {
          uri: p?.textDocument?.uri,
          languageId: p?.textDocument?.languageId,
          version: p?.textDocument?.version,
          textLength: p?.textDocument?.text?.length ?? 0,
        },
        rawRef,
      );
      break;
    case "textDocument/didChange":
      specific = probe.emit(
        "editor.lsp.out.didChange",
        {
          version: p?.textDocument?.version,
          contentChanges: p?.contentChanges,
          incremental: Array.isArray(p?.contentChanges) && p.contentChanges.length > 0 &&
            typeof (p.contentChanges[0] as { range?: unknown })?.range !== "undefined",
        },
        rawRef,
      );
      break;
    case "textDocument/didClose":
      specific = probe.emit("editor.lsp.out.didClose", { uri: p?.textDocument?.uri }, rawRef);
      break;
    case "initialized":
      specific = probe.emit("editor.lsp.out.initialized", {}, rawRef);
      break;
    default:
      // Unlisted outbound notifications remain fully visible via raw.frame.
      break;
  }
  return specific;
}

export function featureResponsePayload(method: string, msg: JsonRpcMessage): unknown {
  const r = msg.result as never;
  switch (method) {
    case "textDocument/hover": {
      const h = r as { contents?: unknown; range?: unknown } | null;
      return { id: msg.id, contents: h?.contents ?? null, range: h?.range ?? null };
    }
    case "textDocument/definition": {
      const locs = (Array.isArray(r) ? r : r ? [r] : []) as { uri?: string; range?: unknown }[];
      return { id: msg.id, locations: locs.map((l) => ({ uri: l.uri, range: l.range })) };
    }
    case "textDocument/documentSymbol": {
      const syms = (Array.isArray(r) ? r : []) as {
        name?: string; kind?: number; range?: unknown; selectionRange?: unknown;
      }[];
      return {
        id: msg.id,
        symbols: syms.map((s) => ({
          name: s.name, kind: s.kind, range: s.range, selectionRange: s.selectionRange,
        })),
      };
    }
    case "textDocument/completion": {
      const c = r as { items?: unknown[]; isIncomplete?: boolean } | unknown[] | null;
      const items = Array.isArray(c) ? c : (c?.items ?? []);
      const isIncomplete = Array.isArray(c) ? false : (c?.isIncomplete ?? false);
      return { id: msg.id, itemCount: items.length, isIncomplete };
    }
    case "textDocument/semanticTokens/full": {
      const st = r as { data?: number[] } | null;
      return { id: msg.id, tokenCount: (st?.data?.length ?? 0) / 5, encoding: "relative-5-tuple" };
    }
    case "textDocument/foldingRange": {
      const ranges = (Array.isArray(r) ? r : []) as { startLine?: number; endLine?: number; kind?: string }[];
      return { id: msg.id, ranges: ranges.map((x) => ({ startLine: x.startLine, endLine: x.endLine, kind: x.kind ?? null })) };
    }
    default:
      return { id: msg.id };
  }
}
