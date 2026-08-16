/**
 * Decoration → Monaco delta-decoration mapping — SUB200 restructure: split
 * from MonacoEditorAdapter.applyDecorations, logic verbatim. Monaco-only
 * module (inside src/mount/monaco/, per the S9 gate).
 */

import * as monaco from "monaco-editor";
import type { Decoration, DecorationKind } from "../adapter.js";

export function toDeltaDecorations(
  kind: DecorationKind,
  decs: Decoration[],
): monaco.editor.IModelDeltaDecoration[] {
  return decs.map((d) => {
    const range = new monaco.Range(
      d.range.startLine,
      d.range.startColumn,
      d.range.endLine,
      d.range.endColumn,
    );
    switch (kind) {
      case "gutter":
        return {
          range,
          options: {
            isWholeLine: false,
            glyphMarginClassName: d.style,
            glyphMarginHoverMessage: d.hoverText ? { value: d.hoverText } : undefined,
          },
        };
      case "outline":
        return { range, options: { linesDecorationsClassName: d.style } };
      default: // highlight
        return { range, options: { className: d.style, isWholeLine: false } };
    }
  });
}
