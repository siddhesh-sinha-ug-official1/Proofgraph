# REPORT — Lean extraction/verdict driver spike (remediation round)

**Status: SPIKE PROVEN. Dock wiring pending (next round — read this first).**
**Date: 2026-07-29. Agent: lean-driver-spike (resumed after round-1 limit-kill).**

## Resume audit (never redo blind — precedent honored)

The limit-killed round-1 agent left on disk in
`packages/structure-extractor/extractor/docks/lean_driver/`:
`Driver.lean` (complete, with "measured, not assumed" 4.31 quirk comments),
`lean-toolchain` (leanprover/lean4:v4.31.0), and the three scratch fixtures.
Missing: any verified run record, the smoke script, the ASSEMBLY-CHANGES
entry, this report. This session AUDITED the driver line-by-line, then
VERIFIED it live on all four targets rather than rewriting it. Everything
passed unmodified — the killed agent code stands verbatim; this session
added only `run_smoke.py`, `README.md`, the ASSEMBLY-CHANGES entry, and this
report.

## Exact CLI (what the dock will shell out to)

```
cd packages/structure-extractor/extractor/docks/lean_driver   # cwd matters: adjacent lean-toolchain pins the version
lean --run Driver.lean <absolute-or-relative .lean path>
```

- stdout: ONE compressed JSON document (single line), nothing else.
- stderr: empty on success.
- exit 0 = elaboration finished with no ERRORS (warnings — including
  `declaration uses sorry` and the unused-variable linter — still exit 0);
  exit 1 = elaboration errors (JSON still emitted, `errors[]` filled);
  exit 2 = usage error.

## Toolchain (exact, recorded)

- **Pinned: `leanprover/lean4:v4.31.0`** via the `lean-toolchain` file
  adjacent to `Driver.lean` (elan resolves the pin from the cwd of the
  invocation — hence "cd first" above; alternatively
  `elan run leanprover/lean4:v4.31.0 lean --run <abs path> <target>` works
  from any cwd).
- Verified live: every output carries `toolchain.leanVersion == "4.31.0"`.
  Lake in that toolchain: 5.0.0. Platform: x86_64-w64-windows-gnu.
- DEVIATION from the build-log "v4.32.0 is the natural choice" note: the
  killed agent pinned **v4.31.0** and measured two version quirks against it
  (thmInfo async proof storage: `ConstantInfo.value?` returns none for
  theorems, driver reads `TheoremVal.value` directly; header-import
  failures live only in processHeader log, driver unions both logs).
  Both toolchains are installed; 4.31.0 verified green end-to-end today, so
  the measured pin is KEPT rather than churned. Re-pinning to 4.32.0 is
  possible next round but requires re-measuring those two quirks.

## JSON shape (proven, byte-real)

```
{ "toolchain": {"leanVersion": "4.31.0", "how": "..."},
  "decls": [ { "name": str, "kind": "theorem"|"def"|"axiom"|"other",
               "pos": {"line": 1-based, "col": 0-based},
               "kernelAccepted": bool,          // in Environment after elaboration at kernel trustLevel 0
               "usesSorry": bool,               // sorryAx in collectAxioms result
               "axioms": [str],                 // Lean.collectAxioms, full reachable set
               "unexpectedAxioms": [str],       // axioms minus allowlist; sorryAx always lands here
               "refs": [str],                   // getUsedConstants over type+value, resolved, deduped,
                                                //   first-occurrence order, core constants included
                                                //   (consumer filters to ingested set); local _proof_N
                                                //   auxiliaries expanded transitively
               "unusedHypotheses": [{"binderName": str}] } ],   // no pos (InfoTree-free cost, declared)
  "imports": [str],                             // elaborated header imports; implicit "Init" always present
  "errors": [{"pos": {...}, "severity": "error"|"warning"|"information", "message": str}],
  "limits": [str] }                             // 9 declared honest limits ride in EVERY output
```

Key semantics for the wiring agent:
- **green candidate** = `kernelAccepted && !usesSorry && unexpectedAxioms == []`
  — kernel-verified, no sorry, no axioms beyond the allowlist. **amber** =
  `usesSorry`. **red** = decl absent + `errors[]` has severity `error` at
  its position (a decl that failed elaboration entirely is ABSENT from
  `decls[]` — declared in limits; do not infer green from absence).
