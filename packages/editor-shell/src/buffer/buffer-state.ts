/**
 * S1 buffer internal state + byte-level helpers (SUB200 restructure: split
 * from buffer-manager.ts, logic verbatim). The BufferManager owns ONE mutable
 * BufferState; the open/change/roundtrip modules operate over it.
 */

import type { ProbeEvent } from "../probe/probe-bus.js";
import type { ContentChange } from "../mount/adapter.js";
import { detectEol, encodeUtf8, type DecodeResult, type EolInfo } from "../util/encoding.js";

export interface BufferState {
  uri: string;
  languageId: string;
  sourceBytes: Uint8Array;
  decode: DecodeResult;
  eolInfo: EolInfo;
  /** Model text as it SHOULD be given source + legitimate edits only. */
  expectedText: string;
  /** Adapter text as of the previous change — the base reported changes apply to. */
  prevAdapterText: string;
  /** False until the first user/programmatic edit: roundtrip compares RAW source bytes. */
  legitEditsApplied: boolean;
  openProbe: ProbeEvent | null;
  silentCount: number;
}

/** Re-encode model text with the source's encoding, BOM re-prepended. */
export function encodeLikeSource(st: BufferState, text: string): Uint8Array {
  let body: Uint8Array;
  switch (st.decode.encoding) {
    case "latin1": {
      body = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) body[i] = text.charCodeAt(i) & 0xff;
      break;
    }
    case "utf-16le": {
      body = new Uint8Array(text.length * 2);
      const dv = new DataView(body.buffer);
      for (let i = 0; i < text.length; i++) dv.setUint16(i * 2, text.charCodeAt(i), true);
      break;
    }
    case "utf-16be": {
      body = new Uint8Array(text.length * 2);
      const dv = new DataView(body.buffer);
      for (let i = 0; i < text.length; i++) dv.setUint16(i * 2, text.charCodeAt(i), false);
      break;
    }
    default:
      body = encodeUtf8(text);
  }
  if (st.decode.bom.bomBytes === 0) return body;
  const out = new Uint8Array(st.decode.bom.bomBytes + body.length);
  out.set(st.sourceBytes.subarray(0, st.decode.bom.bomBytes));
  out.set(body, st.decode.bom.bomBytes);
  return out;
}

/** Apply Monaco-style content changes (utf-16 offsets) to a text snapshot. */
export function applyChanges(text: string, changes: ContentChange[]): string {
  // Apply in descending offset order so earlier offsets stay valid.
  const sorted = [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
  let out = text;
  for (const c of sorted) {
    out = out.slice(0, c.rangeOffset) + c.text + out.slice(c.rangeOffset + c.rangeLength);
  }
  return out;
}

export function stripWs(s: string): string {
  return s.replace(/[ \t\r\n﻿]/g, "");
}

export function eolSignature(s: string): string {
  const info = detectEol(s);
  return `${info.eol}:${info.lfCount}:${info.crlfCount}`;
}

export function previewAt(bytes: Uint8Array, offset: number): number[] {
  return [...bytes.subarray(Math.max(0, offset - 2), offset + 6)];
}
