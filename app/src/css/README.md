# app/src/css — the shell's split stylesheets

Seven sheets `@import`-ed by `../styles.css` in order: theme tokens, then
header/popup/menubar/banner chrome, the main-area canvas, tool windows,
window-pane contents, dialogs and the AI panel. Verdict paint stays out of
these sheets: the skin suite (`app/test/shell1c.skin.test.tsx`) proves
app/src restates none of the five canonical verdict hexes and that no
`!important` rides paint-bearing properties in `../styles.css`.

## Files (verified)

Verified purposes from `audit/AUDIT-app-src.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `tokens.css` | 39 | Theme tokens: dark palette variables on .app-root, light overrides under [data-theme=light], scrollbar styling and the hint/mono utility classes. |
| `chrome.css` | 102 | Header/popup/menubar/banner chrome rules on the token variables: 42px header, 30px controls, radius 7-10px popups, banner severity fills. |
| `canvas.css` | 78 | Main-area rules: 44px rail with 34px buttons, canvas + dotted grid, graph host, stats pill, zoom cluster, legend chips/panel and the inspector card. |
| `windows.css` | 53 | Tool-window rules: window frame (radius 11px, 32px titlebar), mode tag, buttons, per-dock-kind resize handles, drop-zone highlight and the gear popup. |
| `panes.css` | 74 | Window-content rules: explorer rows (25px), editor tab strip + host, legend body, diagnostics list (class-only severity tags, no verdict hexes), pins console and the 26px status bar. |
| `dialogs.css` | 108 | Welcome, search dialog, modal base (radius 14px), settings dialog (nav/pages/theme cards/accent row/steppers/plugin rows), about grid and gap-report rules. |
| `ai.css` | 18 | AI panel rules: ask row, transport badges (fake/error/warn border variants), answer block and tool-call cards. |
