/**
 * S7 index build — node partitioning, same-span conflict detection, EOF
 * clamping and span→range binding (SUB200 restructure: split from the
 * SpanIndex constructor, logic verbatim; every probe unchanged).
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { SchemaNode, Span } from "../schema/schema.js";
import type { TextRange } from "../mount/adapter.js";
import { byteToPosCore, type ByteToPosCore, type TextGeometry } from "./geometry.js";

export interface IndexedNode {
  node: SchemaNode;
  span: Span;
  monacoRange: TextRange;
}

export function emitMismatchIfAny(
  probe: ProbeBus,
  absByteOffset: number,
  core: ByteToPosCore,
  causeId: string | null,
): void {
  if (core.midCodepoint || core.roundTripByte !== absByteOffset) {
    probe.emit(
      "editor.map.encoding.mismatch",
      {
        byteOffset: absByteOffset,
        expectedColumn: core.naiveColumn,
        actualColumn: core.pos.column,
        deltaBytes: core.roundTripByte - absByteOffset,
        char: core.char,
        reason: "multibyte-utf16",
        midCodepoint: core.midCodepoint,
      },
      causeId,
    );
  }
}

/**
 * Build-time conversion: skips the per-conversion FIREHOSE (density without
 * meaning at build) but NEVER skips the desync self-check — the moment spans
 * bind to visual ranges is exactly when a desync matters most.
 */
export function spanToRangeCore(
  probe: ProbeBus,
  g: TextGeometry,
  span: Span,
  causeRef: string | null,
): TextRange {
  const s = byteToPosCore(g, span.byteStart);
  emitMismatchIfAny(probe, span.byteStart, s, causeRef);
  const e = byteToPosCore(g, span.byteEnd);
  emitMismatchIfAny(probe, span.byteEnd, e, causeRef);
  return {
    startLine: s.pos.line,
    startColumn: s.pos.column,
    endLine: e.pos.line,
    endColumn: e.pos.column,
  };
}

/**
 * Innermost node containing the absolute byte offset (span end exclusive).
 * Nested candidates emit the overlap.ambiguous decision naming the winner.
 * (SUB200 restructure: split from SpanIndex.nodeAtByte, logic verbatim.)
 */
export function innermostAtByte(
  probe: ProbeBus,
  intervals: { byteStart: number; byteEnd: number; nodeId: string }[],
  byId: Map<string, IndexedNode>,
  absByteOffset: number,
  causeId: string | null,
): IndexedNode | null {
  const candidates = intervals.filter(
    (iv) => iv.byteStart <= absByteOffset && absByteOffset < iv.byteEnd,
  );
  if (candidates.length === 0) return null;
  let chosen = candidates[0];
  if (candidates.length > 1) {
    chosen = candidates.reduce((best, c) => {
      const lb = best.byteEnd - best.byteStart;
      const lc = c.byteEnd - c.byteStart;
      if (lc < lb) return c;
      if (lc === lb && c.nodeId < best.nodeId) return c;
      return best;
    });
    probe.emit(
      "editor.map.overlap.ambiguous",
      {
        position: { byteOffset: absByteOffset },
        candidates: candidates.map((c) => c.nodeId).sort(),
        chosen: chosen.nodeId,
        rule: "innermost",
        reason: "smallest containing span wins; ties break to lexicographically smallest id",
      },
      causeId,
    );
  }
  return byId.get(chosen.nodeId) ?? null;
}

/** Partition, conflict-check, clamp and bind the schema nodes for one file. */
export function bindNodes(opts: {
  probe: ProbeBus;
  g: TextGeometry;
  fileUri: string;
  fileByteLength: number;
  nodes: SchemaNode[];
  buildRef: string;
}): {
  byId: Map<string, IndexedNode>;
  intervals: { byteStart: number; byteEnd: number; nodeId: string }[];
  overlaps: number;
} {
  const { probe, g, buildRef } = opts;

  // Partition nodes: this file vs foreign (multifile branch, logged per node).
  const local: SchemaNode[] = [];
  for (const n of opts.nodes) {
    if (n.span.file === opts.fileUri) {
      local.push(n);
    } else {
      probe.emit(
        "editor.map.multifile",
        { nodeId: n.id, span: { file: n.span.file }, reason: "not-this-file" },
        buildRef,
      );
    }
  }

  // Same-span conflict detection: two nodes claiming the identical byte span
  // is a schema anomaly — surfaced via a decision, never silently coalesced.
  const bySpanKey = new Map<string, SchemaNode[]>();
  for (const n of local) {
    const k = `${n.span.byteStart}:${n.span.byteEnd}`;
    const arr = bySpanKey.get(k) ?? [];
    arr.push(n);
    bySpanKey.set(k, arr);
  }
  for (const [key, group] of bySpanKey) {
    if (group.length > 1) {
      const sortedIds = group.map((gr) => gr.id).sort();
      probe.emit(
        "editor.map.build.conflict",
        {
          span: { byteStart: group[0].span.byteStart, byteEnd: group[0].span.byteEnd, key },
          nodeIds: sortedIds,
          chosen: sortedIds[0],
          reason:
            "two schema nodes claim the identical byte span; position lookups bind to the lexicographically smallest id (deterministic); schema anomaly surfaced upstream",
        },
        buildRef,
      );
    }
  }

  let overlaps = 0;
  const byId = new Map<string, IndexedNode>();
  const intervals: { byteStart: number; byteEnd: number; nodeId: string }[] = [];
  const sorted = [...local].sort((a, b) => {
    if (a.span.byteStart !== b.span.byteStart) return a.span.byteStart - b.span.byteStart;
    const lenA = a.span.byteEnd - a.span.byteStart;
    const lenB = b.span.byteEnd - b.span.byteStart;
    if (lenA !== lenB) return lenB - lenA; // outer before inner
    return a.id < b.id ? -1 : 1; // same-span: deterministic id order
  });
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i];
    // Spans reaching past the file's actual bytes signal a schema/file
    // desync — clamp for safety AND surface it (never silently absorb).
    let byteEnd = n.span.byteEnd;
    let byteStart = n.span.byteStart;
    if (byteEnd > opts.fileByteLength || byteStart > byteEnd || byteStart < 0) {
      probe.emit(
        "editor.map.span.clamped",
        {
          nodeId: n.id,
          byteStart: n.span.byteStart,
          byteEnd: n.span.byteEnd,
          fileByteLength: opts.fileByteLength,
          reason: "schema span outside file bytes — schema/file desync; clamped to file bounds",
        },
        buildRef,
      );
      byteEnd = Math.min(Math.max(byteEnd, 0), opts.fileByteLength);
      byteStart = Math.min(Math.max(byteStart, 0), byteEnd);
    }
    const span: Span = { file: n.span.file, byteStart, byteEnd };
    if (i > 0 && span.byteStart < sorted[i - 1].span.byteEnd) overlaps++;
    const monacoRange = spanToRangeCore(probe, g, span, buildRef);
    byId.set(n.id, { node: n, span, monacoRange });
    intervals.push({ byteStart: span.byteStart, byteEnd: span.byteEnd, nodeId: n.id });
  }

  return { byId, intervals, overlaps };
}
