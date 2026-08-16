# REPORT — CAP-LEAN (cell 2 measures Lean live; remediation round)

**Task**: remediation-round cell-2 change request — add a real `lean` profile
so cell 2's own P0–P11 battery MEASURES lean over the real Lean LSP (V1
python-profile precedent mirrored exactly).
**Status**: DONE — suite 131/131 green end-to-end.

## Result (measured, never asserted)

**lean measured CT** on this machine. P2 evidence: appended
`example : Nat := "s"` → severity-1 `Type mismatch: "s" has type String but
is expected to have type Nat`, anchored at the injected line, version-2
publish. Battery: P0 pass · P1 pass (0 diags, settled) · P2 pass · P3 skip ·
P4 pass (cross-file `printAnswer`→Util.lean AND dep `lib.parse`→lib.lean) ·
P5 pass (2 files) · P6 fail (documented) · P7 pass (rename, 2 files) · P8
pass (semanticTokens) · P9 pass (call hierarchy) · P10 pass · P11 pass.
paperTier CT == measured CT. greenAllowed True (tier CT ∧ P2 pass).
provenance.resolved True per ruling 2.

## Facts the lean-dock / hub agents need (all measured live)

- **Spawn form** (works headless, cwd-independent, direct — no cmd wrapper):
  `lake +leanprover/lean4:v4.32.0 --dir=<workspace> serve`
  lake resolved from PATH (it IS on PATH here), fallback
  `A:\lean\elan\bin\lake.exe`.
- **Toolchain pinned: `leanprover/lean4:v4.32.0`** (Lean 4.32.0
  x86_64-w64-windows-gnu commit 8c9756b2, Lake 5.0.0; server
  `Lean 4 Server@0.3.0`). WARNING: elan's default 'stable' DRIFTED
  v4.32.0 → v4.32.2 during this round (auto-installed on first unpinned
  call) — always pin via the elan shim `+<toolchain>` argv prefix AND a
  `lean-toolchain` file. (The cell-3 spike dir pins v4.31.0 — cell 3 should
  reconcile deliberately.)
- **lake serve does NOT auto-build imports** (v4.32.0): unbuilt workspace ⇒
  header error `unknown module prefix 'Util'`, body never elaborated. Cell 2
  closes this with a pre-wire `lake +<pin> --dir=<ws> build` emitted as the
  NEW catalogued lead `capability.wire.prepare` (catalog 91→92).
- **URI form**: Lean echoes the client's form byte-for-byte; cell 2's
  pyright-era canonical form (lowercase drive + %3A colon,
  `file:///a%3A/...`) string-matches unchanged. rootUri sent colon-unquoted
  lowercase-drive works.
- **positionEncoding**: Lean advertises none, speaks utf-16 — cell 2's
  negotiated default already utf-16; no spine encoding change was needed
  (probe targets converted via the existing `lsp_char`).
- **Diagnostics are PROGRESSIVE** and ordering is inconsistent: didOpen
  publishes `[]`,`[]`,real-set,progress-done; didChange publishes
  progress-done BEFORE the real set. New additive
  `LspClient.wait_diagnostics_settled()` (spine) settles via
  `$/lean/fileProgress` (empty `processing`) + a quiet grace window and
  takes the LAST matching publish. Repeated `didChange` version 2 is
  ACCEPTED by the server (the spine's fixed version numbering survives).
- **Lean application is whitespace-sensitive**: `f(x)` is a PARSE error on
  v4.32.0 (`unexpected token '('`), `f (x)` is the call form. Additive
  profile keys `crossCallPattern`/`depCallPattern` override the battery's
  ybg-shaped call-site scan. Also: the generic P2 injection
  `result = "str" + 1` is a parse error in lean (wrong evidence class) —
  additive `p2Injection` key supplies the genuine type error.
- **Server→client traffic**: `client/registerCapability`,
  `workspace/inlayHint/refresh`, `workspace/semanticTokens/refresh` requests
  flood in — cell 2's V1 answer-every-request path absorbs them
  (`result: null`); no `workspace/configuration` seen.
- **Shutdown**: `shutdown`+`exit` does NOT end the 4-deep chain (elan shim
  lake → lake → lean watchdog → lean workers) within 10 s; the V1
  `_tree_kill` (taskkill /T /F) closes it. Gate 17 sweeps lean.exe+lake.exe:
  zero orphans.

## Files (cell 2 = packages/capability-layer; every hunk `[ASSEMBLY CHANGE CAP-LEAN]`)

- `capability/fixtures.py` — PROFILES["lean"] + DISCOVERY["lean"] (additive
  keys: languageId "lean4", probeRepo, p2Injection, settleDiagnostics,
  crossCallPattern, depCallPattern).
- `capability/capability.py` — LEAN_TOOLCHAIN pin, `_lake_exe()`, lean
  `_default_config` branch, generic catalogued prepare step (failure never
  aborts — degradation is measured honestly).
- `capability/probes.py` — catalog +`capability.wire.prepare` (91→92,
  additive only).
- `capability/spine.py` — `wait_diagnostics_settled` (additive method; only
  settleDiagnostics profiles call it — fixture streams byte-stable).
- `capability/probe.py` — the three per-profile generalizations above;
  verdict semantics untouched.
- `testbed/lean_repo/` — main.lean / Util.lean / lib.lean + lakefile.toml +
  lean-toolchain (pin). `.lake/` + `lake-manifest.json` are regenerable
  build artifacts of the prepare step.
- `capability/tests/test_17_lean_profile.py` — Gate 17 (7 tests) mirroring
  gate 16: measured tier pinned WITH its P2 evidence, consequences pinned,
  toolchain-pin + encoding gated, no-orphan sweep. LOUD skip without lake.
- `ASSEMBLY-CHANGES.md` — full labelled change-request record.

## Bounds declared (never smoothed away)

- No grammar floor for lean (tree-sitter-lean NOT wired): server death falls
  to P, not G — verbatim in the discovery lead, gated by test_e.
- P6 + stage-H on-demand inventory: EMPTY for lean (the ybg-shaped scratch
  puts `lib.` at COMMAND position — not a term context). Honest fail /
  empty, documented, non-gating.
- P3 skip (lean has no `let x = …` unannotated-let surface).
- Unbuilt-workspace sensitivity closed by the prepare lead; a failing
  prepare degrades the measurement honestly (tier ≤ S, green forbidden).
- Cold-machine first run downloads the pinned toolchain inside the prepare
  step (600 s budget, config-overridable).

## Suite

`python -m pytest capability/tests -q` → **131 passed** (baseline 124 + 7),
36 s, end-to-end green: gates 01–15 (incl. gate-13 fixture-stream
byte-stability) + gate 16 (live pyright, still CT) + gate 17 (live lean).
Only cell 2 touched; originals untouched.

**Repeatability note**: three full-suite runs post-change: 131/131 · 130/131 ·
131/131. The single failure was gate 16's PRE-EXISTING node-orphan sweep
(test_z), a transient — a node.exe straggler (npx cache/update worker class)
outlived its 20 s window; gate 16 passed solo immediately after and the
machine showed zero node/lean/lake processes. Nothing in the CAP-LEAN change
touches the python path; not introduced by this round, logged not hidden.
