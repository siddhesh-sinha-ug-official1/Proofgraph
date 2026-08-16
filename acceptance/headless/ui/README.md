# acceptance/headless/ui — the six-phase headless UI driver modules

Shared by `../headless_ui.mjs` (the gate's step-3 driver) and
`../browser_shot.mjs`: Chromium discovery and headless=new launch, a
minimal CDP client over Node's built-in WebSocket, then the phases —
render facts and censuses, file open, gutter glyphs, brushing both
directions with a real CDP mouse click, and the AI ask flow.
(`audit/AUDIT-acceptance.json`)

## Files (verified)

Verified purposes from `audit/AUDIT-acceptance.json`. Line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `browser.mjs` | 73 | Chromium discovery (PG_BROWSER env then Edge/Chrome paths), the shared typed browser-tooling-missing detail, and headless=new launch with ephemeral devtools port + temp profile returning waitForWsUrl/killBrowser; shared by headless_ui and browser_shot. |
| `cdp.mjs` | 86 | Minimal CDP client over Node's built-in WebSocket: openPage creates/attaches a page target and returns evaluate/pollPage/realClick (genuine Input.dispatchMouseEvent for Monaco)/navigate. |
| `facts.mjs` | 90 | Phases 1-2: waits for rendered graph nodes and a terminal editor phase, then reads page facts (DOM/a11y + pgGraphWall pins) and checks censuses, analysis status line, paint vocabulary, per-green paints with DOM presence, zero-green pages, module-stays-unknown and ghost placeholders. |
| `openfile.mjs` | 68 | Phase 3: waits for shell.file.open/shell.editor.mount pins, the a11y tab selection and editor readiness for the initial tab and the real explorer-click flow (opening the rail-project window if a layout pref closed it). |
| `gutter.mjs` | 64 | Phase 4: reads editor.verdict.gutter.paint/green.guard/green.blocked pins for every expected node, checks glyph classes against the spec, the pg-fill-green count, and the tier-G green-blocked assertions on attested kernel greens. |
| `brush.mjs` | 155 | Phase 5: graph-node DOM click asserted on editor busLog/reveal + graph link.select.out + a11y status bar; then a real CDP mouse click at a DOM-Range-located Monaco caret column (3 bounded attempts, elementFromPoint obstruction guard) asserted on editor.select.emit.bus + graph link.select.in/selection, with UTF-8 byte arrays in the evidence. |
| `ai.mjs` | 44 | Phase 6: opens the rail-ai tool window if closed, clicks ask, reads the DOM answer/badges/tool heads, checks must-contain and never-fabricates-ids, then closes the window again so persisted layout cannot obstruct the next page's caret click. |
