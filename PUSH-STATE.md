# PUSH-STATE — commit-time state of the tree

The tree at `A:\30lean-push\proofgraph` is ready for `git init` + first commit
+ cloud `/code-review ultra`. This file is the ledger for that moment:
what environment produced the numbers, what the numbers are, and what the human
should do next.

---

## Environment (live probe, 2026-08-16)

| item | value |
|---|---|
| Date | 2026-08-16 |
| Host OS | Windows 11 Home Single Language 10.0.26200 |
| Python | 3.12.10 |
| Node | v24.18.0 |
| npm | 11.16.0 |
| git | 2.55.0.windows.3 |

### Python runtime deps (verified via `pip show` / `import.__version__`)

| package | version | requirement |
|---|---|---|
| rustworkx | 0.18.0 | ==0.18.0 |
| networkx | 3.6.1 | ==3.6.1 |
| grimp | 3.15 | ==3.15 |
| tree-sitter | 0.26.0 | ==0.26.0 |
| tree-sitter-language-pack | 1.12.5 | ==1.12.5 |
| websockets | 16.0 | ==16.0 |
| pytest | 9.1.1 | ==9.1.1 |

All match `requirements.txt` pins exactly.

### Node toolchain

Lean/lake driver on PATH via elan; toolchain pin recorded in
`packages/structure-extractor/extractor/docks/lean_driver/lean-toolchain`
(v4.31.0 driver) and `packages/capability-layer/testbed/lean_repo/lean-toolchain`
(v4.32.0 measured CT). The pin-divergence is a declared limitation, probed on
every CT run.

---

## `python run_all_suites.py` — 19/19 PASS (verbatim table)

```
suite                                  result      time   counts
----------------------------------------------------------------
line-gate (sub-200 ceiling)            PASS        0.4s   
schema (py)                            PASS        0.4s   23 tests, OK
schema (ts)                            PASS        1.2s   pass 14, fail 0
cell 1 graph-model                     PASS        2.5s   115 tests, OK
cell 2 capability-layer                PASS       63.1s   134 passed in 62.06s (0:01:02)
cell 3 structure-extractor             PASS       69.0s   140 tests, OK
cell 4 editor-shell                    PASS        6.2s   pass 96, fail 0
cell 5 graph-view                      PASS        7.1s   Tests 152 passed (152)
cell 6 byok-arena                      PASS        2.3s   pass 118, fail 0
hub                                    PASS       28.5s   59 tests, OK
outerwall                              PASS       85.0s   47 tests, OK
ai                                     PASS        4.7s   pass 21, fail 0
app vitest (+build gate)               PASS       45.2s   Tests 121 passed | 1 todo (122)
app tsc --noEmit                       PASS        6.5s   clean (no output)
vessel V1 (capability x extractor)     PASS       45.6s   11 tests, OK
vessel V3 (extractor x model)          PASS        1.6s   16 tests, OK
acceptance run_demo --skip-browser     PASS       82.2s   10 PASS, 0 FAIL, 1 SKIP ==
acceptance run_shell_demo              PASS       34.3s   11 PASS, 0 FAIL ==
fault-injection (faultcheck)           PASS      433.8s   faults caught: 6/6  ->  OK
----------------------------------------------------------------
GRAND TOTAL                            PASS      919.7s   19/19 suites passed
```

Rerun from clean state after the pre-push hygiene edits (this file's own
existence excluded — created after the run). Both fault-injection (6/6) and
line-gate (sub-200 ceiling, 0 offenders across 743 files) are green.

---

## Ledger + fix-history reference

- Pre-GitHub review + waves A/B/C/D + read-only lens punch-list:
  `CONSOLIDATED-FINDINGS.md` (§ Post-fix status; § Lens findings punch-list).
- Sub-200 close + declared limitations verbatim: `REMEDIATION-REPORT.md`
  (§3 authoritative run; §4 declared limitations).
- File tour (all 1039 files, one line each): `SYSTEM-EXPLAINED.md`.
- Historical build-machine provenance (raw absolute paths on this
  workstation): `INTEGRATION-MANIFEST.json` `_repoNote`.

---

## Pre-push hygiene sweep — what was touched this round

