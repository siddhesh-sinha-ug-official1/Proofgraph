/**
 * S7 — Position / ID mapping.
 *
 * Owns: the SpanIndex (Node.id → span/range, position → innermost Node.id) and
 * every byte-offset ↔ line/column conversion. This is exactly where byte spans
 * and utf-16 editor columns bite on multibyte characters, so conversions are
 * firehose-probed and self-checked (editor.map.encoding.mismatch).
 *
 * SUB200 restructure: pure geometry math lives in ./geometry.ts — WITH the D4
 * span/position conventions block, which governs that math; the build-time
 * node binding + innermost lookup live in ./build-nodes.ts. This module
 * remains the public path.
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { SchemaNode, Span } from "../schema/schema.js";
import type { Pos, TextRange } from "../mount/adapter.js";
import type { EncodingName } from "../util/encoding.js";
import {
  buildLineIndex,
  byteLen,
  byteToPosCore,
  lspPositionToByteCore,
  posToByteInternal,
  posToLspCore,
  type PositionEncoding,
  type TextGeometry,
} from "./geometry.js";
import {
  bindNodes,
  emitMismatchIfAny,
  innermostAtByte,
  type IndexedNode,
} from "./build-nodes.js";

export type { PositionEncoding } from "./geometry.js";
export type { IndexedNode } from "./build-nodes.js";

export class SpanIndex {
  readonly fileUri: string;
  readonly builtAtVersion: number;
  readonly bomBytes: number;
  readonly encoding: EncodingName;
  private g: TextGeometry;
  /** Total FILE byte length (bom + encoded text). */
  private fileByteLength = 0;
  private byId = new Map<string, IndexedNode>();
  private intervals: { byteStart: number; byteEnd: number; nodeId: string }[] = [];
  private probe: ProbeBus;

  constructor(opts: {
    probe: ProbeBus;
    fileUri: string;
    modelText: string;
    bomBytes: number;
    /** The FILE's storage encoding — governs every byte measurement. */
    encoding?: EncodingName;
    nodes: SchemaNode[];
    builtAtVersion: number;
    causeId?: string | null;
  }) {
    this.probe = opts.probe;
    this.fileUri = opts.fileUri;
    this.builtAtVersion = opts.builtAtVersion;
    this.bomBytes = opts.bomBytes;
    this.encoding = opts.encoding ?? "utf-8";

    const buildInput = this.probe.emit(
      "editor.map.build.input",
      { fileUri: opts.fileUri, nodeCount: opts.nodes.length, encoding: this.encoding },
      opts.causeId ?? null,
    );
    const buildRef = this.probe.ref(buildInput);

    this.g = {
      lines: buildLineIndex(opts.modelText, this.encoding),
      bomBytes: this.bomBytes,
      encoding: this.encoding,
    };
    const last = this.g.lines[this.g.lines.length - 1];
    this.fileByteLength = this.bomBytes + last.startByte + byteLen(this.g, last.text);

    const bound = bindNodes({
      probe: this.probe,
      g: this.g,
      fileUri: opts.fileUri,
      fileByteLength: this.fileByteLength,
      nodes: opts.nodes,
      buildRef,
    });
    this.byId = bound.byId;
    this.intervals = bound.intervals;

    this.probe.emit(
      "editor.map.build.index",
      {
        nodeCount: this.byId.size,
        intervalCount: this.intervals.length,
        overlaps: bound.overlaps,
        builtAtVersion: this.builtAtVersion,
      },
      buildRef,
    );
  }

  lineCount(): number {
    return this.g.lines.length;
  }

  totalFileBytes(): number {
    return this.fileByteLength;
  }

  /**
   * Absolute file byte offset → 1-based {line, column} (utf-16 columns).
   * Firehose-probed; self-checked against the inverse conversion — a
   * disagreement emits editor.map.encoding.mismatch (the classic off-by-N).
   */
  byteToPos(absByteOffset: number, causeId: string | null = null): Pos {
    const core = byteToPosCore(this.g, absByteOffset);
    const ev = this.probe.emit(
      "editor.map.byte.to.pos",
      {
        byteOffset: absByteOffset,
        line: core.pos.line,
        column: core.pos.column,
        positionEncoding: "utf-16",
      },
      causeId,
    );
    emitMismatchIfAny(this.probe, absByteOffset, core, this.probe.ref(ev));
    return core.pos;
  }

  /** 1-based {line, column} (utf-16 columns) → absolute file byte offset. */
  posToByte(pos: Pos, causeId: string | null = null): number {
    const byteOffset = posToByteInternal(this.g, pos);
    this.probe.emit(
      "editor.map.pos.to.byte",
      { line: pos.line, column: pos.column, byteOffset, positionEncoding: "utf-16" },
      causeId,
    );
    return byteOffset;
  }

  /** LSP {line, character} (0-based, in `enc`) → absolute file byte offset. */
  lspPositionToByte(lspLine: number, character: number, enc: PositionEncoding): number {
    return lspPositionToByteCore(this.g, lspLine, character, enc);
  }

  /** Editor position → LSP {line, character} in the negotiated encoding. */
  posToLsp(pos: Pos, enc: PositionEncoding): { line: number; character: number } {
    return posToLspCore(this.g, pos, enc);
  }

  spanToRange(span: Span, causeId: string | null = null): TextRange {
    const s = this.byteToPos(span.byteStart, causeId);
    const e = this.byteToPos(span.byteEnd, causeId);
    return { startLine: s.line, startColumn: s.column, endLine: e.line, endColumn: e.column };
  }

  getById(nodeId: string): IndexedNode | undefined {
    return this.byId.get(nodeId);
  }

  allNodes(): IndexedNode[] {
    return [...this.byId.values()];
  }

  /**
   * Innermost node containing the absolute byte offset (span end exclusive).
   * Nested candidates emit the overlap.ambiguous decision naming the winner.
   */
  nodeAtByte(absByteOffset: number, causeId: string | null = null): IndexedNode | null {
    return innermostAtByte(this.probe, this.intervals, this.byId, absByteOffset, causeId);
  }

  nodeAtPosition(pos: Pos, causeId: string | null = null): IndexedNode | null {
    const byte = this.posToByte(pos, causeId);
    return this.nodeAtByte(byte, causeId);
  }

  snapshot(): unknown {
    return {
      fileUri: this.fileUri,
      builtAtVersion: this.builtAtVersion,
      bomBytes: this.bomBytes,
      encoding: this.encoding,
      fileByteLength: this.fileByteLength,
      lineCount: this.g.lines.length,
      nodeIds: [...this.byId.keys()].sort(),
      intervals: this.intervals.map((iv) => ({ ...iv })),
    };
  }
}
