# Handoff: ProofGraph IDE shell (31lean-push)

Design handoff for the APP-SHELL round of `proofgraph/app`. Drop this folder next to
`30lean-push/proofgraph/` (or anywhere in the repo, e.g. `proofgraph/shell-design/`)
and point Claude Code at this README.

## Overview
Three JetBrains-grade shell explorations over the composed ProofGraph organism:

- **1a `ProofGraphClassic.dc.html`** — Classic/Darcula lineage: always-visible menubar,
  thin toolbar (re-analyze · save · roots), labeled tool-window stripes on the edges,
  dense 22px rows, square corners, dark default.
- **1b `ProofGraphNewUI.dc.html`** — New UI (2023+) lineage: hamburger main menu,
  project widget left, analyze **split run-widget right-of-center**, Search Everywhere +
  Settings cog far right, icon tool-window rails, rounded island panels on a canvas,
  nav-bar breadcrumbs in the status bar, 25px rows, light default.
- **1c `ProofGraphGraphFirst.dc.html`** — Graph-first: the verdict graph is a full-bleed
  pannable canvas; Project / Editor / AI outlet / Diagnostics / Pins console are **true
  JetBrains tool windows** with the complete view-mode taxonomy (see below), drag-to-dock,
  and per-window gear (⚙) options menus. Dark default.

All three run against the same demo corpus (`proofdata.js`) and share one interaction
contract (menus, banners, status bar, dialogs). Open any `.dc.html` directly in a browser —
`proofdata.js` and `support.js` must sit beside it.

