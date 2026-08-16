# REPORT — app-shell round, Integrate stage (seam reconciliation + acceptance + browser check)

Round: app-shell (APP-SHELL-CONTRACT.md, frozen). Stage: Integrate — Stage A
was fully landed (REPORT-APP-SHELL.md + REPORT-appshell-hubfs.md); a prior
integrate attempt died with its host BEFORE starting. **Audit first**:
`acceptance/run_shell_demo.py` did NOT exist, no live stack was running
(ports 8477/8478/8479/5199 free — verified), Stage-A code on disk exactly as
reported. Nothing redone blind.

## Seam drift found and wired (smallest honest fixes, at the HUB vocabulary)

| # | drift | fix |
|---|---|---|
| 1 | app POSTed /analyze body config:{pyright} — the hub reads extractorConfig:{pyright_mode,…} (snake_case), so the declared re-run config was silently IGNORED | app/src/App.tsx runAnalyze + fsSource.ts AnalyzeRequest: the body now crosses as extractorConfig{pyright_mode, python_package} — the hub vocabulary, per REPORT-APP-SHELL own reconciliation plan |
| 2 | hub /analyze REQUIRES root; the shell Re-analyze / auto-reanalyze-on-save sent none → guaranteed hub-bad-request | runAnalyze resolves root from the served /workspace root; a folder pick (workspace-relative, server-side browse) is joined onto it; no workspace → the shell own probed workspace-not-open banner, never a doomed request |
| 3 | a plain re-analyze silently LOST the declared roots (hub re-runs with roots=None → reachable/unused refuse) | runAnalyze re-declares the CURRENT /workspace.declaredRoots when no explicit roots are passed — roots stay declared, never lost, never inferred |
| 4 | /workspace.analyzedAt is a time_ns INT (hub) — the app coerced non-strings to null | fetchWorkspace carries a numeric analyzedAt verbatim as its decimal string |
| 5 | serve_app declared the workspace as the PACKAGE dir itself, but the extractor span vocabulary + the shell paths are package-PARENT-relative (moatpkg/core.py) — the initial tab would fall back to the bundled fixture even with live fs endpoints | hub/serve_app.py: a package-dir (or single-file) fixture declares its PARENT as the workspace root — the outer wall own project-root rule, the layout hub Test11 and POST /analyze single-file rule already speak; a plain dir fixture is unchanged |
| 6 | no way to point the browsable shell at a NON-default hub → browser checks would squat the live stack fixed 8477 | app/src/main.tsx: ?hub=http://127.0.0.1:PORT override (LSP still self-discovers via that hub /health.lsp.url) |

One test adapted honestly (shell.face.test.tsx re-analyze body assertion:
config.pyright → extractorConfig.pyright_mode + root/package asserted —
the mocked contract shape updated to the LANDED hub vocabulary; no behavior
assertion weakened). No new failure classes minted — none needed; the
existing catalog covered every refusal exercised.

## acceptance/run_shell_demo.py — ONE command, 11 named checks, 26s

Ephemeral ports; TEMP COPY of moatpkg (committed fixture sha-verified
untouched at teardown); hub stood the serve_app way (run_outerwall_session,
analysis attached on the SAME pipeline, workspace = the temp parent);
pyright LIVE (with "none" the cross-module call could not honestly resolve
and unused could not shrink). All over HTTP — the SAME endpoints the UI
calls, including POST /analyze with the UI exact body.

```
workspace-facts        PASS  /workspace == the declaration (root/package/mode/declaredRoots)
fs-list-tree           PASS  tree walk: moatpkg/ dir -> core.py file, size == disk
fs-read-core           PASS  content + sha256 == disk bytes (f9ed3d3d…)
unused-initial         PASS  unused == {side_calc, unused_fn} under root moatpkg.core.main
fs-write-edit          PASS  PUT main += helpers.unused_fn(3); sha256 == returned == disk
analyze-after-edit     PASS  POST /analyze (UI body) ok, 6 nodes
unused-shrunk          PASS  2->1: unused_fn REACHABLE, side_calc still unused
revert-restores        PASS  original unused id set returns byte-same (determinism)
path-escape-refused    PASS  PUT ../escape.py -> 403 path-escape + hub.fs.rejected probed, nothing written
roots-candidates-decls PASS  candidates == served /graph non-module decl set (4; 2 modules excluded)
fixture-untouched      PASS  committed moatpkg byte-identical before/after
== 11 PASS, 0 FAIL, exit 0 ==
```

