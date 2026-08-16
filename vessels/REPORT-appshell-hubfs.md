# REPORT — app-shell round, hub workspace-fs endpoints (hub agent)

Round: app-shell (APP-SHELL-CONTRACT.md, frozen). Slice: the HUB additions —
workspace-fs surface + the /analyze re-attach. Resumed after the limit-killed
first attempt: **audit found hub/ pristine** (the dead agents' partial edits
are app/src/-only, e.g. `app/src/prefs.ts`), so this slice was built clean,
nothing re-done blind.

## What landed (all assembly code; cells untouched; packages/* read-only)

| file | change |
|---|---|
| `hub/pipeline.py` | additive: probe catalog 32 -> 40 (`hub.workspace.set`, `hub.serve.workspace`, `hub.fs.list`, `hub.fs.read`, `hub.fs.write`, `hub.fs.rejected`, `hub.serve.rootsCandidates`, `hub.analyze.reattach`); HubError docstring carries the new vocabulary |
| `hub/server.py` | additive: `set_workspace` / `workspace_payload` / `resolve_fs_path` (THE jail) / `fs_list` / `fs_read` / `fs_write` / `roots_candidates` on HubServer; routes `GET /workspace`, `GET /fs/list`, `GET /fs/file`, `PUT /fs/file` (new `do_PUT`), `GET /fs/roots-candidates`, `do_OPTIONS` (CORS preflight for the browser's PUT/POST); module-level `run_outerwall_session` (the factored serve_app attach pattern); `analyze()` now runs the outer-wall session, swaps the pipeline, **re-attaches the analysis on the SAME pipeline**, re-declares the workspace, emits `hub.analyze.reattach` |
| `hub/serve_app.py` | additive refactor: attach branch now calls `hub_server.run_outerwall_session` (same inputs, same session use — CLI behavior identical, verified live); both branches declare the workspace via `hub.set_workspace(...)` |
| `hub/test_hub.py` | 36 -> 44 tests (Test11WorkspaceFs, methods numbered as one story); one existing test adapted (below) |
| `ARCHITECTURE-PHASE2.md` | seam catalog extended (rebase): `path-escape`, `workspace-not-open`, `fs-io-error`, BOUND `analyze-session-detached-log` |
| `hub/README.md` | routes table, jail section, probe census 40, failure classes, V1-socket note |

## The jail (path-escape, probed)

`resolve_fs_path`: refuse absolute / drive-qualified (incl. drive-relative
`C:x`) / UNC / leading-separator forms up front; else
`(root / rel).resolve()` — **resolve() follows symlinks BEFORE the check** —
then `os.path.commonpath` (normcased) against the resolved root;
different-drive `ValueError` -> `path-escape`. Every refusal is probed
`hub.fs.rejected {op, path, failureClass, detail, status}`. utf-8 files only
this round: a non-utf-8 read is `fs-io-error` with the reason — the hub never
serves bytes it would misrepresent.

## /analyze re-attach (one wall after every re-run)

`run_outerwall_session` factors serve_app's proven attach pattern so BOTH
callers share it. POST /analyze -> outer wall runs the pipeline itself (REAL
V1 feed, measured tiers, lifecycle in `finally`) -> hub adopts
`session["pipeline"]` -> `attach_analysis(session["analysis"])` ->
`set_workspace(root, ..., declaredRoots)` -> `hub.analyze.reattach
{analysisBytes, analysisSha256, declaredRoots, sessionHubLogEvents, bound}`.

Bounds logged, never silent:
- **analyze-session-detached-log** — the run's pipeline probes live on the
  session-local hub log (`pipeline["log"]`), not the serving stream; counted
  on the reattach pin (cataloged in ARCHITECTURE-PHASE2.md).
- **set_capability_fn not consulted by /analyze** — the outer wall owns the
  V1 feed; logged per request on `hub.analyze.accepted` (`capabilityFnInjected`
  + note). The socket stays live for direct `run_pipeline` callers.
- **single-file analyze root** -> the workspace jail is its parent dir (noted
  on `hub.workspace.set`).

## Proofs (all on EPHEMERAL ports; live 8477/8478/8479/5199 stack untouched)

- `python hub/test_hub.py` -> **44/44 OK, 20.4s** (1 subTest skip, below).
  Test11, both surfaces (HTTP body x hub-log pins) per op:
  - workspace-not-open on a FRESH pipeline-less server (5 refusals probed);
  - /workspace facts == the declaration (root normcase-equal, package,
    pyrightMode, declaredRoots, analyzedAt int);
  - /fs/roots-candidates == the CURRENT envelope's decl set (skeleton = 3
    module nodes -> honestly EMPTY; after the test edit the new function decl
    appears with `{id, name, kind, file:"pkg/c.py"}` — proving CURRENT, not
    cached; module exclusion asserted both times);
  - list/read/write round-trip: listing names+sizes == disk; read
    content+sha256+byteLen == disk bytes; write returns sha256(content) and
    the disk + re-read + `hub.fs.write` pin all carry the same sha;
  - binary read -> `fs-io-error` with "utf-8" in detail; missing file ->
    `fs-io-error`;
  - **path-escape matrix**: 14 shapes (`..`, `..\`, `../`, `../../...`,
    `..\..\...`, `pkg/../..`, `pkg\..\..\hub`, absolute same-drive, absolute
    `C:\...`, `D:\...` drive-changing, `C:rel` drive-relative, UNC, `/posix`,
    `\lead`) x {list, read, write} = 42 requests, ALL 403 `path-escape`, ALL
    42 probed `hub.fs.rejected` (exact-count assert);
  - write -> analyze -> **/graph serves the CHANGED extraction** (id set
    strictly grew; new node name `...appshell_added_probe`), edit made in a
    TEMP fixture copy — the committed fixture is never written;
  - **re-attached /analysis == a FRESH `analyze()` byte-canonical** (real
    second outer-wall run compared byte-for-byte; determinism pre-proven:
    two fresh runs hash `c8591042f675ed22` identically);
  - reattach pin sha256/bytes == the served body.
- Existing-suite regression: **outerwall 30/30 - V1 10/10 - V3 16/16** green.
- serve_app CLI: driven live on ports 18931/18932 against moatpkg — ready
  line shape unchanged (`declaredRoots ["n_6e177dcaaec5588a"]`, 6 nodes /
  1 edge / 2 leads, analysis attach); `/workspace` 200; `/fs/list` lists
  moatpkg; `/fs/file core.py` 200 + sha; `/fs/roots-candidates` = the four
  decl nodes incl. `n_94602d86cdf431c2` (moatpkg.helpers.unused_fn), modules
  excluded; `../..` probe -> 403 `path-escape`; OPTIONS 204.

## Honest deviations / notes

- **Test10 adapted (1 line + comment):** it asserted "nothing attached yet"
  against fixture defaults; POST /analyze now ATTACHES an analysis (the NEW
  contract behavior, and Test06 runs first), so the pre-attach refusal path
  is exercised from an explicit detach. No assertion weakened.
- **Symlink escape leg:** auto-skips VISIBLY where Windows denies symlink
  creation (WinError 1314 — no developer mode). The class stays covered:
  resolve() runs before commonpath, so any link that CAN exist is followed
  and checked. Skip is a named subTest skip, never a silent pass.
- POST /analyze is slower now (~7s on the skeleton: the outer wall's REAL V1
  battery measures python live) — the price of measured-tier honesty on
  every re-run; serve_app startup already paid it.
- `/fs/list` sizes: `null` for dirs (no fake byte counts).
