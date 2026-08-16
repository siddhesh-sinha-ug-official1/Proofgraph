# REPORT — HEADLESS-UI (remediation worklist item 5)

**Task**: make the UI acceptance run WITHOUT a person, in one command, by
asserting through DOM/a11y/probe streams — a headless UI driver as the
DEFAULT browser-check path of `run_demo.py` (the flag flips to `--skip-ui`
for emergencies), NO pixel screenshots, full run_demo green end-to-end.
**Status**: DONE — `python acceptance/run_demo.py` (no flags, no person)
= **11 PASS / 0 FAIL / 0 SKIP in 87 s**, the UI step alone carrying
**59 named page-checks** (17 moat + 23 lean + 19 ceiling) in a real
browser.
**Cells touched**: NONE — assembly code only (acceptance/ + two additive
doc addenda), logged in `agentic-convos/remediation-round.md`.

## What exists now

`acceptance/headless/headless_ui.mjs` — the DEFAULT step-3 driver
(extends the existing `acceptance/headless/` pattern: the SAME zero-dep
CDP-over-built-in-WebSocket scaffolding browser_shot.mjs proved; msedge/
chrome `--headless=new`; typed exit 3 `browser-tooling-missing` → logged
SKIP, never a pass).  It never calls `Page.captureScreenshot` — the old
screenshot capture could hang on the Monaco canvas and needed a person;
every fact is a DOM/a11y read or a spike-surface pin (`window.pgGraphWall`
/ `pgEditorWall` / `pgShellLog`).  Per page it takes a SPEC json written
by run_demo from the SAME analyses the §7 checks asserted (expectations
COMPUTED, never hardcoded) and emits an evidence json whose id fields
run_demo re-verifies BYTE-level (UTF-8 arrays) against its own independent
analysis parse.  Evidence:
`acceptance/evidence/ui-{moat,lean,ceiling}.json` + `ui-spec-*.json`.

## The full on-screen path, asserted per page (all measured live)

