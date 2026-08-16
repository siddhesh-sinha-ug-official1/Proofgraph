# REPORT — APP-SHELL (IDE-grade human face; app/ rebuild per APP-SHELL-CONTRACT)

Component: `proofgraph/app` (assembly code only — cells untouched, packages/* read-only).
Round: app-shell (post-master-assembly; contract frozen in APP-SHELL-CONTRACT.md).
Parallel agent: HUB-workspace-fs (hub endpoints) — this component codes against the
contract SHAPES, mocks them in its suites, and leaves the live loop to the Integrate
stage. (The hub legs landed on disk mid-round; hub suite ran 44 OK with them.)

## What stands

- **Chrome**: accessible menubar (File/Edit/View/Analysis/Help — roles
  menubar/menu/menuitem, ArrowUp/Down/Left/Right + Home/End, Esc closes and returns
  focus to the menubar button), thin toolbar (re-analyze · save · roots… ·
  tier/transport badges), status bar (schema pin <- GET /health; measured tier +
  transport <- the editor pane's capability probe, verbatim from
  `capability.wall.construct` or the declared stub floor; N/E/L <- the byte-gated served
  envelope's id sets; selected nodeId <- the V5 joined bus). Keyboard: Ctrl+S, Ctrl+,,
  Ctrl+Shift+E, Ctrl+Shift+G (each probed `shell.key`).
- **Panels**: explorer (lazy hub `/fs/list` tree, one fetch per first expand, icons by
  extension, dirty dots, named-class note instead of a blank tree), editor TABS
  (`TabsStore` — per-tab buffer cache, dirty markers, unsaved-close guard; ONE
  editor-wall instance keyed by the active tab: switch = dispose+mount, probed
  `shell.editor.dispose`/`shell.editor.mount` — cell 4's one-document bound, never a
  silent remount), graph dock (cell 5's wall reused; collapsible canonical legend;
  zoom-to-fit = GraphView-component remount -> React Flow `fitView`, the wall cell and
  its pins survive), bottom dock (AI panel reused verbatim; diagnostics read off the
  CELL's own `editor.lsp.in.diagnostics` pin; pins console = filterable tail of hub
  `/pins/history` + `window.pgShellLog`). Docks toggleable; splitters pointer-drag with
  min sizes (`clampSplit` pure + unit-tested); layout/prefs/recents persisted under
  VERSIONED localStorage keys, every mutation probed.
- **Dialogs**: Open folder/file (server-side browse — the browser NEVER touches the
  filesystem), root picker (`/fs/roots-candidates`, multi-select, current declared
  roots shown, NEVER inferred -> POST `/analyze{roots}`), Preferences (theme with
  prefers-color-scheme default, font size, graph cap -> the wall's PROBED
  `capConfig.maxNodes`, auto-reanalyze-on-save), About (served pin, wall versions,
  measured-tier-or-honest-floor, licenses incl. the elkjs EPL-2.0 note, out-of-scope
  list VERBATIM).
- **Flows**: Save = PUT `/fs/file` (LSP didChange already live in the cell) + optional
  auto `/analyze`; Re-analyze = POST `/analyze` (declared pyright config) -> full
  refresh (byte-gate re-run, wall re-mount probed); Export = the SERVED bytes verbatim
  (graphSource already kept them; `fetchAnalysis` additively returns `bytes`), never a
  re-serialization.

## Honesty proofs

- No dead buttons: every item has an action or `title="reason"`; a click on a disabled
  item is probed `shell.menu.blocked` (asserted); Import is OMITTED entirely.
- Hub refusals verbatim: `path-escape` (proven end-to-end into the banner region),
  `workspace-not-open`, `fs-io-error`, `pipeline-busy` pass through untouched;
  off-contract 200 bodies are the NAMED `fs-shape-mismatch` (refused whole).
- New catalog classes (ARCHITECTURE-PHASE2.md, rebased onto the hub agent's entries):
  `fs-shape-mismatch`, `save-refused`.
- Green never faked: `/analysis` pending renders PENDING everywhere (status bar, export
  + gap-report disabled with the class in the reason); the stub editor floor declares
  itself; the bundle-secret scan stays build-failing and passes.
- Probe surface: `window.pgShellLog` (append-only, tail-bounded 2000 — the trim itself
  is probed once), tail visible in the pins console. Spike surfaces added:
  `window.pgShellBus`, `window.pgShellTabs` (alongside pgEditorWall/pgGraphWall).

## Bounds (logged, never silent)

1. **span-file remap** (inherited, generalized): extractor-relative `span.file` matched
   to the workspace-relative open path by path-segment suffix (`spanFileMatches`,
   unit-tested); ids + byte spans cross untouched; declared in the editor status line.
2. **one open document**: unchanged cell-4 bound — the shell's tab switch IS
   dispose+mount, probed; test asserts dispose strictly precedes the next mount.
3. **shell log tail bound** (2000, probed on first trim) and **pins-console tail**
   (120/stream client-side; the hub flags its own truncation server-side).
4. **banner region tail** (last 5) — older banners scroll off; every failure is also
   probed, so nothing is lost from the record.
5. **bundled-fixture fallback** (declared): a hub without workspace-fs endpoints backs
   the editor with the bundled moatpkg fixture; the tab carries `readOnlyReason` and a
   save attempt is the probed, bannered `save-refused` — never a silent no-write.
6. **recents bound** (8, dedup, probed) · **font-size bounds** (8-32, clamped on load) ·
   **splitter min sizes** (explorer 150 / center 260 / graph 220 / bottom 90 / top 180;
   degenerate-container rule: near minimum wins, deterministic).
7. **theme scope**: the chrome themes light/dark; Monaco keeps the CELL's darcula theme
   (cell-owned — the shell does not reach through the wall to restyle it). Declared in
   the Preferences dialog.
8. **zoom-to-fit mechanism**: GraphView React component remount (fitView-on-mount);
   the wall cell is NOT re-created (pins survive). Probed `shell.graph.zoom-to-fit`.

## Tests (all commands from proofgraph/app)

- `npx vitest run` -> **6 files, 71 passed + 1 todo** (the deliberate acceptance
  PENDING): shell.units 27 · shell.face 16 · v4.serve 8 · v5.bus 9 · p3.face 10+1todo ·
  p3.build.gate 1 (vite build + secret scan).
- `npx tsc --noEmit` -> clean.
- `python ../hub/test_hub.py` -> 44 OK (1 skipped) — with the parallel hub legs on disk.
- Live spot check against the RUNNING master-round hub (8477, pre-fs process): shell
  renders at measured tier CT (hub-lsp-ws), explorer names `unknown-endpoint` honestly,
  fallback tab stands, diagnostics tab carries the live pyright row, status bar fully
  served-fact-driven, zero console errors (browser pane, port 5199).

## p3.face adaptation (renames listed, behavior unchanged)

- ONE selector: `findByText("no-analysis-computed")` -> `findAllByText(...)` + length
  assertion — the named class now legitimately surfaces in TWO regions (info banner and
  the status bar's analysis segment). Every behavior assertion is untouched.

## Known seams for the Integrate stage

- The live save->re-analyze->graph-shrinks loop (contract acceptance script) needs the
  hub WITH workspace-fs running; unit suites mock the contract shapes only.
- `POST /analyze` request field names (`root`/`roots`/`config.pyright`) follow the
  contract; if the landed hub leg spells the config differently, the Integrate stage
  reconciles AT THE HUB's vocabulary (this module centralizes it in `fsSource.ts` +
  `runAnalyze`).
- The `/analysis`-pending info-banner + status-bar duplication is deliberate (region
  ownership); if the Integrate stage prefers one surface, drop the banner leg, not the
  status fact.
