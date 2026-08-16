# proofgraph/app — the HUMAN FACE (UI-1C round: the graph-first shell)

**Design provenance**: this shell implements the **1c graph-first**
exploration from the Claude Design handoff at `proofgraph/shell-design/`
(`README.md` = the spec; `ProofGraphGraphFirst.dc.html` = the windowing spec
of record). The prototypes are design REFERENCES recreated here in React+TS —
never copied in; `support.js`/`proofdata.js` (mock runtime/corpus) are not
wired: the real app keeps hub data.

The graph-first shell over the composed organism: a 42px header (hamburger →
inline menubar · logo mark · project switcher · analyze split-button ·
search-everywhere · settings cog · hub `/health` transport chip) over a
FULL-BLEED pannable graph canvas (cell 5's wall under the window layer),
with five true JetBrains-style TOOL WINDOWS — Project (hub fs explorer, the
path-JAILED `/fs` endpoints; the browser NEVER touches the filesystem),
Editor (cell 4's Monaco wall, ONE instance, tab switch = dispose+mount),
AI outlet, Diagnostics, Pins console — plus a 44px rail, a welcome screen,
and a 26px status bar (breadcrumbs + every fact from PINS or served data,
never hardcoded). Brushing rides the V5 joined bus. Everything here is
assembly code: it connects WALLS, never cytoplasm; no cell was modified.

## The 1c windowing layer (pgshell.layout.v2)

Each tool window is a WinState machine (`src/layout2.ts`, pure math
unit-tested clampSplit-style):

- **Dock Pinned / Dock Unpinned** — docked windows on one edge split it
  evenly (10px gutters, 6px outer margin); left/right stacks are full-height
  columns of the SHARED edge width (defaults 296/340), bottom a full-width
  row (204). Unpinned docks AUTO-HIDE on any canvas pointer-down (probed);
  the rail icon restores them.
- **Undock** — full edge overlay above the dock stacks (z 44), hides on
  canvas focus. **Float** — free window, clamped into the canvas, corner
  resize (min 280×170), click raises (monotonic z counter).
- **Window** — honest-disabled: "a separate OS window needs the desktop
  shell — the browser keeps every surface in-frame".
- **Drag-to-dock** — dragging a title bar >4px tears the window into float
  under the pointer; within 70px of the left/right edge or 80px of the
  bottom the target zone highlights (accent fill, dashed border); releasing
  there docks pinned. Header buttons are drag-exempt.
- **Resize** — docked windows carry a 6px inner-border handle adjusting the
  edge's SHARED size (left 220–540 · right 240–640 · bottom 140–460).
- **Gear (⚙) menu** — VIEW MODE · MOVE TO (current edge checked+disabled) ·
  Hide. Every transition probed (`shell.toolwindow.mode`), every mutation
  persisted under the NEW versioned key `pgshell.layout.v2`; a v1 layout blob
  is migrated LOUDLY (`shell.layout.migrate`, v1 key left for rollback).
- **Canvas** — dotted background; the graph host + zoom-to-fit + all overlay
  chips (stats pill, zoom cluster, legend chip, inspector card) inset past
  the OPEN DOCKED edges. Node double-click reveals in the Editor window
  (opens it if hidden); selection shows the floating inspector whose
  fill/ring facts read from the wall's OWN paints pins. Zoom −/+ are
  honest-disabled (the cell's canvas owns its viewport; fit remounts with
  React Flow fitView).
- **Welcome screen** — File › Close project (or the project switcher)
  returns here; `Open sample workspace` re-enters the current hub workspace
  flow; recents from `pgshell.recents.v1`; "New empty workspace" is
  honest-disabled (the hub serves ONE declared workspace).
- **Search Everywhere** — files via a BOUNDED `/fs/list` walk (40 dirs / 200
  files, bound probed) + graph nodes from the served envelope, debounced
  150ms, 12-row bound probed; node hits select over the V5 bus.
- **Settings** (Ctrl+,) — paged: Appearance (theme cards + FREE accent hex —
  drives `--acc` only, verdict fills stay canonical), Editor·Font (stepper
  10–18), Analysis (pyright live/none · auto-reanalyze · node cap), Plugins
  (an honest inventory of the REAL composed pieces, not a marketplace).
- Help › Simulate outage is deliberately OUT: the hub chip reads the REAL
  `/health` (decision logged in `agentic-convos/ui-1c-round.md`).

## The shell's flows

- **Open folder… / Open file…** — server-side browse dialogs over hub
  `GET /fs/list` (workspace-jailed; traversal is the hub's named
  `path-escape`, 403 + probed). Recents persisted (bound 8, versioned key).
- **Save (Ctrl+S)** — `PUT /fs/file` (returns sha256; the tab's dirty dot
  clears only on the hub's ack); LSP didChange was already pumped live by
  the cell on each keystroke; optional auto-re-analyze-on-save preference.
- **Re-analyze (menu · toolbar)** — `POST /analyze` with the HUB's
  vocabulary: `{root: <workspace root>, roots: <the CURRENT declaredRoots —
  re-declared, never lost, never inferred>, extractorConfig:{pyright_mode,
  python_package}}`, then a full refresh (byte-gated /graph re-fetch,
  /analysis, /workspace, explorer, status). The hub recomputes and
  re-attaches the outer-wall analysis on the SAME pipeline.
- **Choose declared roots…** — multi-select over `GET /fs/roots-candidates`
  (decl nodes only, modules excluded); applies as `POST /analyze{roots}`.
- **Export graph / analysis JSON** — the SERVED bytes verbatim, never a
  client re-serialization.
- **Every hub refusal** surfaces its NAMED class in the banner region
  (`path-escape`, `workspace-not-open`, `fs-io-error`, `pipeline-busy`,
  `fs-shape-mismatch`, `save-refused`, …) — no silent failures, no dead
  buttons (disabled items carry `title="reason"`, clicks on them probed).

## Keyboard

`Ctrl+S` save · `Ctrl+,` settings · `Ctrl+Shift+E` open the Project window ·
`Ctrl+Shift+G` focus the graph canvas · `Esc` closes popups/gear menus/
dialogs · menubar (hamburger toggles it inline): arrow keys/Home/End
navigate, Esc closes and returns focus. All probed `shell.key`.

## Run it (the manual browser path for acceptance)

Three processes, three fixed dev ports (OUTERWALL-CONTRACT):

```
# 1. the hub (HTTP 8477; WS 8479 — the app discovers WS via /health.lsp.url)
cd proofgraph
python hub/serve_app.py                    # moatpkg fixture; outer-wall analysis ATTACHED
#   options:                               # by default (OUTLINE rings render live)
#   --pyright live     resolve cross-module calls with live pyright (else they
#                      stay LEADS — honest, logged; unused = 3 decls not 1)
#   --lsp live         run cell 2's REAL measured battery and bridge pyright
#                      to the editor over /lsp (slow start; measured tier only)
#   --analysis none    skip analyze(): /analysis serves the typed 503 and the
#                      app shows the no-analysis-computed PENDING banner

# 2. the ai server (8478; FAKE transport by default — no real keys anywhere)
node ai/server.ts
#   --live             real Anthropic transport; requires AI_API_KEY in THIS
#                      process env. OUT of the demo path, documented only.

# 3. the app (5199, strictPort)
cd app && npm run dev

# open http://localhost:5199
#   ?hub=http://127.0.0.1:PORT   point the shell at a NON-default hub (the
#                                acceptance/browser checks run on EPHEMERAL
#                                ports so the live demo stack is never touched;
#                                the LSP socket still self-discovers via that
#                                hub's /health.lsp.url)
```

serve_app declares THE workspace (the `/fs` jail): a package-dir (or
single-file) fixture declares its PARENT as the workspace root, so the
shell's workspace-relative paths speak the extractor's span vocabulary
exactly (`moatpkg/core.py`).

What you should see:

- **editor pane**: `moatpkg/core.py` in real Monaco. Status line reports the
  transport honestly: `stub-tier-G` (no live diagnostics claimed) unless the
  hub ran with `--lsp live`, in which case the MEASURED tier (read verbatim
  from the `capability.wall.construct` pin) and live pyright diagnostics over
  the hub WS (V2's transport, faithfully ported in `src/lspTransport.ts` —
  including its single declared initialize enrichment, logged).
- **graph pane**: the byte-gated `/graph` envelope (V4's serializer-edge-drop
  three-way gate runs in the browser before mount). Leads dashed. With no
  `/analysis` yet: every outline renders not-yet-computed grey — the banner
  says `no-analysis-computed`, PENDING, never green. Once the outer wall
  attaches an analysis, `/analysis` verdicts overlay fill + OUTLINE rings
  (`src/analysisSource.ts`, contract shape, id-safe).
- **brushing**: click a graph node → the editor reveals + highlights the span
  (same Node.id byte-identical at every hop); move the caret → the graph
  selects. The V5 joined bus verbatim (`src/busAdapter.ts`).
- **AI panel**: ask "Which declarations are unused?" → the answer names REAL
  node ids and the panel shows WHICH graph facts it used (the outlet's
  `outlet.tool.exec` pins rendered as tool calls). Transport badge says FAKE
  loudly in the demo path.
- **failure honesty**: hub down → a named `hub-unreachable` banner, never a
  blank page; ai server down → `ai-server-unreachable` in the panel.

Spike surfaces (§7.8 discipline): `window.pgEditorWall`, `window.pgGraphWall`
expose both walls' `pins` quartets in the browser console.

## Key custody (three independent proofs)

1. keys + vault masterSecret live ONLY in the ai-server node process; the
   browser sends a question, receives an answer + tool calls (V6 outlet scrub:
   questions pinned digest-only, activeSecrets redaction);
2. the ai server re-scans every response body before writing it (500
   `key-leak` refusal on a hit — proven end-to-end by
   `ai/test/p3.server.custody.test.ts`'s planted-secret negative controls);
3. `app/test/p3.build.gate.test.ts` greps the BUILT bundle for the secret
   literals + test-key patterns — automated, part of the suite.

## Tests

```
cd app
npx vitest run          # 111 + 1 todo: shell.units (27) + shell.face (16)
                        #   + shell1c.layout2 (28: windowing math, WinState
                        #     machine, v1→v2 migration) + shell1c.face (9:
                        #     welcome/search/accent/gear/rail/breadcrumbs)
                        #   + shell1c.skin (3: cell-5 DOM skin never touches
                        #     verdict paint) + v4.serve (8) + v5.bus (9)
                        #   + p3.face (10+1 todo)
                        #   + p3.build.gate (vite build + bundle secret scan)
                        #   (families span the SUB200 wave-2 split files;
                        #   totals unchanged by the split)
npx tsc --noEmit
cd ../ai && npm test    # V6 outlet (8) + p3.server (6)
python ../hub/test_hub.py            # 44 (incl. Test11 workspace-fs)
python ../acceptance/run_shell_demo.py   # the app-shell round's ONE-command
                                         # acceptance: temp moatpkg copy,
                                         # ephemeral hub, the UI's exact
                                         # endpoint flows — open → read →
                                         # edit → save → re-analyze → unused
                                         # SHRINKS → revert → it returns →
                                         # path-escape refused → roots feed
```

The `/analysis` LIVE integration is deliberately `test.todo` (PENDING) in
`p3.face.honesty.test.tsx` (the todo moved there with the SUB200 wave-2
split) — component tests mock the OUTERWALL-CONTRACT shape; the
end-to-end assertions live in `acceptance/run_demo.py` (§7) and
`acceptance/run_shell_demo.py` (the shell loop) — never faked green.

## Bounds (logged, never silent)

- **span-file remap**: the extractor mints `span.file` source-root-relative
  (`core.py`); the editor keys spans by document uri. The editor pane remaps
  `span.file` → the pyright-canonical uri for the OPEN file's nodes only.
  Node ids and byte spans cross untouched.
- **one open document**: the pane opens `moatpkg/core.py`; helpers.py nodes
  render in the graph but are not editor-indexed this round.
- **stub floor tier G**: without a measured capability stream the editor
  mounts on cell 4's own stub transport at tier "G" — no diagnostics served,
  `liveGreenAllowed=false`; the status line declares it. Unknown never
  upgrades.
- **FAKE transport labels itself** in every answer; tool execution + node ids
  are real hub data even in FAKE mode.
- **dedupe react/react-dom**: cell sources execute against the app's single
  React 18.3.1 instance (vite `resolve.dedupe`) — two instances split the
  hooks dispatcher.
- npm installs into app/ (logged): `monaco-editor@0.52.2` (byte-equal to cell
  4's lock), `@fontsource/jetbrains-mono@5.2.8` (pinned to cell 4's exact
  version). Everything else was already mirrored from graph-view by V5.
  UI-1C round installed NOTHING new: JetBrains Mono was already the pinned
  dep — `main.tsx` now imports its 400/500/700 css (self-hosted; the mock's
  Google Fonts `<link>` never ships).
- **zoom −/+ honest-disable**: the 1c spec's 20–160% zoom bounds live inside
  cell 5's own React Flow canvas (read-only cell); the shell's zoom cluster
  disables −/+ with that reason and keeps fit (probed remount) — viewport
  moves stay probed on the wall's own `render.viewport` pins.

## Files (verified)

File-level purposes from the adversarial claim audit
(`audit/AUDIT-app-src.json` + `audit/AUDIT-app-tests.json`, 2026-08-03,
Stage-B refuted-corrected; suite after doc fixes: `npx vitest run` = 23
files, 111 passed + 1 todo; `npx tsc --noEmit` exit 0). Per-directory
tables: `src/README.md`, `src/css/README.md`, `test/README.md`,
`test/helpers/README.md`, `test-acceptance/README.md`,
`test-acceptance/helpers/README.md`. Root files below —
line counts measured on disk 2026-08-03 (post doc-fix state).

| file | lines | verified purpose |
|---|---|---|
| `package.json` | 33 | Declares the app workspace's npm surface: dev/build/test/typecheck scripts and dependency pins mirroring packages/graph-view exactly for the shared set, plus cell 4's monaco-editor@0.52.2 and @fontsource/jetbrains-mono@5.2.8; consumed by npm and the P3 build gate. |
| `tsconfig.json` | 19 | TypeScript strict/noEmit config over src+test+vitest.config with @editor-shell/@graph-view/@schema path aliases; drives npx tsc --noEmit and editor tooling. |
| `vite.config.ts` | 50 | Vite dev/build config: port 5199 strictPort (OUTERWALL-CONTRACT pin verified), React plugin, cell-source aliases + react/react-dom/@xyflow dedupe, __MOAT_ABS_DIR__ define pointing at acceptance/fixtures/moatpkg, dist build with monaco bundled whole (chunk warn 6000). |
| `vitest.config.ts` | 32 | Vitest config for test/**: jsdom, globals, 30s timeout, the same aliases + single-React dedupe so cell sources executed from outside the cells share the app's React instance. |
| `vitest.acceptance.config.ts` | 37 | Vitest config for test-acceptance/** only: identical resolution rules, 60s test/hook timeouts, and globalSetup (test-acceptance/helpers/globalSetup.ts, verified present) that clears stale evidence and merges per-file parts into the headless.json shape run_demo.py reads. |
| `index.html` | 12 | Vite entry page: a #root div and the module script loading src/main.tsx. |
| `README.md` | 252 | The app's operator doc: shell/windowing/flow claims, three-process demo run instructions, key-custody proofs and suite counts; every numeric bound audited against src constants (40/200/12/150ms search, 296/340/204 edges, 220-540/240-640/140-460 clamps, 280x170 float min, z44 undock, recents 8, stepper 10-18, ports 5199/8477/8478) — all match. |