## About the design files
These are **design references created in HTML** (self-running prototype components) —
NOT production code to copy in. The task is to **recreate the chosen shell in
`proofgraph/app`'s existing environment**: React 18 + Vite + TypeScript, Monaco behind
`EditorPane.tsx` (cell 4's wall, one document per instance), React Flow behind
`@graph-view/src/GraphView` (cell 5's wall), hub transport via `fsSource.ts` /
`graphSource.ts` / `analysisSource.ts`. Use the codebase's established patterns
(`MenuSpec[]`, `LayoutState`, probes, failure-class banners) — do not introduce new
frameworks or a windowing library; the 1c windowing spec below is implementable with
plain absolutely-positioned React divs exactly as prototyped.

## Fidelity
**High-fidelity.** Colors, spacing, typography, radii and interaction details are final
design intent — recreate pixel-perfectly with the design tokens below. Exceptions
(deliberately mocked in the prototypes, real in the app): Monaco replaces the tokenized
code viewer; React Flow replaces the hand-positioned nodes; hub endpoints replace the
canned corpus; OS file dialogs stay **server-side** (hub `/fs/list`) per the membrane rule.

## Membrane rules (unchanged, load-bearing)
- The browser NEVER touches the filesystem — every file op is a hub endpoint,
  path-jailed hub-side (`GET /fs/list`, `GET/PUT /fs/file`, `POST /analyze`).
- Every hub failure renders its NAMED failure class in the banner region — never a blank pane.
- No dead buttons: disabled items carry `title="why"`.
- Verdict colors are proof semantics from `@graph-view/src/verdict` (`COLORS`, `HATCH_CSS`)
  — **never themed**. The accent color is free; verdict fills are canonical.
- Status-bar facts come from PINS or served data, never hardcoded.
- Every menu action, pref change and dock mutation is probed (`probeShell`).

## Screens / views (shared contract)
- **Header (1b/1c)** — 42px: hamburger (toggles full menubar inline) · logo · project
  switcher (`moatpkg ~/proofgraph ▾` → recent projects + Close project) · spacer ·
  **analyze split button** (primary `analyze` + `declared roots ▾` config dropdown,
  accent bg, radius 7px) · search-everywhere icon · settings cog (quick menu: Theme /
  Plugins / Settings…) · hub transport chip (`hub :8477` + status dot, clicking simulates
  an outage in the mock). 1a instead: classic menubar row + thin icon toolbar.
- **Banner region** — below header; per-banner: bold mono failure class + detail + dismiss ✕.
  Severity fills: error `#FCE8E8/#E8B4B4`, warn `#FBF3DC/#E0CD90`, info `#E9F1FB/#B5CDE8`
  (dark: `#43302F/#6E4341`, `#403A29/#6E6238`, `#2C3A4A/#41586F`).
- **Tool windows** — Project tree (hub fs), Editor (tabs + dirty dots + unsaved-close
  guard), Graph (pan/zoom/fit, selection ring in accent, inspector, collapsible legend),
  bottom dock (AI outlet · Diagnostics · Pins console). 1a/1b: fixed docks with drag
  splitters. 1c: windowing system below.
- **Status bar** — 26px: nav-bar breadcrumbs left (1b/1c) · schema pin · measured tier ·
  transport · `N nodes · E edges · L leads` · analysis state · `● n unsaved` · selected nodeId.
- **Dialogs** — Settings (Appearance: theme cards + free accent picker; Editor·Font;
  Plugins marketplace; Analysis: pyright live/none, auto-reanalyze-on-save, node cap),
  About (schema pin verbatim from `/health`), Choose declared roots (multi-select from
  `/fs/roots-candidates` — roots DECLARED, never inferred), Gap report (from served
  `/analysis.gapAnalysis`), Open folder/file + Search Everywhere (files + graph nodes).
- **Welcome screen** — logo, version line, `Open sample workspace` / `New empty workspace`,
  RECENT list. Close project returns here.

## 1c windowing spec (the new part — implement exactly)
State per tool window (extend `layout.ts`; persist under a NEW versioned key
`pgshell.layout.v2`; keep `clampSplit`-style pure helpers and unit-test them):

```ts
type Side = "left" | "right" | "bottom";
type ViewMode = "dock" | "undock" | "float";   // + pinned flag for dock
interface WinState {
  open: boolean;
  mode: ViewMode;
  pinned: boolean;      // dock only: pinned = always visible, unpinned = auto-hide
  side: Side;           // last/current dock edge (kept while floating)
  x: number; y: number; w: number; h: number;  // float geometry, px in canvas space
  z: number;            // float stacking; monotonically increasing counter
}
// windows: project · editor · ai · diag · pins
// shared per-edge dock sizes: sizeL=296, sizeR=340, sizeB=204 (px)
```

Defaults: project docked-left pinned; editor floating (640,40 620×430); diag docked-bottom
pinned; ai closed (float 520×330); pins closed (dock-bottom **unpinned**).

Behaviors (all prototyped in `ProofGraphGraphFirst.dc.html` — mirror it):
- **Layout math**: docked windows on one edge split it evenly with 10px gutters and 6px
  outer margin; left/right stacks are full-height columns of width sizeL/sizeR; bottom is
  a full-width row of height sizeB. Floats clamp into the canvas. Undock = full edge
  overlay (side: w=win.w, full height; bottom: h=win.h, full width) at z 44 with a heavier
  shadow, above docked windows, below drag/gear layers.
- **Gear (⚙) options menu** on every window header, flat with section headers:
  - `VIEW MODE` — **Dock Pinned** (default) · **Dock Unpinned** (auto-hides when focus
    moves to the canvas; rail icon restores) · **Undock** (edge overlay, auto-hides on
    canvas focus) · **Float** (free window, raises z) · **Window** — DISABLED with
    `title="a separate OS window needs the desktop shell — the browser keeps every
    surface in-frame"` (honest-disable contract; wire it if/when a desktop shell exists).
  - `MOVE TO` — Left · Right · Bottom (docks pinned to that edge; current edge shown
    checked and disabled).
  - separator, **Hide** (rail icon restores).
- **Drag-to-dock**: dragging a title bar >4px tears the window into float mode under the
  pointer; within 70px of the left/right edge or 80px of the bottom, the target dock zone
  highlights (accent fill, 2px dashed accent border, radius 12); releasing there docks
  pinned; releasing elsewhere leaves it floating. Buttons in the header are drag-exempt.
- **Auto-hide**: any pointer-down on the canvas closes every open dock-unpinned and
  undocked window (before pan begins), and closes menus/gear popups.
- **Resize**: floats — 15px corner handle (min 280×170); docked — 6px handle on the inner
  border adjusting that edge's shared size (left 220–540, right 240–640, bottom 140–460).
- **Z-order**: clicking a floating window raises it (counter++). Docked z≈10+, undock 44,
  dock-zone highlight 70, gear popup 76, header popups 90, dialogs 95.
- **Canvas**: dotted background (`radial-gradient` dot 1px / 24px grid), pan by drag,
  zoom 20–160%, **zoom-to-fit insets by open docked edges**; node double-click reveals in
  the Editor window (opens it if hidden); selection shows the floating inspector card
  (bottom-right, inset past the bottom/right docks); collapsible legend chip bottom-left;
  stats/help pill top-left; zoom cluster top-right (all inset past docked edges).
- **Rail** (44px, left): Project, Editor (top) · AI, Diagnostics, Pins (bottom) · Settings.
  Icon active-state = accent tint when its window is open. `View` menu mirrors these toggles
  + `Reset window layout`.

## Interactions & behavior (shared)
- Analyze: `POST /analyze {roots}` → banner `shell.analyze.ok`; hub down → banner
  `hub-unreachable` with the start command.
- Save (Ctrl+S / File›Save): `PUT /fs/file`, clears dirty dot, optional auto-reanalyze
  (preference). Closing a dirty tab confirms first.
- Diagnostics rows and structure/search hits open the editor at the line (highlight fill
  `--lnhl`; wavy underline per severity in the mock — Monaco markers in the real app).
- Hub outage (Help › Simulate…): explorer + fs menu items disable **with reasons**, pins
  fall back to app-shell stream with a warn banner, graph pane shows the named class.
- Escape closes popups/dialogs/gear menus.
- Theme: light/dark, live. Accent: free hex (picker + text field + 4 swatches), drives
  `--acc` only.
- Editor font-size stepper (1a/1b Settings › Editor·Font) 10–18px.

## Design tokens
UI font `"Segoe UI", system-ui`; mono `JetBrains Mono` (Google Fonts). Base 13px UI,
12.5–13px code, 11.5px status, 10.5px mono chips. Radii: panels/windows 11px, popups 10px,
controls 7px, chips 6px. Header 42px, window title bar 32px, rows 25px, status 26px,
rail 44px (34px buttons, radius 9px).

Light: canvas `#ECEEF2` · island `#FFFFFF` · raised `#F2F3F7` · border `#D8DAE0` · text
`#27282E` · dim `#6C707E` · hover `#E7E9EE` · popup `#FFFFFF`/`#D3D5DB` · edge `#B7BBC2`.
Dark: canvas `#131417` · island `#1E1F22` · raised `#2B2D30` · border `#333539` · text
`#DFE1E5` · dim `#9095A0` · hover `#33353A` · popup `#26282C`/`#404248` · edge `#5C6066`.
Accent default `#7C6FD4`; selection tint = accent @ 15% (28% dark).
Syntax (light/dark): keyword `#0033B3`/`#CF8E6D` · string `#067D17`/`#6AAB73` · comment
`#8C8C8C`/`#7A7E85` · func `#00627A`/`#56A8F5` · number `#1750EB`/`#2AACB8` · decorator
`#9E880D`/`#B3AE60` · self/param `#94558D`/`#C77DBB`.
Verdicts (CANONICAL — import, never restate): green `#2E7D32` · amber `#F9A825` · red
`#C62828` · blue `#1565C0` · unknown hatched grey `#9E9E9E` (unknown ≠ green; null outline
= dashed grey ring; leads dashed, never edges).

## State management → integration map
- `layout.ts` → v2: replace the three fixed panes with `Record<WinId, WinState>` +
  per-edge sizes (1c) or keep v1 shape (1a/1b). Pure layout math (edge stacking, clamps,
  drop-zone hit test) as exported functions with tests; probe every mutation
  (`shell.layout.*`), including view-mode changes (`shell.toolwindow.mode`).
- `prefs.ts` → add `accentColor: string` (free hex) alongside `theme`.
- `MenuBar.tsx` → menus verbatim from the mocks (File/Edit/View/Analysis/Help), including
  disabled-with-reason strings. View menu gains the five window toggles + Reset window layout.
- `Explorer.tsx` → Project window content (tree over `/fs/list`).
- `BottomDock.tsx` → in 1c, splits into three independent windows (AI/Diagnostics/Pins);
  keep the content components, drop the tab strip.
- `StatusBar.tsx` → add breadcrumbs segment (left) and keep sourced-facts contract.
- `dialogs.tsx` → PreferencesDialog gains Appearance page (theme cards + accent picker).
- `EditorPane.tsx` → unchanged wall; it mounts inside the Editor window (keyed
  dispose+mount per tab stays).
- Graph → `GraphView` mounts full-bleed under the window layer in 1c; keep fit-with-insets.

## Assets
No binary assets. Logo is an inline 3-node SVG mark (accent + green + red circles, grey
edges) — reuse as drawn in the mocks. JetBrains Mono via Google Fonts (self-host in the app).

## Files
- `ProofGraphClassic.dc.html` — 1a prototype
- `ProofGraphNewUI.dc.html` — 1b prototype
- `ProofGraphGraphFirst.dc.html` — 1c prototype (windowing spec of record)
- `proofdata.js` — demo corpus: moatpkg tree + tokenized sources, 14-node verdict graph,
  pyright diagnostics, pins tail, gap report, roots candidates, health pin
- `support.js` — prototype runtime (lets the `.dc.html` files run standalone; irrelevant
  to the app implementation)

## Suggested Claude Code prompt
> Read `31lean-push/README.md`. Implement the 1c graph-first shell in `proofgraph/app`
> per the "1c windowing spec" and "State management → integration map" sections, keeping
> every membrane rule. Open `31lean-push/ProofGraphGraphFirst.dc.html` in a browser as the
> visual reference. Extend `layout.ts` to `pgshell.layout.v2` with pure, unit-tested layout
> math; keep all existing suites green.