## Browser-level spot check (vite 15199 ephemeral + serve_app hub 18977/18979, temp fixture copy)

Machine quirk stood as documented: the browser pane reported a 0x0 viewport
(screenshots/coordinate clicks unusable — the known Monaco-canvas hang
family), so the check ran per cell 4 guidance: accessibility tree
(read_page) + DOM-dispatched clicks + the shell OWN probe log
(window.pgShellLog.history()). Evidence:

- **menubar renders** (roles menubar/menuitem, File/Edit/View/Analysis/Help);
  File menu: Open folder…/Open file…/Save (disabled title="no unsaved
  changes in the active tab" — no dead buttons)/Re-analyze/Exports
  (enabled — analysis attached)/Recents. Open-folder dialog = server-side
  browse listbox naming the path-escape jail.
- **initial tab from hub-fs** (the seam-5 fix live): probe
  shell.file.open {relPath:"moatpkg/core.py", source:"hub-fs", sha256:f9ed3d3d…}
  — the SAME sha the acceptance runner read; readOnlyReason null.
- **explorer lazy tree**: expand → ONE /fs/list fetch (probed
  shell.explorer.list {path:"moatpkg", entries:3, lazy:true}), dirty dot on
  the open tab file; open helpers.py → shell.editor.dispose(core.py)
  strictly before shell.editor.mount(helpers.py) (cell 4 one-document
  bound, live), shell.recents.add probed. Tab close flow exercised.
- **dock toggle**: View > Bottom dock → tablist gone from the tree, probed
  shell.menu.action + shell.layout.change {persistedKey:"pgshell.layout.v1"};
  toggled back.
- **save flow end-to-end**: real Monaco edit (execCommand insertText into the
  cell inputarea) → tab dirty, toolbar save enabled (title="PUT /fs/file
  (Ctrl+S)") → Ctrl+S → shell.key {combo:Ctrl+S} → shell.save.ok
  {sha256:8a783dcc…} → the TEMP copy helpers.py on disk hashes 8a783dcc…
  (verified out-of-band); the COMMITTED fixture still 7bd3f7c0… (untouched).
- **status bar served-fact-driven**: schema pin v0/3f312369… from /health,
  stub-tier-G honest floor (no --lsp live), applied (6 verdicts).
- **zero console errors**. Teardown: both processes stopped, no listeners
  left on 18977/18979/15199 (verified).

## Suite sweep (all live this stage, exact counts)

| suite | result |
|---|---|
| hub python hub/test_hub.py | **44 OK** (1 named subTest skip: Windows symlink denial), 19.5s |
| app npx vitest run | **71 passed + 1 todo** (shell.units 27 · shell.face 16 · v4.serve 8 · v5.bus 9 · p3.face 10+1 · build gate 1 — bundle-secret scan still build-failing and green) |
| app npx tsc --noEmit | clean |
| ai npm test | **14/14** |
| graph-view (untouched cell) | **133/133** |
| editor-shell (untouched cell) | **96/96** (build + import gate + tests) |
| acceptance/run_shell_demo.py | **11 PASS / 0 FAIL**, 26s, exit 0 |

## Bounds logged (this stage additions — nothing reverted)

- **workspace-root vocabulary** (seam 5): package-dir fixtures jail at the
  PARENT; a plain directory stays its own root — declared on the
  hub.workspace.set note, never guessed.
- **python_package only for same-root re-runs**: a folder pick sends no
  package name (the outer wall stages package dirs itself, never guesses) —
  commented at the seam in runAnalyze.
- **browser-pane 0x0 viewport quirk**: coordinate clicks/screenshots
  unusable on this machine; a11y-tree + probe-log driving is the recorded
  fallback (cell 4 precedent).
- Cells NEVER modified; packages/* read-only; the browser never touched the
  filesystem (every file op crossed a jailed hub endpoint).
