/**
 * S3 message-pump types + per-feature probe tables (SUB200 restructure: split
 * from pump.ts, verbatim).
 */

export interface PendingRequest {
  id: number;
  method: string;
  sentClock: number;
  sentRef: string;
  resolve: (msg: import("../seams/capability.js").JsonRpcMessage) => void;
}

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: 1 | 2 | 3 | 4;
  message: string;
  source?: string;
  code?: string | number;
  tags?: number[];
  relatedInformation?: { location: { uri: string; range: unknown }; message: string }[];
  data?: unknown;
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: LspDiagnostic[];
}

/** Request probes per feature method (§6 per-feature LSP leads).
 *  (Doc fix, adversarial claim audit: this comment previously said
 *  "Response probes" over the REQUEST table.) */
export const REQUEST_PROBE: Record<string, string> = {
  "textDocument/hover": "editor.lsp.hover.request",
  "textDocument/definition": "editor.lsp.definition.request",
  "textDocument/documentSymbol": "editor.lsp.documentSymbol.request",
  "textDocument/completion": "editor.lsp.completion.request",
};
/** Response probes per feature method. */
export const RESPONSE_PROBE: Record<string, string> = {
  "textDocument/hover": "editor.lsp.hover.response",
  "textDocument/definition": "editor.lsp.definition.response",
  "textDocument/documentSymbol": "editor.lsp.documentSymbol.response",
  "textDocument/completion": "editor.lsp.completion.response",
  "textDocument/semanticTokens/full": "editor.lsp.semanticTokens.response",
  "textDocument/foldingRange": "editor.lsp.foldingRange.response",
};
