/**
 * The editor-shell cell — public path (SUB200 restructure facade).
 *
 * The composition root now lives in ./cell/cell.ts with its open sequence,
 * diagnostics flow, LSP feature helpers and introspection split into sibling
 * modules under ./cell/. This module re-exports the exact historical surface:
 * EditorShellCell, createEditorShellCell, CellConfig.
 */

export { EditorShellCell, createEditorShellCell } from "./cell/cell.js";
export type { CellConfig } from "./cell/config.js";
