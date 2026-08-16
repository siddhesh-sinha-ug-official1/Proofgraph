/**
 * S4 per-diagnostic span mapping (SUB200 restructure: split from
 * DiagnosticsRenderer.onPublish's per-diagnostic body, logic and probes
 * verbatim). LSP range → byte span → editor range → node attach → marker.
 */

import type { ProbeBus } from "../probe/probe-bus.js";
import type { Decoration } from "../mount/adapter.js";
import type { LspDiagnostic } from "../lsp/pump.js";
import type { PositionEncoding, SpanIndex } from "../map/span-index.js";
import type { DiagnosticRecord } from "./diagnostics.js";

const SEVERITY_NAME: Record<number, DiagnosticRecord["severity"]> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "hint",
};

export function mapOneDiagnostic(
  probe: ProbeBus,
  index: SpanIndex,
  positionEncoding: PositionEncoding,
  inputRef: string,
  d: LspDiagnostic,
  diagId: string,
): { record: DiagnosticRecord; decoration: Decoration } {
  let byteStart = index.lspPositionToByte(d.range.start.line, d.range.start.character, positionEncoding);
  let byteEnd = index.lspPositionToByte(d.range.end.line, d.range.end.character, positionEncoding);
  if (byteEnd < byteStart) {
    // A reversed range is malformed server output — normalize for painting
    // but surface it loudly (cheap-connector-that-dies philosophy).
    probe.emit(
      "editor.lsp.error.protocol",
      {
        direction: "in",
        method: "textDocument/publishDiagnostics",
        kind: "malformed",
        detail: `diagnostic ${diagId} range end < start (bytes ${byteEnd} < ${byteStart}); normalized by swapping`,
      },
      inputRef,
    );
    [byteStart, byteEnd] = [byteEnd, byteStart];
  }
  const startPos = index.byteToPos(byteStart, inputRef);
  const endPos = index.byteToPos(byteEnd, inputRef);
  const monacoRange = {
    startLine: startPos.line,
    startColumn: startPos.column,
    endLine: endPos.line,
    endColumn: endPos.column,
  };
  const mapProbe = probe.emit(
    "editor.diag.map.span",
    { diagId, lspRange: d.range, monacoRange, byteStart, byteEnd, positionEncoding },
    inputRef,
  );
  const mapRef = probe.ref(mapProbe);

  // Self-check: byte span re-derived from the editor range must agree.
  const backStart = index.posToByte(startPos, mapRef);
  if (backStart !== byteStart) {
    probe.emit(
      "editor.diag.map.mismatch",
      {
        diagId,
        expectedByteStart: byteStart,
        actualByteStart: backStart,
        delta: backStart - byteStart,
        likelyCause: positionEncoding === "utf-16" ? "utf16-utf8" : "eol",
      },
      mapRef,
    );
  }

  const severity = SEVERITY_NAME[d.severity ?? 1] ?? "error";
  probe.emit(
    "editor.diag.severity.map",
    {
      diagId,
      lspSeverity: d.severity ?? 1,
      markerSeverity: severity,
      fillContribution: severity === "error" ? "red" : severity === "warning" ? "amber" : "none",
    },
    mapRef,
  );

  // Attach to the innermost node whose span overlaps the diagnostic.
  const node = index.nodeAtByte(byteStart, mapRef);
  let nodeId: string | null = null;
  if (node) {
    nodeId = node.node.id;
    const exact = node.span.byteStart === byteStart && node.span.byteEnd === byteEnd;
    const contains = node.span.byteStart <= byteStart && byteEnd <= node.span.byteEnd;
    probe.emit(
      "editor.diag.node.attach",
      { diagId, nodeId, overlapKind: exact ? "exact" : contains ? "contains" : "overlaps" },
      mapRef,
    );
  } else {
    probe.emit(
      "editor.diag.node.orphan",
      { diagId, range: d.range, reason: "noNodeAtSpan" },
      mapRef,
    );
  }

  if (d.relatedInformation && d.relatedInformation.length > 0) {
    probe.emit(
      "editor.diag.related",
      {
        diagId,
        relatedInformation: d.relatedInformation.map((ri) => ({
          uri: ri.location.uri,
          range: ri.location.range,
          message: ri.message,
        })),
      },
      mapRef,
    );
  }
  if (d.tags && d.tags.length > 0) {
    probe.emit(
      "editor.diag.tag",
      { diagId, tags: d.tags.map((t) => (t === 1 ? "unnecessary" : "deprecated")) },
      mapRef,
    );
  }
  probe.emit(
    "editor.diag.codeAction.available",
    { diagId, hasQuickFix: !!(d.data as { quickfix?: boolean } | undefined)?.quickfix },
    mapRef,
  );

  const marker = probe.emit(
    "editor.diag.marker.set",
    {
      diagId,
      monacoRange,
      severity,
      message: d.message,
      source: d.source ?? null,
      code: d.code ?? null,
    },
    mapRef,
  );
  void marker;

  return {
    record: {
      diagId,
      lspRange: d.range,
      monacoRange,
      byteStart,
      byteEnd,
      severity,
      message: d.message,
      source: d.source ?? null,
      code: d.code ?? null,
      nodeId,
    },
    decoration: {
      key: diagId,
      range: monacoRange,
      style: `pg-marker-${severity}`,
      severity,
      message: d.message,
    },
  };
}
