/**
 * MonacoEditorAdapter — the ONLY module (with its siblings under mount/monaco/)
 * allowed to import Monaco types (S9 gate lead: editor.gate.monaco.leak).
 *
 * Implements the editor-agnostic EditorAdapter over the real `monaco-editor`
 * engine: the same instrumented core (S1–S9) that runs headless against the
 * stub adapter drives a real Monaco pane through this class unchanged — that
 * is the §7.8 "editor-agnostic core" property, made concrete.
 *
 * Notes for the eventual monaco-languageclient v10 wiring (spike §7.8.4):
 * the cell's S2 connector consumes `MessageTransports` from the capability
 * handle; a real `vscode-ws-jsonrpc` reader/writer adapts to that interface in
 * a few lines. Nothing in this adapter touches the LSP path.
 */

import * as monaco from "monaco-editor";
import type {
  ContentChange,
  ContentChangeEvent,
  CursorEvent,
  Decoration,
  DecorationKind,
  EditorAdapter,
  MountInfo,
  OpenModelOpts,
  TextRange,
} from "../adapter.js";
import { PROOFGRAPH_DARCULA, SEVERITY } from "./darcula-theme.js";
import { toDeltaDecorations } from "./decorations.js";
import { wireContentEvents, wireCursorEvents } from "./monaco-events.js";

// SUB200 restructure: theme/severity tables live in ./darcula-theme.ts and the
// decoration mapping in ./decorations.ts; this module keeps its public path.
export { PROOFGRAPH_DARCULA } from "./darcula-theme.js";

export class MonacoEditorAdapter implements EditorAdapter {
  readonly kind = "monaco" as const;
  private container: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private model: monaco.editor.ITextModel | null = null;
  private inProgrammaticEdit = false;
  private contentListeners: Array<(e: ContentChangeEvent) => void> = [];
  private cursorListeners: Array<(e: CursorEvent) => void> = [];
  private decorationIds = new Map<DecorationKind, string[]>();
  private themeName = "proofgraph-darcula";
  private fontFamily: string;

  constructor(container: HTMLElement, opts?: { fontFamily?: string }) {
    this.container = container;
    this.fontFamily = opts?.fontFamily ?? "JetBrains Mono";
    monaco.editor.defineTheme(this.themeName, PROOFGRAPH_DARCULA);
  }

  openModel(opts: OpenModelOpts): void {
    this.model = monaco.editor.createModel(
      opts.text,
      opts.languageId,
      monaco.Uri.parse(opts.uri),
    );
    this.editor = monaco.editor.create(this.container, {
      model: this.model,
      theme: this.themeName,
      fontFamily: this.fontFamily,
      fontLigatures: true,
      readOnly: opts.readOnly,
      minimap: { enabled: true },
      folding: true,
      glyphMargin: true,
      automaticLayout: true,
      renderWhitespace: "selection",
    });

    wireContentEvents(this.model, () => this.inProgrammaticEdit, () => this.contentListeners);
    wireCursorEvents(this.editor, () => this.cursorListeners);
  }

  getText(): string {
    return this.model?.getValue() ?? "";
  }

  getVersionId(): number {
    return this.model?.getVersionId() ?? 0;
  }

  applyProgrammaticEdit(changes: ContentChange[]): void {
    if (!this.model || !this.editor) return;
    this.inProgrammaticEdit = true;
    try {
      this.editor.executeEdits(
        "editor-shell-cell",
        changes.map((c) => {
          const start = this.model!.getPositionAt(c.rangeOffset);
          const end = this.model!.getPositionAt(c.rangeOffset + c.rangeLength);
          return {
            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            text: c.text,
          };
        }),
      );
    } finally {
      this.inProgrammaticEdit = false;
    }
  }

  onDidChangeContent(cb: (e: ContentChangeEvent) => void): () => void {
    this.contentListeners.push(cb);
    return () => {
      const i = this.contentListeners.indexOf(cb);
      if (i >= 0) this.contentListeners.splice(i, 1);
    };
  }

  onDidChangeCursor(cb: (e: CursorEvent) => void): () => void {
    this.cursorListeners.push(cb);
    return () => {
      const i = this.cursorListeners.indexOf(cb);
      if (i >= 0) this.cursorListeners.splice(i, 1);
    };
  }

  setSelection(range: TextRange): void {
    this.editor?.setSelection(
      new monaco.Selection(range.startLine, range.startColumn, range.endLine, range.endColumn),
    );
  }

  revealRangeInCenter(range: TextRange): void {
    this.editor?.revealRangeInCenter(
      new monaco.Range(range.startLine, range.startColumn, range.endLine, range.endColumn),
    );
  }

  applyDecorations(kind: DecorationKind, decs: Decoration[]): void {
    if (!this.model) return;
    if (kind === "marker") {
      monaco.editor.setModelMarkers(
        this.model,
        "editor-shell",
        decs.map((d) => ({
          startLineNumber: d.range.startLine,
          startColumn: d.range.startColumn,
          endLineNumber: d.range.endLine,
          endColumn: d.range.endColumn,
          severity: SEVERITY[d.severity ?? "error"],
          message: d.message ?? "",
        })),
      );
      return;
    }
    const newDecs = toDeltaDecorations(kind, decs);
    const old = this.decorationIds.get(kind) ?? [];
    this.decorationIds.set(kind, this.model.deltaDecorations(old, newDecs));
  }

  getViewport(): { firstVisibleLine: number; lastVisibleLine: number } {
    const ranges = this.editor?.getVisibleRanges() ?? [];
    if (ranges.length === 0) return { firstVisibleLine: 1, lastVisibleLine: 1 };
    return {
      firstVisibleLine: ranges[0].startLineNumber,
      lastVisibleLine: ranges[ranges.length - 1].endLineNumber,
    };
  }

  mountInfo(): MountInfo {
    const fonts = (globalThis.document as Document | undefined)?.fonts;
    const fontResolved = fonts?.check(`12px "${this.fontFamily}"`) ? this.fontFamily : "monospace";
    return {
      wrapperVersion: `monaco-editor@${(monaco as { version?: string }).version ?? "0.52.x"}`,
      fontRequested: this.fontFamily,
      fontResolved,
      ligaturesOn: true,
      themeName: this.themeName,
      tokenColorCount: PROOFGRAPH_DARCULA.rules.length,
      isDarculaStyle: true,
      features: {
        multiCursor: true,
        folding: true,
        minimap: true,
        findReplace: true,
        bracketMatching: true,
        semanticHighlighting: false, // honest: no semantic tokens wired yet
      },
    };
  }

  dispose(): void {
    this.editor?.dispose();
    this.model?.dispose();
    this.editor = null;
    this.model = null;
  }
}