- Axiom allowlist (exact, declared): `propext`, `Classical.choice`,
  `Quot.sound`. `funext` is a THEOREM in Lean 4 core (proved via
  Quot.sound), intentionally absent. `sorryAx` never allowlisted.
- Implementation is kernel/environment-level ONLY (parseHeader /
  processHeader / IO.processCommands, Environment.constants,
  Expr.getUsedConstants, collectAxioms, findDeclarationRanges?). InfoTree
  deliberately unused — it is the version-sensitive surface; the declared
  cost is no per-binder / per-ref source positions.

## Proof runs (all today, all green)

Fixture (a) `fixtures/clean.lean`: fixA/fixB/fixC all `kernelAccepted`,
`fixB.refs` contains `fixA` (plus omega real dependency set — local
`_proof_N` auxiliaries expanded), zero sorry, zero unexpected axioms
(fixB omega proof reaches propext + Quot.sound — allowlisted), errors [],
imports ["Init"]. Fixture (b) `fixtures/sorry_case.lean`: `usesSorry:true`,
`sorryAx` in BOTH `axioms` and `unexpectedAxioms`, warning surfaced, exit 0.
Fixture (c) `fixtures/unused_hyp_case.lean`: `unusedHypotheses == [h2]`,
`h` NOT flagged.

### Acceptance fixture `acceptance/fixtures/unused_hyp.lean` (read-only) — output VERBATIM

```json
{"decls":[{"axioms":[],"kernelAccepted":true,"kind":"theorem","name":"base_fact","pos":{"col":0,"line":4},"refs":["Eq","Nat","HAdd.hAdd","instHAdd","instAddNat","OfNat.ofNat","instOfNatNat","rfl"],"unexpectedAxioms":[],"unusedHypotheses":[],"usesSorry":false},{"axioms":[],"kernelAccepted":true,"kind":"theorem","name":"uses_base","pos":{"col":0,"line":6},"refs":["True","Eq","Nat","HAdd.hAdd","instHAdd","instAddNat","OfNat.ofNat","instOfNatNat","base_fact"],"unexpectedAxioms":[],"unusedHypotheses":[{"binderName":"h"}],"usesSorry":false},{"axioms":[],"kernelAccepted":true,"kind":"theorem","name":"lonely","pos":{"col":0,"line":8},"refs":["True","Eq","Nat","HAdd.hAdd","instHAdd","instAddNat","OfNat.ofNat","instOfNatNat"],"unexpectedAxioms":[],"unusedHypotheses":[{"binderName":"h2"}],"usesSorry":false}],"errors":[{"message":"Variable name `h` is not explicitly referenced.\n\nThe binding can be removed (if unused) or named `_` (if used implicitly).\n\nNote: This linter can be disabled with `set_option linter.unusedVariables false`","pos":{"col":19,"line":6},"severity":"warning"},{"message":"Variable name `h2` is not explicitly referenced.\n\nThe binding can be removed (if unused) or named `_` (if used implicitly).\n\nNote: This linter can be disabled with `set_option linter.unusedVariables false`","pos":{"col":27,"line":8},"severity":"warning"}],"imports":["Init"],"limits":["single-file driver: lake project targets (multi-file import graphs) are next-round work","kernelAccepted means: the declaration entered the Environment after elaboration at kernel trustLevel 0; a decl whose elaboration failed entirely is ABSENT from decls[] and visible only via errors[] (or present with usesSorry=true when recovery inserted sorryAx)","unusedHypotheses covers explicit binders matched by the value's leading lambda telescope; if the elaborated value is not a lambda at some level (eta-contracted / non-lambda proof term), remaining binders are unjudged; binder source positions omitted (would require InfoTree)","InfoTree deliberately unused (version-sensitive API surface) — kernel/environment-level APIs only; per-binder/per-ref positions are the declared cost","axiom nesting gap (Lean issue #8840): an axiom referenced only inside another axiom's TYPE is not followed by collectAxioms","axiom allowlist (exact): propext, Classical.choice, Quot.sound; funext excluded because it is a theorem in Lean 4 core; sorryAx never allowlisted","refs = getUsedConstants over type+value AFTER elaboration: resolved constant names, deduplicated, order of first occurrence; includes core-library constants (consumer filters to the ingested set); LOCAL underscore-internal auxiliaries (e.g. omega's <decl>._proof_N) are expanded transitively into their real dependencies, but user-visible auxiliaries (<decl>.match_N etc.) are reported as-is","toolchain quirk (4.31, measured): ConstantInfo.value? returns none for theorems (async proof storage) — the driver reads TheoremVal.value directly, which forces the async elaboration task","imports = elaborated header imports of the target file (module names as written), deduplicated; the implicit Init prelude appears even for files with no import line"],"toolchain":{"how":"lean --run Driver.lean <target>, elan shim A:\\lean\\elan\\bin\\lean.exe, version pinned by the adjacent lean-toolchain file; kernel trustLevel 0","leanVersion":"4.31.0"}}
```

