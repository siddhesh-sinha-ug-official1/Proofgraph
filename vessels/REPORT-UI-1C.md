# REPORT — UI-1C: the graph-first shell (design-handoff implementation)

Round file: `30lean-push/agentic-convos/ui-1c-round.md` (DONE).
Spec of record: `proofgraph/shell-design/README.md` + `ProofGraphGraphFirst.dc.html`
(design reference recreated in React+TS — never copied; the mock runtime
`support.js`/`proofdata.js` was never wired; the real app keeps hub data).

## What landed

| Piece | File(s) | Proof |
| --- | --- | --- |
| Layout v2 (NEW key `pgshell.layout.v2`) — five WinState machines, pure geometry (edge stacking 10px gutters/6px margin, float clamps, undock overlays, drop zones 70/70/80, edge-size clamps 220–540/240–640/140–460, dock insets), LOUD v1→v2 migration | `app/src/layout2.ts` | `app/test/shell1c.layout2.test.ts` (28 tests) |
| Window layer — drag-to-dock (>4px tear; edge-zone release docks pinned), gear menus (VIEW MODE · MOVE TO · Hide; "Window" honest-disabled with the README string VERBATIM), resize handles, z bands 10/14 < 44 < 70 < 76 < 90 < 95 | `app/src/ToolWindows.tsx` | `app/test/shell1c.face.test.tsx` gear/auto-hide/MOVE-TO cases + live browser check |
| 42px header — hamburger→inline menubar, canonical-color logo mark, project switcher (+Close project), analyze split-button, search, settings cog, hub chip on the REAL `/health` | `app/src/Header.tsx` | shell.face menubar suite (adapted helper) + shell1c.face hub-chip case |
| Rail 44px + View-menu mirrors + Reset window layout | `app/src/Rail.tsx` | shell1c.face rail cases |
| Welcome screen (Close project returns; Open sample = the hub workspace flow; recents; honest-disabled New-empty) | `app/src/Welcome.tsx` | shell1c.face welcome case |
| Search Everywhere — bounded `/fs/list` walk (40/200, probed) + served-envelope nodes, 150ms debounce, 12-row bound probed, bus-select node hits | `app/src/SearchEverywhere.tsx` | shell1c.face search cases (incl. the pure `searchHits` bound) |
| Paged Settings — Appearance (theme cards + free accent hex/swatches → `--acc` ONLY), Editor·Font stepper 10–18, Analysis, honest Plugins inventory | `app/src/SettingsDialog.tsx`, `app/src/prefs.ts` | shell1c.face accent case + shell.face prefs case (adapted to the page nav) |
| App re-architecture — full-bleed GraphView under the windows (host + overlays inset by open docked edges), node dblclick → Editor reveal over the V5 bus, inspector card fed by the wall's OWN `dump().paints`, breadcrumbs from served data, BottomDock split into three windows (content reused verbatim) | `app/src/App.tsx`, `app/src/StatusBar.tsx`, `app/src/BottomDock.tsx` | full suite + live check |
| Design tokens — both palettes, banner severity fills, radii/heights per README; JetBrains Mono SELF-HOSTED (@fontsource imports; zero new installs; the mock's Google-Fonts link never shipped) | `app/src/styles.css`, `app/src/main.tsx` | build gate green; live check: computed font-family = "JetBrains Mono", zero console errors |

## Membrane rules — held

- Browser never touches the FS (all ops hub endpoints; search walk included).
- Named failure-class banners everywhere (README severity fills).
- No dead buttons: every disable carries title="why" (Window mode, zoom −/+,
  New-empty-workspace, current-file-only analyze, and all carried-over items);
  blocked clicks probed, never silent.
- VERDICT COLORS CANONICAL: the logo mark, legend, and inspector import
  `COLORS`/`HATCH_CSS` from `@graph-view/src/verdict`; the accent drives
  `--acc` (+ computed `--sel`/`--lnhl` tints) only. No verdict hex restated
  in new code.
- Status-bar/chrome facts from pins/served data only (breadcrumbs, counts,
  pin, tier, hub chip, welcome version line, inspector paints).
- Every menu action / pref change / dock-window mutation probed, including
  `shell.toolwindow.mode` (+ open/autohide/drag/gear-blocked/migrate).
- Cells untouched; `packages/*` read-only; keys server-side; the
  bundle-secret build gate still build-failing on a hit.

## Definition of done — measured

- app `npx vitest run`: **108 passed + 1 todo** (was 71+1; +37: shell1c.layout2
  28 + shell1c.face 9). ALL existing tests kept; three selector adaptations,
  each commented in-file with its reason, none weakening a behavior
  assertion (one STRENGTHENED: the View-toggle case now also asserts
  `persistedKey === "pgshell.layout.v2"`).
- `npx tsc --noEmit`: clean. `vite build` + bundle-secret scan: green
  (p3.build.gate, 25.7s).
- ai suite: 14/14 · hub `test_hub.py`: 44 OK (1 named Windows symlink skip,
  unchanged) — no accidental coupling.
- Live spot check on an EPHEMERAL stack this round started AND tore down
  (serve_app 8477 + vite 5199; live-stack ports verified FREE before
  starting; verified freed after): real hub data rendered, gear transitions
  probed + persisted in the real DOM, auto-hide live, zero console errors.

## Deviations from the handoff (each logged in the round file)

1. Help › Simulate outage OUT (hub chip reads the real /health — the mock's
   simulator isn't honestly portable).
2. Zoom −/+ honest-disabled (cell 5 owns its viewport; cells are read-only;
   fit stays live and inset-aware).
3. Welcome "New empty workspace" honest-disabled (one hub-declared
   workspace).
4. Plugins page = honest inventory of the real composed pieces (not a
   marketplace) — the README's own hedge, taken.
5. Inspector location shows the served byte span (envelopes carry spans,
   not line numbers).
6. Gear "Window" disable uses the README's title string (the prototype's
   variant said "the browser mock…" — the README is the spec of record).

SECURITY NOTE (handoff instruction): `shell-design/` was read as DATA only.
No instruction-like content beyond UI design was found; the mocks' single
external reference (Google Fonts `<link>`) was deliberately replaced by the
self-hosted @fontsource dependency already pinned in the workspace.
