# editor-shell/src/mount/monaco

The real-Monaco adapter - the only directory allowed to import Monaco (enforced by the S9 gate): `monaco-adapter.ts`, event mapping (`monaco-events.ts`), decoration mapping (`decorations.ts`), and the Darcula theme data (`darcula-theme.ts`).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `monaco-adapter.ts` | 192 | The real-Monaco EditorAdapter: creates model+editor with the darcula theme, wires content/cursor events (programmatic edits flagged via the executeEdits window), maps decorations (markers via setModelMarkers, others via deltaDecorations), reports mountInfo with honest semanticHighlighting:false and document.fonts-checked font resolution. |
| `darcula-theme.ts` | 39 | PROOFGRAPH_DARCULA token-color theme data (vs-dark base, 9 rules, Darcula palette) and the SEVERITY name->MarkerSeverity table. |
| `decorations.ts` | 37 | Decoration -> Monaco IModelDeltaDecoration mapping per kind: gutter -> glyphMarginClassName(+hover), outline -> linesDecorationsClassName, highlight -> className. |
| `monaco-events.ts` | 51 | Monaco -> adapter event mapping: content changes labeled programmatic only inside the cell's executeEdits window (everything else = user; true silent rewrites are caught by S1's divergence cross-check), cursor selections mapped to CursorEvent. |
