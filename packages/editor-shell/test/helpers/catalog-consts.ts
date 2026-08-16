/**
 * Catalog-completeness test constants (SUB200 restructure: split from
 * 19-catalog.test.ts, verbatim).
 */

import type { ProbeKind } from "../../src/probe/catalog.js";

export const CONTRACT_KINDS: ProbeKind[] = [
  "input", "output", "value", "decision", "branch", "edge",
  "node", "state", "call", "timing", "error",
];

/** The 10 firehose leads named by the contract (§6.12). */
export const EXPECTED_FIREHOSE = [
  "editor.lsp.raw.frame",
  "editor.lsp.out.didChange",
  "editor.lsp.out.request",
  "editor.lsp.in.response",
  "editor.lsp.in.notification",
  "editor.lsp.in.progress",
  "editor.buffer.change",
  "editor.map.byte.to.pos",
  "editor.map.pos.to.byte",
  "editor.render.frame",
];