Reading for the acceptance story: `uses_base.refs` contains `base_fact` —
that is the RESOLVED proof-dependency edge the current G-tier lean dock
cannot see (it emits leads only). `uses_base` also has a genuinely unused
`h`; `lonely` has unused `h2` (its `h` IS used). All three kernel-accepted,
zero sorry — a real kernel-verified green candidate set, ready to flow once
the dock is wired.

## Smoke test (one command, re-verifies the whole spike)

```
python A:\30lean-push\proofgraph\packages\structure-extractor\extractor\docks\lean_driver\run_smoke.py
```

Result today: **SMOKE PASS — 31/31 assertions** across all four targets
(three scratch fixtures + read-only acceptance fixture), toolchain-pin
assertion included. Exit 0.

## Latency (measured on this machine)

- Cold (first-ever `lean --run` invocation of the session/day): **75.9s**
  once — OS file-cache warm-up of the toolchain .olean tree while
  elaborating Driver.lean. Budget for it in any CI/first-run path.
- Warm: **2.5-3.0s per file** (measured 2.9 / 3.0 / 2.8 / 2.9s across the
  four targets; ~2.5s under plain timing without smoke-harness overhead).
  Dominated by `import Lean` + Driver.lean elaboration, i.e. mostly
  per-invocation constant — batching multiple targets per process is the
  next-round lever if per-file cost matters.

## Answers for the NEXT round (dock wiring)

1. **Import edges for a multi-file lake project — honest portable path.**
   PROVED this round: single-file elaboration; `imports[]` comes from
   `env.header.imports` (the ELABORATED header — not a regex), deduped,
   implicit `Init` included. RECOMMEND for lake projects:
   run the SAME driver per file under `lake env`, i.e.
   `lake env lean --run <abs path to Driver.lean> <file.lean>` from the
   project root after `lake build` — `lake env` sets LEAN_PATH so project
   modules resolve as .oleans and per-file `imports[]` then names project
   modules verbatim; import edges = each file `imports[]` filtered to the
   project own module set (module name maps to file path via the lake src
   layout root). This keeps ONE driver, no InfoTree, no `lake exe graph`
   (which requires the target project itself to define such an exe — not
   portable). `lake setup-file` was considered and rejected: it is the
   editor-worker protocol, JSON shape not covered by compat guarantees.
   NOT yet proved: the `lake env` path end-to-end (no scratch lake project
   this round — declared, not claimed). Fallback if `lake build` of a broken
   project fails: `Parser.parseHeader` alone still yields the import list
   per file without elaborating bodies (cheap, still real parsing) — usable
   for import EDGES while verdicts stay honest-red/unknown for unbuilt files.
2. **Verdict mapping** (restated for the wiring agent): green candidate =
   kernelAccepted AND NOT usesSorry AND unexpectedAxioms=[] ; sorry = amber;
   elaboration error = red (decl ABSENT from decls[], see limits[1]);
   anything the driver did not judge = unknown, never green. Lean G to CT is
   a MEASURED transition: cell 2 battery must measure it — the dock must
   not assert CT because this driver exists.
3. **Version sensitivity**: stays declared (limits[3], limits[7]). The pin
   file makes the toolchain explicit and stable; any pin bump must re-run
   `run_smoke.py` AND re-check the two 4.31-measured quirks.

## Cell hygiene

- New dir only (`extractor/docks/lean_driver/`); dock registry, goldens,
  cell tests all untouched. Acceptance fixture read, never written.
- ASSEMBLY-CHANGES.md: entry appended ("driver spike, dock wiring pending").
- Cell suite re-run after touching the package:
  `python selftest/run_all.py` — **Ran 104 tests ... OK** (exit 0,
  live-pyright oracle included). Note: 104 vs the 103 recorded at Phase-1
  close — the suite auto-discovers; count observed today, all OK, none
  skipped.
- Originals (A:\2lean-push ... A:\26lean-push) untouched. Schema PIN
  untouched (3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c).
