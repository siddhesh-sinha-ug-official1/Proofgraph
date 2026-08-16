/**
 * S7 text geometry — the pure byte/line/column math under the SpanIndex
 * (SUB200 restructure: split from span-index.ts, logic verbatim).
 *
 * All functions operate over a TextGeometry: the line table plus the file's
 * BOM byte count and storage encoding.
 *
 * Conventions (transcript D4):
 * - Schema spans are ABSOLUTE file byte offsets (BOM bytes included), measured
 *   in the FILE'S OWN ENCODING (utf-8 / latin1 / utf-16) — the index is
 *   encoding-aware end to end (review finding: utf-8-only math desynced
 *   latin1/utf-16 files with no mismatch probe).
 * - Model text has the BOM stripped; converters add/subtract `bomBytes`.
 * - Positions are 1-based {line, column}, column in UTF-16 code units.
 * - LSP positions are 0-based; `character` counts utf-8 bytes OF THE TEXT in
 *   utf-8 mode, utf-16 code units otherwise, and is CLAMPED to the line length
 *   per the LSP spec in both modes.
 * - Span byteEnd is exclusive. Spans past EOF are clamped LOUDLY
 *   (editor.map.span.clamped), never silently absorbed.
 */

import type { Pos } from "../mount/adapter.js";
import { utf8ByteLength, type EncodingName } from "../util/encoding.js";

export type PositionEncoding = "utf-8" | "utf-16";

export interface LineEntry {
  /** FILE-encoding byte offset of line start relative to model text start. */
  startByte: number;
  /** UTF-16 offset of line start into the model text. */
  startUtf16: number;
  /** Line text WITHOUT its EOL terminator. */
  text: string;
  /** FILE-encoding byte length of the EOL terminator (0 for last line). */
  eolBytes: number;
}

export interface TextGeometry {
  lines: LineEntry[];
  bomBytes: number;
  encoding: EncodingName;
}

/** FILE-encoding byte length of a text fragment. */
export function byteLen(g: TextGeometry, s: string): number {
  switch (g.encoding) {
    case "latin1":
      return s.length; // ISO-8859-1: one byte per code unit by construction
    case "utf-16le":
    case "utf-16be":
      return s.length * 2; // two bytes per UTF-16 code unit (surrogates = 2 units)
    default:
      return utf8ByteLength(s);
  }
}

/** FILE-encoding byte width of one code point (given its utf-16 unit count). */
export function byteLenOfCodePoint(g: TextGeometry, cp: number, units: number): number {
  switch (g.encoding) {
    case "latin1":
      return units; // decoded latin1 text has only single-unit chars
    case "utf-16le":
    case "utf-16be":
      return units * 2;
    default:
      return cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
  }
}

export function buildLineIndex(text: string, encoding: EncodingName): LineEntry[] {
  const g: TextGeometry = { lines: [], bomBytes: 0, encoding };
  const lines: LineEntry[] = [];
  let startByte = 0;
  let startUtf16 = 0;
  let i = 0;
  while (true) {
    const j = text.indexOf("\n", i);
    if (j === -1) {
      lines.push({ startByte, startUtf16, text: text.slice(i), eolBytes: 0 });
      break;
    }
    const crlf = j > i && text.charCodeAt(j - 1) === 13;
    const lineText = text.slice(i, crlf ? j - 1 : j);
    const eolBytes = byteLen(g, crlf ? "\r\n" : "\n");
    lines.push({ startByte, startUtf16, text: lineText, eolBytes });
    startByte += byteLen(g, lineText) + eolBytes;
    startUtf16 += lineText.length + (crlf ? 2 : 1);
    i = j + 1;
  }
  return lines;
}

export interface ByteToPosCore {
  pos: Pos;
  midCodepoint: boolean;
  roundTripByte: number;
  naiveColumn: number;
  char: string;
}

/** Shared conversion core: byte → position + desync evidence. */
export function byteToPosCore(g: TextGeometry, absByteOffset: number): ByteToPosCore {
  const target = Math.max(0, absByteOffset - g.bomBytes);
  let lo = 0;
  let hi = g.lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g.lines[mid].startByte <= target) lo = mid;
    else hi = mid - 1;
  }
  const line = g.lines[lo];
  let remaining = target - line.startByte;
  // The naive "bytes are columns" reading — what a desynced consumer would
  // report; surfaced in the mismatch payload so the off-by-N is visible.
  const naiveColumn = remaining + 1;
  let column = 1;
  let idx = 0;
  let midCodepoint = false;
  while (remaining > 0 && idx < line.text.length) {
    const cp = line.text.codePointAt(idx)!;
    const cpUnits = cp > 0xffff ? 2 : 1;
    const cpBytes = byteLenOfCodePoint(g, cp, cpUnits);
    if (remaining < cpBytes) {
      midCodepoint = true;
      break;
    }
    remaining -= cpBytes;
    idx += cpUnits;
    column += cpUnits;
  }
  const pos: Pos = { line: lo + 1, column };
  const roundTripByte = posToByteInternal(g, pos);
  return {
    pos,
    midCodepoint,
    roundTripByte,
    naiveColumn,
    char: line.text.slice(Math.max(0, idx), idx + 2),
  };
}

export function posToByteInternal(g: TextGeometry, pos: Pos): number {
  const line = g.lines[Math.min(pos.line, g.lines.length) - 1];
  const prefix = line.text.slice(0, Math.max(0, pos.column - 1));
  return g.bomBytes + line.startByte + byteLen(g, prefix);
}

/**
 * LSP {line, character} (0-based, in `enc`) → absolute file byte offset.
 * utf-8 mode: character counts utf-8 bytes OF THE TEXT within the line;
 * utf-16 mode: code units. Both CLAMP to the line length per the LSP spec
 * (review finding: the utf-8 branch was unclamped and walked past EOL).
 */
export function lspPositionToByteCore(
  g: TextGeometry,
  lspLine: number,
  character: number,
  enc: PositionEncoding,
): number {
  const line = g.lines[Math.max(0, Math.min(lspLine, g.lines.length - 1))];
  let utf16Index: number;
  if (enc === "utf-8") {
    // Walk code points until `character` utf-8 TEXT bytes are consumed,
    // clamping at end-of-line.
    let bytes = 0;
    let i = 0;
    while (i < line.text.length && bytes < character) {
      const cp = line.text.codePointAt(i)!;
      const cpUnits = cp > 0xffff ? 2 : 1;
      const cpBytes = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
      if (bytes + cpBytes > character) break; // mid-codepoint request: stop before
      bytes += cpBytes;
      i += cpUnits;
    }
    utf16Index = i;
  } else {
    utf16Index = Math.max(0, Math.min(character, line.text.length));
  }
  return g.bomBytes + line.startByte + byteLen(g, line.text.slice(0, utf16Index));
}

/** Editor position → LSP {line, character} in the negotiated encoding. */
export function posToLspCore(
  g: TextGeometry,
  pos: Pos,
  enc: PositionEncoding,
): { line: number; character: number } {
  const line = g.lines[Math.min(pos.line, g.lines.length) - 1];
  const prefix = line.text.slice(0, Math.max(0, pos.column - 1));
  return {
    line: pos.line - 1,
    character: enc === "utf-8" ? utf8ByteLength(prefix) : prefix.length,
  };
}
