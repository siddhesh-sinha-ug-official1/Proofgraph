/**
 * StubEditorAdapter — a full in-memory EditorAdapter so the entire cell runs
 * headless (§9.18: the core carries no Monaco types and survives an editor
 * swap). Simulation hooks let tests drive user edits, SILENT rewrites, cursor
 * moves, undo/redo, and viewport changes deterministically.
 */

import type {
  ContentChange,
  ContentChangeEvent,
  CursorEvent,
  Decoration,
  DecorationKind,
  EditorAdapter,
  EditOrigin,
  MountInfo,
  OpenModelOpts,
  Pos,
  TextRange,
} from "../../src/mount/adapter.js";
import { applyChanges } from "../../src/buffer/buffer-manager.js";
import { DEFAULT_MOUNT_INFO } from "./stub-adapter-defaults.js";

export class StubEditorAdapter implements EditorAdapter {
  readonly kind = "stub" as const;
  private text = "";
  private versionId = 0;
  private uri = "";
  private readOnly = false;
  private contentListeners: Array<(e: ContentChangeEvent) => void> = [];
  private cursorListeners: Array<(e: CursorEvent) => void> = [];
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private viewport = { firstVisibleLine: 1, lastVisibleLine: 10_000 };
  private info: MountInfo;
  readonly decorationsByKind = new Map<DecorationKind, Decoration[]>();
  readonly revealed: TextRange[] = [];
  readonly selectionsSet: TextRange[] = [];
  rejectedEdits = 0;
  disposed = false;

  constructor(mountInfo: Partial<MountInfo> = {}) {
    this.info = { ...DEFAULT_MOUNT_INFO, ...mountInfo };
  }

  openModel(opts: OpenModelOpts): void {
    this.uri = opts.uri;
    this.text = opts.text;
    this.readOnly = opts.readOnly;
    this.versionId = 1;
  }

  getText(): string {
    return this.text;
  }

  getVersionId(): number {
    return this.versionId;
  }

  private applyEdit(changes: ContentChange[], origin: EditOrigin, forced = false): void {
    if (this.readOnly && origin !== "unknown") {
      this.rejectedEdits++;
      return;
    }
    this.undoStack.push(this.text);
    this.redoStack = [];
    this.text = applyChanges(this.text, changes);
    this.versionId++;
    const event: ContentChangeEvent = { versionId: this.versionId, changes, origin, forced };
    for (const l of [...this.contentListeners]) l(event);
  }

  applyProgrammaticEdit(changes: ContentChange[]): void {
    this.applyEdit(changes, "programmatic");
  }

  /** Simulate a real user keystroke/paste. */
  simulateUserEdit(changes: ContentChange[]): void {
    this.applyEdit(changes, "user");
  }

  /** Simulate the forbidden case: the editor rewriting bytes on its own. */
  simulateSilentRewrite(changes: ContentChange[]): void {
    this.applyEdit(changes, "unknown");
  }

  /** Find/replace behaves as a user-initiated batch edit (Monaco semantics). */
  simulateFindReplace(find: string, replace: string): number {
    const changes: ContentChange[] = [];
    let idx = 0;
    while ((idx = this.text.indexOf(find, idx)) !== -1) {
      changes.push({ rangeOffset: idx, rangeLength: find.length, text: replace });
      idx += find.length;
    }
    if (changes.length > 0) this.applyEdit(changes, "user");
    return changes.length;
  }

  simulateUndo(): { versionIdBefore: number; versionIdAfter: number } | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    const versionIdBefore = this.versionId;
    this.redoStack.push(this.text);
    const changes: ContentChange[] = [
      { rangeOffset: 0, rangeLength: this.text.length, text: prev },
    ];
    this.text = prev;
    this.versionId++;
    const event: ContentChangeEvent = {
      versionId: this.versionId,
      changes,
      origin: "user",
      forced: true,
    };
    for (const l of [...this.contentListeners]) l(event);
    return { versionIdBefore, versionIdAfter: this.versionId };
  }

  simulateRedo(): { versionIdBefore: number; versionIdAfter: number } | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    const versionIdBefore = this.versionId;
    this.undoStack.push(this.text);
    const changes: ContentChange[] = [
      { rangeOffset: 0, rangeLength: this.text.length, text: next },
    ];
    this.text = next;
    this.versionId++;
    const event: ContentChangeEvent = {
      versionId: this.versionId,
      changes,
      origin: "user",
      forced: true,
    };
    for (const l of [...this.contentListeners]) l(event);
    return { versionIdBefore, versionIdAfter: this.versionId };
  }

  /** Move the caret (fires cursor listeners exactly like a real editor). */
  moveCursor(position: Pos, extraSelections: { start: Pos; end: Pos }[] = []): void {
    const event: CursorEvent = {
      position,
      selections: [{ start: position, end: position }, ...extraSelections],
    };
    for (const l of [...this.cursorListeners]) l(event);
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
    this.selectionsSet.push(range);
  }

  revealRangeInCenter(range: TextRange): void {
    this.revealed.push(range);
  }

  applyDecorations(kind: DecorationKind, decs: Decoration[]): void {
    this.decorationsByKind.set(kind, decs.map((d) => ({ ...d })));
  }

  setViewport(firstVisibleLine: number, lastVisibleLine: number): void {
    this.viewport = { firstVisibleLine, lastVisibleLine };
  }

  getViewport(): { firstVisibleLine: number; lastVisibleLine: number } {
    return { ...this.viewport };
  }

  mountInfo(): MountInfo {
    return { ...this.info, features: { ...this.info.features } };
  }

  dispose(): void {
    this.disposed = true;
    this.contentListeners = [];
    this.cursorListeners = [];
  }
}
