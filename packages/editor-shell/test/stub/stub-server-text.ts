/**
 * StubLanguageServer's INDEPENDENT text→position math + diagnostics builder
 * (SUB200 restructure: split from stub-server.ts, logic verbatim). A second
 * implementation on purpose — span agreement between server and cell is a
 * real cross-check, not the same code twice. All conversions honor the
 * NEGOTIATED encoding.
 */

import type { DiagnosticRule, SymbolMeta } from "./stub-server-config.js";

export type StubEncoding = "utf-8" | "utf-16";

/** Byte offset relative to the DOCUMENT TEXT (bom already stripped upstream). */
export function textOffsetToPosition(
  text: string,
  offset: number,
  encoding: StubEncoding,
): { line: number; character: number } {
  const enc = new TextEncoder();
  let line = 0;
  let lineStartUtf16 = 0;
  let consumedBytes = 0;
  let i = 0;
  while (i < text.length) {
    if (consumedBytes >= offset) break;
    const cp = text.codePointAt(i)!;
    const units = cp > 0xffff ? 2 : 1;
    const bytes = enc.encode(String.fromCodePoint(cp)).length;
    if (consumedBytes + bytes > offset) break;
    consumedBytes += bytes;
    if (cp === 10) {
      line++;
      lineStartUtf16 = i + 1;
    }
    i += units;
  }
  const character =
    encoding === "utf-16"
      ? i - lineStartUtf16
      : enc.encode(text.slice(lineStartUtf16, i)).length;
  return { line, character };
}

/** Absolute file byte span (incl. BOM) → LSP range in the negotiated encoding. */
export function byteSpanToLspRange(
  text: string,
  bomBytes: number,
  byteStart: number,
  byteEnd: number,
  encoding: StubEncoding,
): {
  start: { line: number; character: number };
  end: { line: number; character: number };
} {
  return {
    start: textOffsetToPosition(text, byteStart - bomBytes, encoding),
    end: textOffsetToPosition(text, byteEnd - bomBytes, encoding),
  };
}

export function wordAt(
  text: string,
  position: { line: number; character: number },
  encoding: StubEncoding,
): {
  text: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
} | null {
  const lines = text.split("\n");
  const lineText = (lines[position.line] ?? "").replace(/\r$/, "");
  // Convert incoming character (negotiated encoding) to a utf-16 index.
  let charIdx: number;
  if (encoding === "utf-16") {
    charIdx = position.character;
  } else {
    const enc = new TextEncoder();
    let bytes = 0;
    let i = 0;
    while (i < lineText.length && bytes < position.character) {
      const cp = lineText.codePointAt(i)!;
      bytes += enc.encode(String.fromCodePoint(cp)).length;
      i += cp > 0xffff ? 2 : 1;
    }
    charIdx = i;
  }
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText)) !== null) {
    if (m.index <= charIdx && charIdx <= m.index + m[0].length) {
      const startChar =
        encoding === "utf-16"
          ? m.index
          : new TextEncoder().encode(lineText.slice(0, m.index)).length;
      const endChar =
        encoding === "utf-16"
          ? m.index + m[0].length
          : new TextEncoder().encode(lineText.slice(0, m.index + m[0].length)).length;
      return {
        text: m[0],
        range: {
          start: { line: position.line, character: startChar },
          end: { line: position.line, character: endChar },
        },
      };
    }
  }
  return null;
}

/** utf-16 string index → LSP position in the NEGOTIATED encoding. */
export function utf16IndexToPosition(
  text: string,
  index: number,
  encoding: StubEncoding,
): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  const prefix = text.slice(lineStart, index).replace(/\r$/, "");
  const character =
    encoding === "utf-16" ? prefix.length : new TextEncoder().encode(prefix).length;
  return { line, character };
}

/** Diagnostics computed from PATTERN RULES against the given document text. */
export function buildDiagnostics(
  text: string,
  rules: DiagnosticRule[],
  serverName: string,
  uri: string,
  encoding: StubEncoding,
): unknown[] {
  const diagnostics: unknown[] = [];
  for (const rule of rules) {
    let from = 0;
    while (true) {
      const at = text.indexOf(rule.pattern, from);
      if (at === -1) break;
      from = at + rule.pattern.length;
      const start = utf16IndexToPosition(text, at, encoding);
      const end = utf16IndexToPosition(text, at + rule.pattern.length, encoding);
      const diag: Record<string, unknown> = {
        range: { start, end },
        severity: rule.severity,
        message: rule.message,
        source: rule.source ?? serverName,
        code: rule.code,
      };
      if (rule.tags) diag.tags = rule.tags;
      if (rule.quickfix) diag.data = { quickfix: true };
      if (rule.relatedPattern) {
        const rel = text.indexOf(rule.relatedPattern);
        if (rel !== -1) {
          diag.relatedInformation = [
            {
              location: {
                uri,
                range: {
                  start: utf16IndexToPosition(text, rel, encoding),
                  end: utf16IndexToPosition(text, rel + rule.relatedPattern.length, encoding),
                },
              },
              message: rule.relatedMessage ?? "related location",
            },
          ];
        }
      }
      diagnostics.push(diag);
    }
  }
  return diagnostics;
}

export function collectNames(symbols: SymbolMeta[]): string[] {
  const out: string[] = [];
  for (const s of symbols) {
    out.push(s.name);
    if (s.children) out.push(...collectNames(s.children));
  }
  return out;
}
