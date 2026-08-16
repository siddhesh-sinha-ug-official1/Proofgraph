/**
 * The cell's publishDiagnostics flow: uri guard → renderer → verdict repaint →
 * keystroke-latency chain (SUB200 restructure: split from
 * EditorShellCell.handleDiagnostics, logic and probes verbatim).
 */

import type { PublishDiagnosticsParams } from "../lsp/pump.js";
import { clockOfRef } from "./config.js";
import type { EditorShellCell } from "./cell.js";

export function handleDiagnosticsCore(
  cell: EditorShellCell,
  params: PublishDiagnosticsParams,
  causeRef: string,
): void {
  if (!cell.connector || !cell.verdict || !cell.index_) return;
  // URI guard: another document's diagnostics must never be painted onto
  // this buffer (review finding: cross-URI batch applied — the version
  // guard alone compared the WRONG document's version to this model's).
  const foreign = params.uri !== cell.cfg.file.uri;
  cell.probe.emit(
    "editor.diag.uri.guard",
    {
      diagUri: params.uri,
      openUri: cell.cfg.file.uri,
      action: foreign ? "drop" : "apply",
      reason: foreign
        ? "publishDiagnostics uri is not the open document; dropping loudly"
        : "uri matches the open document",
    },
    causeRef,
  );
  if (foreign) return;
  const frame = cell.diagnostics.onPublish(
    params,
    cell.adapter.getVersionId(),
    cell.index_,
    cell.connector.state.positionEncoding === "utf-8" ? "utf-8" : "utf-16",
    causeRef,
  );
  if (!frame) return; // stale batch dropped (logged by the version guard)
  const gutterFrame = cell.repaintVerdicts(cell.probe.ref(frame));

  if (cell.pendingLatency?.keystrokeClock !== undefined) {
    const diagInClock = clockOfRef(causeRef);
    // The didChange probe for this edit was emitted before the frame was
    // sent, so it is already in history when its diagnostics arrive.
    const didChangeClock =
      cell.probe
        .byId("editor.lsp.out.didChange")
        .filter((e) => e.logicalClock > cell.pendingLatency!.keystrokeClock!)
        .at(0)?.logicalClock ?? -1;
    cell.render.emitKeystrokeLatency(
      {
        keystrokeClock: cell.pendingLatency.keystrokeClock,
        didChangeClock,
        diagInClock,
      },
      gutterFrame.logicalClock,
      cell.probe.ref(gutterFrame),
    );
    cell.pendingLatency = null;
  }
}
