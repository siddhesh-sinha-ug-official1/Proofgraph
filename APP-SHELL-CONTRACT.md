# App-shell round — IDE-style browser interface (contract, frozen before build)

The Phase-3 face was a walking skeleton (split view, zero chrome — per OUTERWALL-CONTRACT
"minimal this round"). This round gives it the IDE grammar users expect (PyCharm-style)
WITHOUT breaking any membrane rule: the browser never touches the filesystem — every file
operation is a hub endpoint, path-jailed to the opened workspace root.

## Hub additions (assembly code, additive; all probed; hub binds 127.0.0.1 only)

- `GET  /workspace`            → {root, package, declaredRoots, analyzedAt, pyrightMode}
- `GET  /fs/list?path=REL`     → dir listing {entries:[{name, kind:dir|file, size}]}, jailed
- `GET  /fs/file?path=REL`     → {path, bytes(base64|utf8), sha256} — jailed, read-only outside jail is refused
- `PUT  /fs/file`              → save {path, content}; jailed; refuses paths outside the
                                 workspace root with failure class `path-escape` (probed);
                                 returns new sha256; emits hub.fs.write pin
- `POST /analyze`              → (exists) re-runs the pipeline on {root?, roots?, config?};
                                 NOW ALSO recomputes + re-attaches the outer-wall analysis
                                 (same-pipeline pattern) so /graph + /analysis stay one wall
- `GET  /fs/roots-candidates`  → decl nodes eligible as declared roots (id, name, kind) —
                                 feeds the root-picker dialog; roots remain DECLARED
- Failure classes: `path-escape`, `workspace-not-open`, `fs-io-error` (+ existing catalog)

## App shell (proofgraph/app — real layout engineering)

```
┌ menubar: File · Edit · View · Analysis · Help ──────────────────────────────┐
├ toolbar (thin): re-analyze · save · root picker · tier/transport badges ────┤
├──────────┬────────────────────────────────┬─────────────────────────────────┤
│ explorer │ editor tabs (Monaco)           │ graph dock (React Flow wall)    │
│ (hub fs) │ one wall instance per visible  │ verdict legend collapsible      │
│          │ tab; switch = dispose+mount    │                                 │
├──────────┴────────────────────────────────┴─────────────────────────────────┤
│ bottom dock tabs: AI outlet · diagnostics (LSP) · pins console              │
├ status bar: schema pin · measured tier · transport · N nodes/E edges/L leads│
└ selected nodeId ────────────────────────────────────────────────────────────┘
```

- Menus (ALL functional or visibly disabled-with-reason — no dead buttons, no silent no-ops):
  File: Open folder… (server-side browse dialog over /fs/list), Open file, Save (Ctrl+S →
  PUT /fs/file → pyright re-check via LSP didChange already live → optional auto re-analyze
  toggle), Re-analyze, Export analysis JSON / graph JSON (client download of served bytes),
  Recents (localStorage). Import: NOT in this round — omit entirely (nothing imports).
  Edit: Undo/Redo/Find/Replace → Monaco built-in actions on the active editor wall.
  View: toggle explorer/graph/bottom docks; light/dark; graph zoom-to-fit; reset layout.
  Analysis: Run analyze (POST /analyze + refresh), Choose declared roots… (dialog over
  /fs/roots-candidates; multi-select; NEVER inferred), pyright live/none (config of the
  re-run), Show gap report (rendered from /analysis gapAnalysis).
  Help: About (schema PIN, wall versions, measured tier verbatim from pins, licenses incl.
  the logged elkjs EPL-2.0 note), links to README paths (copyable, not file://).
- Preferences dialog (View > Preferences / Ctrl+,): theme, editor font size, graph cap
  config (maps to the wall's probed caps), auto-reanalyze-on-save; persisted localStorage;
  every preference change probed on the app's own log.
- Editor tabs: cell 4's wall is one-document-per-instance (known bound) — tab switch =
  dispose + mount (the probed real path; no silent remount); dirty markers from buffer
  state; unsaved-changes guard on close.
- Splitters: pointer-drag resize, min sizes, layout persisted; keyboard: Ctrl+S save,
  Ctrl+, prefs, Ctrl+Shift+E explorer focus, Ctrl+Shift+G graph focus.
- Status bar facts read from PINS (tier from capability.wall.construct via hub, counts from
  the served envelope) — never hardcoded.
- Honesty in chrome: disabled items carry title="why"; every hub failure surfaces as the
  named class in a non-blank banner (existing pattern); bundle-secret scan stays build-failing.

## Out of scope this round (say so in Help > About)
Command palette, multi-workspace, VCS integration, live AI transport UI, plugin system.

## Acceptance for this round (one script, headless + suites)
open folder → tree lists moatpkg → open core.py → edit (introduce a call to unused_fn) →
Save → re-analyze → the graph updates (unused set shrinks — the edit made it reachable) →
undo edit → save → re-analyze → unused returns. Path-escape PUT refused with the named
class. All existing suites stay green (app vitest, hub, cells untouched).
