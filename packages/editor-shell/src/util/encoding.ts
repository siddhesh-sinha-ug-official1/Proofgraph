/**
 * Pure encoding/EOL utilities — no DOM, no Node builtins (TextEncoder/Decoder
 * are globals in both runtimes). These back S1's open pipeline and S7's
 * byte↔position math. All decisions taken here are probed by the callers.
 */

export type Eol = "LF" | "CRLF";
export type EncodingName = "utf-8" | "utf-16le" | "utf-16be" | "latin1";

export interface BomInfo {
  bomPresent: boolean;
  /** Width of the BOM in bytes at the front of the file (0 if none). */
  bomBytes: number;
  bomKind: "utf-8" | "utf-16le" | "utf-16be" | null;
}

export function detectBom(bytes: Uint8Array): BomInfo {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { bomPresent: true, bomBytes: 3, bomKind: "utf-8" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { bomPresent: true, bomBytes: 2, bomKind: "utf-16le" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { bomPresent: true, bomBytes: 2, bomKind: "utf-16be" };
  }
  return { bomPresent: false, bomBytes: 0, bomKind: null };
}

export interface DecodeResult {
  text: string; // model text WITHOUT the BOM character
  encoding: EncodingName;
  candidates: EncodingName[];
  notChosen: { encoding: EncodingName; reason: string }[];
  bom: BomInfo;
}

/**
 * Deterministic decode decision: BOM-declared utf-16 wins; else strict utf-8;
 * else latin1 fallback. The caller probes chosen + branches not taken.
 */
export function decodeBytes(bytes: Uint8Array): DecodeResult {
  const bom = detectBom(bytes);
  const candidates: EncodingName[] = ["utf-8", "utf-16le", "utf-16be", "latin1"];
  const body = bytes.subarray(bom.bomBytes);

  if (bom.bomKind === "utf-16le" || bom.bomKind === "utf-16be") {
    const text = new TextDecoder(bom.bomKind === "utf-16le" ? "utf-16le" : "utf-16be").decode(body);
    return {
      text,
      encoding: bom.bomKind,
      candidates,
      notChosen: [
        { encoding: "utf-8", reason: "utf-16 BOM present" },
        { encoding: "latin1", reason: "utf-16 BOM present" },
      ],
      bom,
    };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    return {
      text,
      encoding: "utf-8",
      candidates,
      notChosen: [
        { encoding: "utf-16le", reason: "no utf-16 BOM" },
        { encoding: "utf-16be", reason: "no utf-16 BOM" },
        { encoding: "latin1", reason: "bytes are valid utf-8" },
      ],
      bom,
    };
  } catch {
    // TRUE ISO-8859-1: byte N → U+00NN, 1:1 and losslessly invertible.
    // (TextDecoder("latin1") is windows-1252 per the WHATWG spec and REMAPS
    // bytes 0x80–0x9F — a silent byte rewrite; review finding, buffer lens.)
    let text = "";
    for (let i = 0; i < body.length; i++) text += String.fromCharCode(body[i]);
    return {
      text,
      encoding: "latin1",
      candidates,
      notChosen: [
        { encoding: "utf-8", reason: "invalid utf-8 byte sequence" },
        { encoding: "utf-16le", reason: "no utf-16 BOM" },
        { encoding: "utf-16be", reason: "no utf-16 BOM" },
      ],
      bom,
    };
  }
}

export interface EolInfo {
  /** Dominant EOL by first occurrence ("LF" for a file with no EOLs). */
  eol: Eol;
  lfCount: number;
  crlfCount: number;
  mixed: boolean;
}

export function detectEol(text: string): EolInfo {
  let lf = 0;
  let crlf = 0;
  let first: Eol | null = null;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      if (i > 0 && text.charCodeAt(i - 1) === 13) {
        crlf++;
        if (!first) first = "CRLF";
      } else {
        lf++;
        if (!first) first = "LF";
      }
    }
  }
  return { eol: first ?? "LF", lfCount: lf, crlfCount: crlf, mixed: lf > 0 && crlf > 0 };
}

const utf8Encoder = new TextEncoder();

export function encodeUtf8(text: string): Uint8Array {
  return utf8Encoder.encode(text);
}

/** utf-8 byte length of a JS (utf-16) string — surrogate-pair aware. */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.codePointAt(i)!;
    if (c > 0xffff) i++; // surrogate pair consumed
    bytes += c <= 0x7f ? 1 : c <= 0x7ff ? 2 : c <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Compare two byte arrays; -1 if equal, else first divergent offset. */
export function firstDivergence(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}
