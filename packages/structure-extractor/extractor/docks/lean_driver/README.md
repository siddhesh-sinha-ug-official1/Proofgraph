# Lean extraction/verdict driver — proven spike, now WIRED (LEAN-DOCK round)

**Status: SPIKE PROVEN and wired into the dock** — the LeanDock CT path
(`extractor/docks/lean_ct_driver.py`) shells out to this driver, one
invocation per file, with cwd pinned here so the adjacent `lean-toolchain`
rules the version.  Full spike report:
`proofgraph/vessels/REPORT-LEAN-DRIVER-SPIKE.md`.

`run_smoke.py` remains the standalone one-command re-verify of the driver
itself (no dock involved).

## What this is

A standalone Lean 4 metaprogram (`Driver.lean`) the future Lean dock will
shell out to. Given a single `.lean` file it elaborates it with the REAL
pinned toolchain (kernel trustLevel 0) and emits ONE JSON document on
stdout:

```
{ toolchain: {leanVersion, how},
  decls: [{name, kind, pos{line,col}, kernelAccepted, usesSorry,
           axioms, unexpectedAxioms, refs,
           unusedHypotheses: [{binderName}]}],
  imports: [module names],
  errors:  [{pos, severity, message}],
  limits:  [declared honest limits — ride in every output] }
```

Exit code: 0 = elaboration finished without errors (warnings, incl. sorry,
allowed); 1 = elaboration errors (still emits the JSON, errors[] filled);
2 = usage.

## Run

```
cd <this directory>          # cwd matters: the adjacent lean-toolchain pins the version
lean --run Driver.lean fixtures/clean.lean
```

Toolchain pin: `lean-toolchain` → **leanprover/lean4:v4.31.0** (installed,
warm). Latency measured: ~2.5-3s per file warm; first-ever run after a cold
elan cache took 76s (one-time).

## Smoke test (one command, re-verifies the whole spike)

```
python run_smoke.py
```

Runs the driver on the three scratch fixtures in `fixtures/` plus the
read-only `acceptance/fixtures/unused_hyp.lean` and asserts every proof
obligation (kernel acceptance, refs edge, sorryAx, unused-h2-not-h,
toolchain pin honored, limits present). Exit 0 = green.

## Design choices (declared)

- Kernel/environment-level APIs ONLY: `Parser.parseHeader` /
  `Elab.processHeader` / `Elab.IO.processCommands`, `Environment.constants`,
  `Expr.getUsedConstants`, `Lean.collectAxioms`, `findDeclarationRanges?`.
  InfoTree deliberately unused (version-sensitive surface); the cost —
  no per-binder/per-ref source positions — is declared in `limits[]`.
- Axiom allowlist (exact): `propext`, `Classical.choice`, `Quot.sound`.
  `funext` is a theorem in Lean 4 core (not an axiom) — intentionally absent.
  `sorryAx` is never allowlisted.
- Unused hypotheses: pure Expr walk of the type's forall telescope in
  lockstep with the value's lambda telescope; explicit binders whose bound
  variable does not occur (`hasLooseBVar 0`) are reported. Limits declared.
- All other honest limits (single-file only, axiom-nesting gap #8840,
  4.31 thmInfo async-value quirk, refs semantics) ride in `limits[]` of
  every output — read them there.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-structure-extractor.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `README.md` | 70 | Driver-dir README: wired-spike status, the one-line JSON output shape, exit-code contract (0 clean/1 errors/2 usage), run + smoke commands, the v4.31.0 pin and declared design choices; matches run_smoke.py and lean_ct_driver.py behavior. |
| `run_smoke.py` | 169 | Standalone driver smoke: runs Driver.lean over three scratch fixtures plus the read-only acceptance fixture and asserts kernel acceptance, refs, sorryAx surfaced (never allowlisted), unused-hypothesis flags, the toolchain pin and non-empty limits[]; exit 0 only when every check passes. |

The remaining entries here (`Driver.lean`, `lean-toolchain`, `fixtures/`) are the driver source, the toolchain pin and fixture data documented in the prose above.