**moat** (17 checks): `/workspace` + `/fs` served from a TEMP COPY of the
fixture → `moatpkg/core.py` OPENS through the shell's PRIMARY path
(`shell.file.open` source `hub-fs`, a11y `role=tab aria-selected`, editor
status honest `tier: G · transport: stub-tier-G`) **with verdict
markers**: 3 `editor.verdict.gutter.paint` pins, glyph `pg-fill-amber` ×3
(origin `assumed` = DEBT — cell 4's own treatment, never green); graph =
6 nodes / 3 resolved edges / 0 leads, paints all-unknown hatched; status
bar `analysis: applied (6 verdicts)`; **brushing BOTH directions**: a
graph-node click → editor busLog (origin graph) + `recv.reveal
highlightApplied:true` + a11y status-bar `sel:` + inspector, same id; a
REAL CDP mouse click into the Monaco line `def side_calc` (caret col 6,
rect from a DOM Range on the live view-line, elementFromPoint obstruction
guard) → `editor.select.emit.bus` → graph `link.select.in`
(source editor) + `selection.selectedId` — the SAME byte-identical id on
both walls' pins, re-verified in python as UTF-8; AI panel names the real
unused id (listUnused tool exec rendered in the DOM).

**lean** (23 checks): the GREEN world on screen — the 3 kernel-verified
theorems paint fill green `#2E7D32` (`dump().paints` — the cell's own
canonical green; pins, not pixels) with each id present in the DOM
(`[data-id]` byte-identical); the module stays unknown/hatched; the
RESOLVED `proof_uses` edge renders as a REAL edge (1 rendered edge,
0 `render.edge.leadGuard`); `unused_hyp.lean` opened via the REAL
explorer flow (`role=treeitem` click → `/fs/file` → tab active → editor
wall mounts, 4 gutter pins); **the browser gutter honestly refuses the
greens**: at the tier-G stub floor cell 4's guard fires per green decl
(`wouldBeGreen:true, greenAllowed:false, "tier G is not compiler truth"`,
source `lean-kernel:v4.31.0:kernelAccepted …`) + `editor.verdict.green.
blocked` (`green-may-never-be-faked`, downgraded to unknown), ZERO
`pg-fill-green` glyphs — REPORT-GREENFLOW bound 4, now ASSERTED in the
gate (the CT gutter green remains §7(i)'s headless proof at the MEASURED
tier); brushing round-trips green-world ids byte-identically (graph click
on `uses_base` → editor reveal; Monaco caret click on `theorem base_fact`
→ graph selection); AI honest no-claim (roots undeclared), zero served
ids fabricated into the answer.

**ceiling** (19 checks): the unknown-tier input renders unknown, NEVER
green — paints all-unknown (zero green status OR color anywhere), the
2 ghost placeholders (`unresolved:*`) rendered unknown, 2 dashed leads
(leadGuard ×2, 0 resolved edges); `honest_ceiling.typ` opens via the
explorer with 5 amber DEBT gutter markers, zero green glyphs;
graph→editor brushing on `honest_ceiling.bound` byte-identical; AI honest
no-claim.

## run_demo wiring (the flag flipped)

- DEFAULT = the headless UI step (no person, no pixels).  `--skip-ui`
  (deprecated alias `--skip-browser` kept) = emergencies only, a LOGGED
  SKIP — verified live: 10 PASS / 0 FAIL / 1 SKIP.
- Every server EPHEMERAL: vite spawns on an OS-granted free port
  (`--strictPort`; 5199 is never squatted **or reused** now — the old
  reuse-the-live-vite branch is gone; a fresh origin per run also
  guarantees default layout/prefs); hub+ai per page via the app's own
  `?hub=`/`?ai=` harness seams.
- Each page's hub workspace is a TEMP FIXTURE COPY
  (`HubServer.set_workspace` on the copy — serve_app's exact pattern, on
  the SAME analyzed session, no recompute) so `/fs` can never write the
  real fixtures; asserted sha256 before==after (PASS).
- `browser_shot.mjs` stays on disk as a MANUAL screenshot tool (header
  updated: not part of the gate); `acceptance/browser/*.png` are no
  longer regenerated by the gate.

## Honest bounds (declared, riding the outputs)

1. Browser editor floor: with no measured capability stream aggregated on
   the ephemeral hubs, the editor mounts cell 4's stub transport at
   tier G — attested kernel greens are BLOCKED there by the cell's own
   guard (asserted, not smoothed).  The MEASURED-tier CT gutter green is
   proven headless in §7(i).
2. The three pages share one ephemeral vite origin, so shell layout/prefs
   persist across pages within a run (localStorage) — the driver closes
   the AI tool window after each page's AI assertion so its float never
   obstructs the next page's Monaco caret click; the fresh port per RUN
   resets everything.
3. The Monaco caret brush clicks a REAL coordinate (bounded 3 attempts,
   elementFromPoint guard) — a typed failure, never a silent skip.
4. The stdlib hub logs `ConnectionResetError` tracebacks on stderr when
   the browser/ai children are tree-killed mid-keepalive (pre-existing
   `ThreadingHTTPServer` behavior; harmless, stdout evidence unaffected).

## Sweep (end state this round, measured live)

| suite | result |
|---|---|
| acceptance run_demo (DEFAULT — headless UI included) | **11 PASS / 0 FAIL / 0 SKIP** (87 s) |
| headless UI page-checks (moat/lean/ceiling) | **17 + 23 + 19 = 59 green** |
| acceptance run_demo --skip-ui (emergency path) | **10 PASS / 0 FAIL / 1 LOGGED SKIP** (67 s) |
| acceptance run_shell_demo | **11 PASS / 0 FAIL** (32 s) |
| app (vitest FULL incl. build gate) | **111 passed + 1 todo** (42.6 s; the UI-polish agent's concurrent CSS reconciled — no selector changes needed: testids/roles/classes stable) |

Untouched this round (recorded end-state stands): outerwall 41 ·
hub 44 (+1 env skip) · cells 113/131/131/96/133/103 · schema 23py+TS ·
ai 14 · V1 11 · V2 4 · V3 16 (sources: REPORT-GREENFLOW and earlier).

## Files touched (assembly only; logged in the round transcript)

- `acceptance/headless/headless_ui.mjs` (NEW — the default driver)
- `acceptance/run_demo.py` (step 3 rewritten: `ui_step` + `_ui_page` +
  `_spawn_vite` + `free_port`; `--skip-ui` with deprecated alias;
  docstring/report prose; BROWSER_DIR retired from the gate; recorded
  app-suite row refreshed to the green-flow number re-measured here)
- `acceptance/headless/browser_shot.mjs` (header only: MANUAL tool)
- `OUTERWALL-CONTRACT.md` (HEADLESS-UI addendum, additive)
- `ARCHITECTURE-PHASE2.md` (browser-tooling-missing entry names the new
  driver, additive)
- Outputs regenerated: `acceptance/ACCEPTANCE-REPORT.md`,
  `acceptance/evidence/{checks.json, ui-*.json, ui-spec-*.json}`
