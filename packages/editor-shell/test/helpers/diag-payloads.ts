/**
 * S4 diagnostics-test probe payload shapes (SUB200 restructure: split from
 * 02-diagnostics-span.test.ts, verbatim).
 */

export interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}
export interface MonacoRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
export interface MapSpanPayload {
  diagId: string;
  lspRange: LspRange;
  monacoRange: MonacoRange;
  byteStart: number;
  byteEnd: number;
  positionEncoding: string;
}
export interface MarkerSetPayload {
  diagId: string;
  monacoRange: MonacoRange;
  severity: string;
  message: string;
  source: string | null;
  code: string | number | null;
}
