/**
 * Monaco → EditorAdapter event mapping (SUB200 restructure: split from
 * MonacoEditorAdapter.openModel's listener wiring, logic verbatim).
 * Monaco-only module (inside src/mount/monaco/, per the S9 gate).
 */

import * as monaco from "monaco-editor";
import type { ContentChange, ContentChangeEvent, CursorEvent } from "../adapter.js";

export function wireContentEvents(
  model: monaco.editor.ITextModel,
  isProgrammaticEdit: () => boolean,
  listeners: () => Array<(e: ContentChangeEvent) => void>,
): void {
  model.onDidChangeContent((e) => {
    const changes: ContentChange[] = e.changes.map((c) => ({
      rangeOffset: c.rangeOffset,
      rangeLength: c.rangeLength,
      text: c.text,
    }));
    const event: ContentChangeEvent = {
      versionId: e.versionId,
      changes,
      // Monaco does not label the causer; the adapter does: anything not
      // inside our own executeEdits window counts as user input. A change
      // arriving with neither cause would be the silent-rewrite alarm, which
      // S1 detects by text divergence (see BufferManager cross-check).
      origin: isProgrammaticEdit() ? "programmatic" : "user",
      forced: e.isFlush,
    };
    for (const l of [...listeners()]) l(event);
  });
}

export function wireCursorEvents(
  editor: monaco.editor.IStandaloneCodeEditor,
  listeners: () => Array<(e: CursorEvent) => void>,
): void {
  editor.onDidChangeCursorSelection((e) => {
    const toPos = (p: monaco.IPosition) => ({ line: p.lineNumber, column: p.column });
    const sels = [e.selection, ...e.secondarySelections].map((s) => ({
      start: toPos({ lineNumber: s.selectionStartLineNumber, column: s.selectionStartColumn }),
      end: toPos({ lineNumber: s.positionLineNumber, column: s.positionColumn }),
    }));
    const event: CursorEvent = {
      position: { line: e.selection.positionLineNumber, column: e.selection.positionColumn },
      selections: sels,
    };
    for (const l of [...listeners()]) l(event);
  });
}
