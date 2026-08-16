# editor-shell/demo

The Vite demo (port 5183): `demo-cell.ts` wires a real MonacoEditorAdapter cell over the stub server at CT; `main.tsx` renders the editor pane, sibling graph-pane stand-in chips (bus-only communication) and a live probe console; `styles.css` carries the pg-fill-*/pg-outline-* decoration classes the cell paints.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `demo-cell.ts` | 84 | Demo wiring: builds the stub server + CT stub capability + MonacoEditorAdapter cell over the type-error.py fixture; outlineDisplay uses the shared canonical worstOfVerdict (the old inverted demo-local mirror is deleted - ruling 4); shortPayload/exposeForSpike helpers. |
| `main.tsx` | 157 | The React demo shell: editor pane + sibling graph-pane stand-in chips (bus-only communication) + a live probe console tapping '*'; chips mirror S5 decisions probe-free; buttons dump()/probeCatalog()/history() to the console. |
| `index.html` | 12 | Vite entry page: #root + a module script loading main.tsx. |
| `styles.css` | 78 | Demo styling: panes/chips/probe console plus the pg-fill-*/pg-outline-*/pg-brush-highlight decoration classes the cell paints (grey dashed = not-yet-computed). |
