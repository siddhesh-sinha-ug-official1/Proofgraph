/**
 * Editor-pane Monaco glue (SUB200 split of EditorPane.tsx — no behavior
 * change): the Monaco worker wiring (editor worker only — the LSP is the
 * cell's own pump), locating the mounted editor under the pane's host node,
 * and the EditorApi over Monaco BUILT-IN actions (undo/redo/find/replace —
 * the Edit menu's targets; reuse, never reinvented). Imported ONLY by
 * EditorPane.tsx, which is React.lazy — monaco + ?worker imports never
 * execute under jsdom/vitest.
 */

// Monaco worker wiring (editor worker only — the LSP is the cell's own pump).
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import * as monaco from "monaco-editor";
(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

import type { MonacoEditorAdapter } from "@editor-shell/src/mount/monaco/monaco-adapter.js";
import type { EditorApi } from "./editorPaneKit";

/** The mounted Monaco instance whose DOM lives under the pane's host node. */
export function findEditorUnder(host: HTMLElement | null): monaco.editor.ICodeEditor | null {
  return monaco.editor.getEditors().find((ed) => {
    const dom = ed.getDomNode();
    return dom !== null && host !== null && host.contains(dom);
  }) ?? null;
}

/** Monaco built-in actions for the Edit menu (reuse, never reinvented). */
export function makeEditorApi(editor: monaco.editor.ICodeEditor, adapter: MonacoEditorAdapter): EditorApi {
  return {
    getText: () => adapter.getText(),
    focus: () => editor.focus(),
    undo: () => { editor.focus(); editor.trigger("app-shell-menu", "undo", null); },
    redo: () => { editor.focus(); editor.trigger("app-shell-menu", "redo", null); },
    find: () => { editor.focus(); editor.trigger("app-shell-menu", "actions.find", null); },
    replace: () => { editor.focus(); editor.trigger("app-shell-menu", "editor.action.startFindReplaceAction", null); },
  };
}