1. `.gitignore` rewritten to move all inline `# …` comments to their own
   lines. Inline comments in gitignore are treated as part of the pattern
   (not stripped), so 6 rules (`dist/`, `demo-dist/`, `.vite/`, `.lake/`,
   `packages/graph-model/out/`, `packages/structure-extractor/out/`,
   `acceptance/evidence/`, `acceptance/browser/`) were silently
   non-matching — the untouched-comment .gitignore left 1473 candidate
   files staged; the fix drops that to 1024 files by actually excluding the
   regenerated tree.
2. `packages/schema/package.json` — added `engines.node >=24` and
   `license: MIT` (parity with the other five package.json files).
3. Header notes framing historical build-machine paths added to
   `CONSOLIDATED-FINDINGS.md`, `REMEDIATION-REPORT.md`,
   `audit/AUDIT-SUMMARY.md`. Each explains that any `A:\…` /
   path tokens below are quoted evidence, not runtime inputs, and
   cross-refs the existing `INTEGRATION-MANIFEST.json` `_repoNote` and
   README "Repository scope" framing.

Nothing behavioral changed. The suite re-ran green at 19/19 after these
edits.

Known residual (deferred by design, DOC-2 in the lens punch-list, not
push-blocking): the code-file lake/lean fallbacks
(`packages/capability-layer/capability/capability.py:28` +
`packages/capability-layer/capability/tests/lean_common.py:37` +
`packages/structure-extractor/extractor/docks/lean_common.py:26` +
`packages/structure-extractor/extractor/docks/lean_driver/run_smoke.py:56`)
still name `A:\lean\elan\bin\lake.exe` / `lean.exe` as a **last-resort
fallback** after `shutil.which("lean|lake")` and `$LEAN_EXE`. On any other
machine these are unreachable and behavior is identical (checks are `if
os.path.exists(shim)`). Owned by DOC-2 for the next round.

---

## Hand-off — what the human does next

### 1. Add the remote and push

```
cd A:\30lean-push\proofgraph
git remote add origin <the-URL>
git push -u origin main
```

### 2. Run the cloud ultra review

Once `origin/main` exists, in Claude Code:

```
/code-review ultra
```

against the branch. This is the last gate before general availability.

### 3. Expect these next-round items in the ultra review output

Deliberately NOT fixed this round; each has been agent-audited and left as
documented follow-up so the ultra review won't be a surprise:

- **UXC1** — the "workspace unavailable" reason is worded FOUR different ways
  across header / banner / status / tooltip. P1 UX-copy; unify in a follow-up.
- **UXC2 / DC-4** — the stats-pill string fuses graph counts with an
  onboarding tutorial ("… — drag window titles · drop on an edge zone to
  dock · gear menu for view modes"). P1 UX-copy; separate the tutorial into a
  first-run hint.
- **SD-1** — `_capability_fn` + `set_capability_fn` on `HubServer` are
  documented as "V1 plugs the real thing here" but nothing calls them any
  more (analyze() owns capability wiring). P1 system-design; wire it, remove
  it, or mark it explicitly reserved.
- **W5 hub-monotonic follow-up** — the AI `/graph` + `/query` coherence
  token is deferred; today mitigated by concurrent `Promise.all` fetch. The
  deterministic fix crosses the R partition.
- **LOOPBACK cors allowlist bound** — the S1/S2 fix accepts **any** loopback
  origin (`localhost`, `127.0.0.1`, `::1`, any port) rather than only the
  configured dev ports 5199/8477/8478/8479. Deliberate — the acceptance UI
  runner assigns ephemeral ports at test time, so a strict allowlist would
  break the gate — and the rule still blocks every non-loopback origin.
  Documented in `hub/cors.py` module docstring and `ai/server/cors.ts`
  header. If a stricter production allowlist is wanted, thread the app's
  actual served origin into hub startup.

- **DOC-2 hardcoded lake/lean fallbacks** (four code files listed under
  "Pre-push hygiene sweep § residual" above) — env-var-only, drop the drive
  path fallbacks, or keep a $LEAN_EXE-only resolution.

Everything else in the lens punch-list is P2/P3 polish enumerated in
`CONSOLIDATED-FINDINGS.md § Lens findings`.
