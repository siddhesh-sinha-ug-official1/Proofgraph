/**
 * The editor-agnostic adapter surface (§7.8 "editor-agnostic core").
 *
 * Everything S1–S9 needs from an editor lives behind this interface, so the
 * core carries no Monaco-only types (gate lead editor.gate.monaco.leak) and a
 * CodeMirror-6 swap changes only the adapter implementation + S0 config.
 *
 * Coordinate conventions (Monaco's, adopted cell-wide):
 * - Position = 1-based { line, column }, column counted in UTF-16 code units.
 * - ContentChange.rangeOffset/rangeLength are UTF-16 code-unit offsets into
 *   the model text. Byte math is S7's job, not the adapter's.
 */

export interface Pos {
  line: number; // 1-based
  column: number; // 1-based, UTF-16 code units
}

export interface TextRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface ContentChange {
  rangeOffset: number; // UTF-16 offset into model text
  rangeLength: number; // UTF-16 length replaced
  text: string; // replacement text
}

/** Who caused an edit. "unknown" is classified as a silent rewrite by S1. */
export type EditOrigin = "user" | "programmatic" | "unknown";

export interface ContentChangeEvent {
  versionId: number;
  changes: ContentChange[];
  origin: EditOrigin;
  /** true when the editor replaced the whole buffer (e.g. setValue). */
  forced: boolean;
}

export interface CursorEvent {
  position: Pos;
  /** All active selections (multi-cursor); first is the primary. */
  selections: { start: Pos; end: Pos }[];
}

export type DecorationKind = "gutter" | "outline" | "marker" | "highlight";

export interface Decoration {
  /** Stable key for delta computation (e.g. nodeId or diagId). */
  key: string;
  range: TextRange;
  /** Renderer-specific class/color token; the core treats it as opaque. */
  style: string;
  /** Marker decorations carry severity + message for the problems surface. */
  severity?: "error" | "warning" | "info" | "hint";
  message?: string;
  hoverText?: string;
}

export interface MountInfo {
  wrapperVersion: string;
  fontRequested: string;
  fontResolved: string;
  ligaturesOn: boolean;
  themeName: string;
  tokenColorCount: number;
  isDarculaStyle: boolean;
  features: {
    multiCursor: boolean;
    folding: boolean;
    minimap: boolean;
    findReplace: boolean;
    bracketMatching: boolean;
    semanticHighlighting: boolean;
  };
}

export interface OpenModelOpts {
  uri: string;
  text: string;
  languageId: string;
  readOnly: boolean;
}

/**
 * The membrane between the instrumented core and a concrete editor.
 * StubEditorAdapter (tests) and MonacoEditorAdapter (browser) implement this.
 */
export interface EditorAdapter {
  readonly kind: "stub" | "monaco" | "codemirror";

  openModel(opts: OpenModelOpts): void;
  getText(): string;
  getVersionId(): number;

  /** Apply an edit the CELL initiated — must surface as origin "programmatic". */
  applyProgrammaticEdit(changes: ContentChange[]): void;

  onDidChangeContent(cb: (e: ContentChangeEvent) => void): () => void;
  onDidChangeCursor(cb: (e: CursorEvent) => void): () => void;

  setSelection(range: TextRange): void;
  revealRangeInCenter(range: TextRange): void;

  /** Replace the full decoration set of one kind (core computes deltas). */
  applyDecorations(kind: DecorationKind, decs: Decoration[]): void;

  getViewport(): { firstVisibleLine: number; lastVisibleLine: number };

  mountInfo(): MountInfo;

  dispose(): void;
}
