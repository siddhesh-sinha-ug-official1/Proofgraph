/**
 * Fixture-generator helpers (SUB200 restructure: split from
 * ../gen-fixture-nodes.mjs, logic verbatim): canonical id minting + byte-span
 * math shared by every fixture section.
 *
 * ASSEMBLY Phase 0 swap (ruling 5): ids come from the canonical schema
 * package (packages/schema/gen/ids.ts, imported directly; Node 24 type
 * stripping) — the canonical preimage is SPAN-FREE, so ids are stable across
 * reformatting by design. The CELL never mints ids.
 */

import { createHash } from "node:crypto";
// Canonical mint — the ONE id scheme (packages/schema is the source of truth).
import { computeNodeIdentity } from "../../../schema/gen/ids.ts";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const utf8len = (s) => Buffer.byteLength(s, "utf8");

/** Module name = fixture file basename without extension (e.g. …/clean.py → "clean"). */
export function moduleNameOf(fileUri) {
  return fileUri.split("/").pop().replace(/\.[^.]+$/, "");
}

/** Mint the REAL canonical node id (ruling 5) via packages/schema/gen/ids.ts. */
export function mintId(lang, kind, name, file) {
  return computeNodeIdentity(lang, kind, moduleNameOf(file), name, file).nodeId;
}

export function makeNode({ lang, kind, name, file, span, fill, outline, origin, signature = null }) {
  const id = mintId(lang, kind, name, file);
  return {
    id,
    kind,
    lang,
    name,
    signature,
    span: { file, byteStart: span[0], byteEnd: span[1] },
    fill,
    outline,
    origin,
    provenance: { tier: "T1", extractor: "tree1-stub-generator", resolved: true },
  };
}

/** [start, end) span of a python def block, `sep` = blank-line separator. */
export function blockSpan(text, marker, sep) {
  const start = text.indexOf(marker);
  if (start === -1) throw new Error(`marker not found: ${marker}`);
  let end = text.indexOf(sep, start);
  end = end === -1 ? text.length : end + 1; // include the last line's newline
  return [start, end];
}

export function tokenSpan(text, token, from = 0, bias = 0) {
  const at = text.indexOf(token, from);
  if (at === -1) throw new Error(`token not found: ${token}`);
  return [utf8ByteOffset(text, at) + bias, utf8ByteOffset(text, at) + bias + utf8len(token)];
}

/** utf-16 index → utf-8 byte offset within text. */
export function utf8ByteOffset(text, utf16Index) {
  return utf8len(text.slice(0, utf16Index));
}
