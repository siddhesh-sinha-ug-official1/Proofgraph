/**
 * S4 — Diagnostics renderer.
 *
 * publishDiagnostics → version guard (stale batches dropped LOUDLY) → LSP range
 * → byte span → editor range → marker, with each diagnostic attached to the
 * overlapping Node.id. The span map is where the squiggle lands on the right
 * characters or one column off — the cheap-connector-that-dies case — so the
 * mapping is probed per diagnostic and self-checked (map.mismatch).
 *
 * SUB200 restructure: the per-diagnostic mapping body lives in
 * ./map-diagnostic.ts. This module remains the public path.
 */

import type { ProbeBus, ProbeEvent } from "../probe/probe-bus.js";
import type { Decoration } from "../mount/adapter.js";
import type { LspDiagnostic, PublishDiagnosticsParams } from "../lsp/pump.js";
import type { PositionEncoding, SpanIndex } from "../map/span-index.js";
import type { RenderTracker } from "../render/render.js";
import { mapOneDiagnostic } from "./map-diagnostic.js";

export interface DiagnosticRecord {
  diagId: string;
  lspRange: LspDiagnostic["range"];
  monacoRange: { startLine: number; startColumn: number; endLine: number; endColumn: number };
  byteStart: number;
  byteEnd: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source: string | null;
  code: string | number | null;
  nodeId: string | null;
}

export class DiagnosticsRenderer {
  private probe: ProbeBus;
  private render: RenderTracker;
  private records: DiagnosticRecord[] = [];
  private appliedVersion: number | null = null;

  constructor(probe: ProbeBus, render: RenderTracker) {
    this.probe = probe;
    this.render = render;
  }

  /**
   * Handle one publishDiagnostics batch. Returns the frame probe if applied,
   * null if the batch was dropped by the version guard.
   */
  onPublish(
    params: PublishDiagnosticsParams,
    modelVersion: number,
    index: SpanIndex,
    positionEncoding: PositionEncoding,
    causeRef: string,
  ): ProbeEvent | null {
    const inputProbe = this.probe.emit(
      "editor.diag.input",
      { version: params.version ?? null, count: params.diagnostics.length },
      causeRef,
    );
    const inputRef = this.probe.ref(inputProbe);

    // Version guard: apply only if current; a dropped stale batch is a logged
    // branch (the squiggle you DIDN'T see), never a silent ignore.
    const stale = params.version !== undefined && params.version !== modelVersion;
    this.probe.emit(
      "editor.diag.version.guard",
      {
        diagVersion: params.version ?? null,
        modelVersion,
        action: stale ? "drop" : "apply",
        reason: stale
          ? `diagnostics version ${params.version} != model version ${modelVersion}; stale squiggles would lie`
          : params.version === undefined
            ? "server sent no version; applying against current model"
            : "versions match",
      },
      inputRef,
    );
    if (stale) return null;

    // Clear-before-apply: leaked markers are stale squiggles.
    this.probe.emit(
      "editor.diag.clear",
      { version: params.version ?? modelVersion, clearedCount: this.records.length },
      inputRef,
    );
    this.records = [];

    const decorations: Decoration[] = [];
    params.diagnostics.forEach((d, i) => {
      const diagId = `d${params.version ?? modelVersion}-${i}`;
      const { record, decoration } = mapOneDiagnostic(
        this.probe,
        index,
        positionEncoding,
        inputRef,
        d,
        diagId,
      );
      this.records.push(record);
      decorations.push(decoration);
    });

    this.appliedVersion = params.version ?? modelVersion;
    return this.render.paint("marker", decorations, "diagnostic", inputRef);
  }

  current(): DiagnosticRecord[] {
    return this.records.map((r) => ({ ...r }));
  }

  /** diagIds attached to a node — the live input to S5. */
  forNode(nodeId: string): DiagnosticRecord[] {
    return this.records.filter((r) => r.nodeId === nodeId);
  }

  lastAppliedVersion(): number | null {
    return this.appliedVersion;
  }

  snapshot(): unknown {
    return { appliedVersion: this.appliedVersion, records: this.current() };
  }
}
