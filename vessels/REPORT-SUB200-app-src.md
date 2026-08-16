# REPORT-SUB200 — app/src (wave 2)

Sub-200 restructure, wave 2: every non-exempt source file in app/src now UNDER
200 lines (measured max 188). Behavior-preserving cohesion splits only; every
original module path remains as a FACADE re-exporting the new submodules —
zero churn for external importers (all 23 test files, main.tsx, and the
acceptance/headless drivers kept their import paths and selectors). Logged in
agentic-convos/remediation-round.md (assembly code — the transcript is the
record; no ASSEMBLY-CHANGES.md exists for app/).

## Splits (old → new)

- **App.tsx 1188 → 128 (facade component)** + appCore.ts 111 (props/types/
  transports/singletons + downloadServedBytes) + useAppData.ts 176 (load
  pipeline: graph gate → analysis overlay → wall → /health + /workspace;
  refreshAll; hub chip) + useAppUi.ts 117 (layout/dialog/selection/canvas
  state + interactions) + useAppFlows.ts 151 (analyze/save + keyboard) +
  useFileFlows.ts 122 (open file/folder, close tab, initial tab + bundled-
  fixture fallback) + useAppDerived.ts 122 (render facts, all sourced) +
  useShell.ts 63 (fixed-order composition; ShellCtx inferred) + appMenus.tsx
  186 (menu model, no dead buttons) + AppMain.tsx 161 (canvas + overlays +
  inspector + WindowLayer wiring) + EditorWindowBody.tsx 83 (tab strip +
  keyed dispose/mount host incl. DisabledEditorHost) + VerdictLegend.tsx 51 +
  AppDialogs.tsx 72. Spike surfaces (pgShellBus/pgShellTabs/pgGraphWall),
  probe ids, hook semantics and DOM (classes/testids/roles) unchanged.
- **styles.css 553 → 88** + css/tokens.css 39 + css/chrome.css 102 +
  css/canvas.css 78 + css/windows.css 53 + css/panes.css 74 +
  css/dialogs.css 108 + css/ai.css 18. styles.css stays the single entry
  (@import — vite inlines) AND keeps the cell-5 DOM skin section INTACT
  byte-for-byte (comment block + rules), because test/shell1c.skin reads
  THIS file's bytes: verdict-hex grep 0, skin-live + paint-untouched, and
  no-!important-on-paint all still assert against styles.css. Rule content
  unchanged; only the sections moved.
- **layout2.ts 411 → 36 (facade)** + layout2Model.ts 78 (types + spec
  constants + defaults) + layout2Geometry.ts 123 (pure math) +
  layout2Machine.ts 92 (probed WinState reducers) + layout2Persist.ts 135
  (versioned storage + loud v1→v2 migration). The layout2 tests (now split
  across shell1c.layout2*.test.ts by the tests agent) import the facade —
  green.
- **dialogs.tsx 364 → 25 (facade)** + dialogModal.tsx 39 + dialogBrowse.tsx
  172 (OpenPathDialog + RootPickerDialog) + dialogInfo.tsx 160
  (PreferencesDialog + AboutDialog + GapReportDialog + OUT_OF_SCOPE_VERBATIM).
- **EditorPane.tsx 342 → 185 (facade component)** + editorPaneKit.ts 187
  (types incl. EditorPaneProps, probeHubCapability, resolveEditorCapability,
  editorNodesFor, diagnostics tap, status detail strings) +
  editorPaneMonaco.ts 39 (worker wiring + findEditorUnder + makeEditorApi).
  Still React.lazy-only — monaco/?worker never execute under jsdom.
- **ToolWindows.tsx 315 → 182 (facade, WindowLayer)** + toolWindowKit.tsx 83
  (gear model + WINDOW_MODE_DISABLED_REASON re-exported) + toolWindowDrag.ts
  105 (title-drag tear/dock + resize wiring; persists once on release).
- **busAdapter.ts 290 → 104 (facade: full design doc + join assembly +
  config log entries)** + busAdapterCore.ts 101 (types + shared AdapterCtx) +
  busAdapterSides.ts 138 (editor/graph port factories; guards + log verbatim).
- **graphSource.ts 267 → 43 (facade)** + graphSourceCore.ts 107 (pin, error
  class, envelope shapes, pin check) + graphSourceVerify.ts 153 (fetch legs,
  serializer-edge-drop gate, byte-level id helpers).
- **fsSource.ts 236 → 40 (facade)** + fsSourceCore.ts 69 (transport + doJson
  + shape refusal) + fsSourceApi.ts 154 (contract endpoints).
- **Header.tsx 223 → 136 (facade component, LogoMark + popup state)** +
  headerMenus.tsx 113 (project switcher / settings cog / hub chip) +
  headerAnalyze.tsx 79 (analyze split-button + search).
- **SettingsDialog.tsx 222 → 98 (facade component, nav + accent-draft
  state)** + settingsAppearance.tsx 69 + settingsPanels.tsx 120
  (Editor·Font / Analysis / Plugins; ComposedPiece re-exported).

Already under 200, untouched: BottomDock 188, analysisSource 184,
SearchEverywhere 175, MenuBar 175, Explorer 172, prefs 168, tabsStore 138,
AiPanel 125, layout 101, lspTransport 89, Rail 85, StatusBar 81, shellLog 70,
Welcome 65, uris 41, main.tsx 26, vite-env.d.ts 14.

## Exemptions

None in app/src. (app/test* is the concurrent app-tests agent's area; dist/
is regenerated build output outside src.)

## Verification

- `npx vitest run` (FULL, incl. the P3 build gate): **23 files, 111 passed +
  1 todo — GREEN**, measured AFTER the concurrent app-tests agent's test
  split landed (baseline joint state: 9 files / 111 + 1 todo before either
  split; test count preserved, no assertion weakened; the same 111+1 is the
  joint final count).
- `npx tsc --noEmit`: exit 0.
- Build gate: `npx vite build` succeeds inside the suite; bundle secret scan
  clean — proves the @import CSS split and every facade resolve in the real
  build, not just jsdom.
- shell1c.skin (3 tests): green against the restructured styles.css —
  verdict-hex grep over ALL of app/src (recursive, includes css/) still 0;
  skin sheet live (box-sizing lands) with fill/ring computed + inline colors
  byte-identical enabled vs disabled; no !important on paint properties.

## Final line-count table (every file in app/src, ceiling < 200 proven)

| lines | file |
| --- | --- |
| 188 | BottomDock.tsx |
| 187 | editorPaneKit.ts |
| 186 | appMenus.tsx |
| 185 | EditorPane.tsx |
| 184 | analysisSource.ts |
| 182 | ToolWindows.tsx |
| 176 | useAppData.ts |
| 175 | SearchEverywhere.tsx |
| 175 | MenuBar.tsx |
| 172 | dialogBrowse.tsx |
| 172 | Explorer.tsx |
| 168 | prefs.ts |
| 161 | AppMain.tsx |
| 160 | dialogInfo.tsx |
| 154 | fsSourceApi.ts |
| 153 | graphSourceVerify.ts |
| 151 | useAppFlows.ts |
| 138 | tabsStore.ts |
| 138 | busAdapterSides.ts |
| 136 | Header.tsx |
| 135 | layout2Persist.ts |
| 128 | App.tsx |
| 125 | AiPanel.tsx |
| 123 | layout2Geometry.ts |
| 122 | useFileFlows.ts |
| 122 | useAppDerived.ts |
| 120 | settingsPanels.tsx |
| 117 | useAppUi.ts |
| 113 | headerMenus.tsx |
| 111 | appCore.ts |
| 108 | css/dialogs.css |
| 107 | graphSourceCore.ts |
| 105 | toolWindowDrag.ts |
| 104 | busAdapter.ts |
| 102 | css/chrome.css |
| 101 | layout.ts |
| 101 | busAdapterCore.ts |
| 98 | SettingsDialog.tsx |
| 92 | layout2Machine.ts |
| 89 | lspTransport.ts |
| 88 | styles.css |
| 85 | Rail.tsx |
| 83 | toolWindowKit.tsx |
| 83 | EditorWindowBody.tsx |
| 81 | StatusBar.tsx |
| 79 | headerAnalyze.tsx |
| 78 | layout2Model.ts |
| 78 | css/canvas.css |
| 74 | css/panes.css |
| 72 | AppDialogs.tsx |
| 70 | shellLog.ts |
| 69 | settingsAppearance.tsx |
| 69 | fsSourceCore.ts |
| 65 | Welcome.tsx |
| 63 | useShell.ts |
| 53 | css/windows.css |
| 51 | VerdictLegend.tsx |
| 43 | graphSource.ts |
| 41 | uris.ts |
| 40 | fsSource.ts |
| 39 | editorPaneMonaco.ts |
| 39 | dialogModal.tsx |
| 39 | css/tokens.css |
| 36 | layout2.ts |
| 26 | main.tsx |
| 25 | dialogs.tsx |
| 18 | css/ai.css |
| 14 | vite-env.d.ts |

## Notes / bounds (declared, not fixed — behavior-preserving round)

- Effect REGISTRATION order shifted slightly (data-pipeline effects now
  register before the selection-subscription/canvas effects; previously
  interleaved). All effects are independent (async fetch vs. subscriptions);
  no observable ordering dependency exists, and the full suite + build gate
  agree.
- The @import order places css/ai.css before the skin section (originally
  after); the two share no selectors — cascade unchanged.
- No renames of public surfaces; no bugs found to report; no assertion or
  probe id touched.

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 6 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: fsSourceApi.ts 154→160; App.tsx 128→129; layout.ts 101→107; lspTransport.ts 89→90; fsSource.ts 40→46; dialogs.tsx 25→27. 'measured max 188' still true (BottomDock.tsx 188). All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
