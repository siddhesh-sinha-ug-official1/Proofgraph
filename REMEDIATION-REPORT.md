# REMEDIATION-REPORT — sub-200 close + worklist items 1-5

> **Historical evidence note.** The `Workspace:` value below and any other
> `A:\...\...` paths in this report are the **build-machine absolute paths on
> the workstation where this round ran**. They are retained verbatim as
> provenance — they are not runtime inputs and none of them exist on a clone.
> See `README.md` "Repository scope" and `INTEGRATION-MANIFEST.json` `_repoNote`.

**Workspace**: A:\30lean-push\proofgraph
**Round**: agentic-convos/remediation-round.md (waves 1+2 landed; this is the
wave-3 close: the line-gate, the one authoritative clean-state run, this report).
**Environment**: Windows 11 / Python 3.12 / Node 24 / elan+lake (Lean 4.31.0
driver pin, 4.32.0 cell-2 pin — see limitations).
**Voice**: every sentence traces to a report file, a transcript entry, or a
probe id / suite record. Nothing aspirational.

---

## 1. Per-worklist-item — what changed, what now passes, proof pointer

### Item 1 — a real checker wired end to end (kernel-verified green travels the whole stack, unbacked-green still rejects)

- **What changed**: cell 3's LeanDock upgraded from the tier-G tree-sitter
  placeholder to the REAL Lean path consuming the proven v4.31.0 kernel driver
  (round 2, LEANDOCK); then the first REAL kernel green wired
  checker -> analyze() -> hub -> graph view -> editor gutter with the SAME
  content-addressed Node.id byte-identical at every hop (round 3, GREEN-FLOW).
  Assembly code only for the flow (outerwall/test_outerwall.py Test03 rewritten
  for verdict arrival; acceptance/run_demo.py checks i+j; app main.tsx `?ai=`
  seam; ai/server.ts `--hub`); NO cell touched in GREEN-FLOW (cell 4's guard
  admitted the attested CT greens as shipped).
- **What now passes**: on `acceptance/fixtures/unused_hyp.lean` at CT,
  `base_fact`/`uses_base`/`lonely` -> fill green, origin `checked`, source
  `lean-kernel:v4.31.0:kernelAccepted decl=<name> run=<sha16>`; the resolved
  `proof_uses uses_base -> base_fact` edge (resolver `lean-kernel`); zero leads;
  ruling-8 rings green on the real green base. The doctored-green companion
  (§7(j)) fails at THREE walls, each with its named class: cell 3
  `unbacked-green`, graph-model wall `fake-green`, editor
  `green-may-never-be-faked`.
- **Proof pointer**: vessels/REPORT-GREENFLOW.md (§7(i) greenTrace on
  `n_4f3647710786b797`; §7(j) three-wall rejection); vessels/REPORT-LEANDOCK.md
  (envelope greens, guard `unbacked-green` / probe
  `extractor.green.enforcement.violation`); acceptance/TRACE-full.json
  `greenTrace`; transcript entries [GREEN-FLOW round] / [GREEN-FLOW CLOSED].

### Item 2 — real Lean path (kernel verdicts, resolved proof-dep edges, axiom reachability, Lean G->CT measured)

- **What changed**: (a) the standalone driver `Driver.lean` proven (kernel
  trustLevel 0, `collectAxioms`, `getUsedConstants`; green =
  kernelAccepted AND NOT usesSorry AND unexpectedAxioms==[]; allowlist
  propext/Classical.choice/Quot.sound; sorryAx NEVER allowlisted); (b) cell 2
  gained a real `lean` profile so its P0-P11 battery MEASURES lean = CT over the
  live Lean LSP; (c) the dock's verdict mapping added one measured tightening
  (green also requires the file elaborated error-free — a Mathlib-import fixture
  showed a kernelAccepted decl inside a header-failed file, a false-green hazard,
  measured and closed).
- **What now passes**: driver `run_smoke.py` -> 31/31 assertions; cell 2 gate 17
  (7 tests) pins measured CT with its P2 evidence (severity-1 `Type mismatch:
  "s" ... Nat`); unused-hypothesis flagged exactly (`uses_base -> [h]`,
  `lonely -> [h2]`, `h` on lonely NOT flagged); sorry -> amber at the outer wall
  on `Verified.lean`. Version-sensitivity + axiom-nesting gaps stay declared
  (9 driver limits ride every output).
- **Proof pointer**: vessels/REPORT-LEAN-DRIVER-SPIKE.md (CLI, JSON shape, the
  VERBATIM driver output on the acceptance fixture, 9 limits, latency 2.5-3s
  warm / 75.9s cold once); vessels/REPORT-CAP-LEAN.md (gate 17, spawn form,
  measured CT); vessels/REPORT-LEANDOCK.md (verdict mapping + false-green
  tightening, probe `extractor.t2.lean.*`).

### Item 3 — root-path proper fix + >=2 previously-unseen real inputs as regression fixtures

- **3a root fix — what changed**: `LspPyrightBackend` now builds every LSP wire
  uri from the didOpen'd ABSOLUTE path under the detected project root (never by
  joining the ingest-root-relative rel onto project_root, which mis-rooted the
  uri for bare package dirs and degraded every definition lookup to leads);
  responses map back via an `os.path.normcase` reverse table. Bare-dir staging
  retired at the outer wall (`outerwall.root.staged` probe kept, mode `direct`);
  single-file staging kept + sha-pinned. The bug signature is INVERTED in tests
  at both the cell and the outer wall.
- **3a — what now passes**: `test_bare_package_dir_resolves_live` (cell 3, live
  pyright) exercises the mismatch and asserts pyright-resolved call edges exist;
  outerwall `test_package_dir_extracts_direct_and_decision_logged`. Declared
  consequence (ingest-root-relative ids remint for bare-dir extract) recorded;
  parent-root layouts byte-identical (run_shell_demo ids unchanged).
- **3a proof pointer**: vessels/REPORT-ROOTFIX.md;
  packages/structure-extractor/ASSEMBLY-CHANGES.md (remediation section);
  ARCHITECTURE-PHASE2.md `package-root-uri-mismatch` BOUND->FIXED.
- **3b real inputs — what changed**: two previously-unseen real inputs vendored
  byte-verbatim, sha256-pinned, licenses alongside — `real_py/colorama`
  (colorama 0.4.6, BSD-3-Clause, 6 pure-py modules) and `real_lean/src`
  (Init/ByCases + Init/Classical + Init/SizeOfLemmas from the lean4 v4.31.0
  toolchain source, Apache-2.0). One legitimate cell-3 bug surfaced and fixed at
  its layer: raw-last-component decl matching mis-attributed kernel verdicts
  (Classical.choose carried decl=Exists.choose); fix `match_decls`
  (exact beats dotted suffix, longest suffix wins, residual tie attests
  nothing), probe `extractor.t2.lean.decl.match`.
- **3b — what now passes**: `outerwall/test_real_inputs.py` 21/21 — vendored
  bytes == PROVENANCE shas (drift = build failure); two independent
  analyze_session runs BYTE-COMPARE EQUAL (colorama 53942 B, real_lean 78257 B);
  colorama literally zero green (pyright resolves, never verifies); real_lean 58
  kernel greens + 3 unknown modules, 45 resolved proof_uses, zero leads; the
  collision regression frozen (crossed edge asserted ABSENT).
- **3b proof pointer**: transcript [REAL-INPUTS round]; acceptance/fixtures/
  real_py + real_lean with PROVENANCE.md; outerwall/test_real_inputs*.py;
  cell 3 ASSEMBLY-CHANGES `[ASSEMBLY CHANGE REAL-INPUTS]`.

### Item 4 — fault-injection for the core guards + ONE clean-state command

- **What changed**: `proofgraph/faultcheck/run_faults.py` (facade) +
  `faultcheck/faultlib/{harness,catalog}.py` — per fault a scratch robocopy in
  tempdir, a CONTROL that must PASS, ONE anchored defect (harness refuses a
  missing/ambiguous anchor), the EXISTING suite must FAIL carrying the guard's
  named class, scratch discarded (junctions unlinked first).
  `proofgraph/run_all_suites.py` is the ONE clean-state command.
  **Wave 3 (this round)**: the line-gate was added as fault (f) additively
  (a 250-line non-exempt file planted; linegate.py exits 1 naming it with class
  `line-gate-violation`) and as a suite row in run_all_suites.py.
- **What now passes**: all guards measured catching their defect — (a)
  `unbacked-green`, (b) `serializer-edge-drop`, (c) `lead-in-edges`, (d)
  `provenance-hole`, (e) P3 bundle scan `key-shaped material reached the browser
  bundle`, and (f) `line-gate-violation` (proven solo this round: CONTROL rc=0,
  fault run rc=1 naming `faultcheck/planted_ceiling_offender.py`, CAUGHT). The
  earlier 17/18 sweep carried a torn-snapshot faultcheck row (a concurrent
  refactor stream landing cell-3 splits mid-copy); this round's clean-state run
  (section 3) is at quiescence — the 18/18-owed re-record from FAULTCHECK bound 1
  is discharged here (now 19 rows with the line-gate).
- **Proof pointer**: vessels/REPORT-FAULTCHECK.md (5-guard verbatim catches,
  bound 1 the owed re-record); this report section 3 (the clean-state table);
  faultcheck/faultlib/catalog.py fault `f-line-gate-ceiling`.

### Item 5 — UI acceptance headless by default (DOM/a11y/probes, no pixel screenshots, no skips)

- **What changed**: `acceptance/headless/headless_ui.mjs` is the DEFAULT step-3
  driver (zero-dep CDP over built-in WebSocket, msedge `--headless=new`;
  `Page.captureScreenshot` NEVER called — the screenshot hang class is gone);
  run_demo's flag flipped to `--skip-ui` (emergencies, logged SKIP). Every
  server ephemeral; each page's hub workspace is a temp fixture copy
  (sha256 before==after asserted).
- **What now passes**: `python acceptance/run_demo.py` (no flags, no person)
  = 11 PASS / 0 FAIL / 0 SKIP, the UI step alone carrying 59 named page-checks
  (17 moat + 23 lean + 19 ceiling), every fact a DOM/a11y read or a spike-surface
  pin, expectations computed per page and id fields re-verified byte-level.
- **Proof pointer**: vessels/REPORT-HEADLESS-UI.md; acceptance/evidence/
  ui-{moat,lean,ceiling}.json; section 3 row `acceptance run_demo`.

---

## 2. The sub-200 restructure + the line-gate

### Before/after inventory

- **Before** (transcript [SUB-200 ROUND OPENED]): 111 source files over 200
  lines, ~42k lines involved, zero generated among them.
- **After** (measured by `python linegate.py`, this round): **0 non-exempt
  source files over 200 lines**. 727 in-scope source files checked; 108 exempt
  by explicit manifest rule; 147 files in the 151-200 warn band (informational,
  not failing; target ~135-150).
- **How**: waves 1+2 restructured all 13 areas behind FACADES at the original
  paths (zero external importer churn); catalogs sectioned into element-identical
  aggregators (counts asserted); tests split without count decrease. Per-area
  baseline suite counts preserved (transcript [SUB-200 WAVE 1 CLOSED] +
  [x] wave-2 entries; vessels/REPORT-SUB200-*.md x13, each with a verification
  table + exemption list). Notable examples: App.tsx 1188->128, styles.css
  553->88 (cell-5 skin section byte-intact), outerwall test_outerwall 819->71
  aggregator + class modules, run_demo 1650->199 facade + acceptance/checks/.

### The exemption manifest (proofgraph/linegate-exemptions.json)

Every entry carries a reason; nothing is exempt implicitly. Classes:
dirName rules (node_modules, __pycache__, .git, dist, .vite, .lake); directory
rules (gen/ projections, out/ run artifacts, fixtures, testbed, goldens+
recordings, acceptance/fixtures vendored real inputs + evidence/ + browser/,
vessels fixtures, shell-design reference prototypes); file rules (package-lock
lockfiles, Driver.lean proven artifact, schema.json/capability.json/vectors.json
frozen constitution, generated projections, analysis-*.json / TRACE / TRACE-node
generated outputs). Sourced from the 13 wave reports' exemption lists + the
REAL-INPUTS round record; `.md` docs/logs are records, outside sourceExtensions
by the wave reports' own counting convention.

### The line-gate (proofgraph/linegate.py, itself under the ceiling)

Walks the working tree, counts lines of every source file (extensions in the
manifest), applies the explicit exemption manifest, and FAILS (exit 1, listing
offenders, failure class `line-gate-violation`) on any non-exempt source file
> 200 lines; warn-only stats for the 151-200 band. It audits its own manifest
first (ceiling sane, every rule carries a non-empty reason) and refuses to run
on a malformed manifest. Wired into run_all_suites.py as the first suite row
(facade-safe extension). Tested BOTH ways: clean pass now (0 offenders, above)
and a scratch-copy fault run (faultcheck fault (f), section 1 item 4).

---

## 3. The ONE clean-state command + its VERBATIM output table

Command (from proofgraph/, once, to completion):

```
python run_all_suites.py
```

Verbatim final table (run of 2026-08-03; suite logs preserved at the temp path
printed in the run header):

```
suite                                  result      time   counts
----------------------------------------------------------------
line-gate (sub-200 ceiling)            PASS        0.4s
schema (py)                            PASS        0.2s   23 tests, OK
schema (ts)                            PASS        1.1s   pass 14, fail 0
cell 1 graph-model                     PASS        2.5s   113 tests, OK
cell 2 capability-layer                PASS       61.5s   131 passed in 60.11s (0:01:00)
cell 3 structure-extractor             PASS       86.9s   140 tests, OK
cell 4 editor-shell                    PASS        6.2s   pass 96, fail 0
cell 5 graph-view                      PASS        7.0s   Tests 152 passed (152)
cell 6 byok-arena                      PASS        2.0s   pass 103, fail 0
hub                                    PASS       26.7s   44 tests, OK
outerwall                              PASS       94.0s   41 tests, OK
ai                                     PASS        1.2s   pass 14, fail 0
app vitest (+build gate)               PASS       76.1s   Tests 111 passed | 1 todo (112)
app tsc --noEmit                       PASS        6.6s   clean (no output)
vessel V1 (capability x extractor)     PASS       45.6s   11 tests, OK
vessel V3 (extractor x model)          PASS        1.4s   16 tests, OK
acceptance run_demo --skip-browser     PASS       68.9s   10 PASS, 0 FAIL, 1 SKIP ==
acceptance run_shell_demo              PASS       30.5s   11 PASS, 0 FAIL ==
fault-injection (faultcheck)           PASS      524.9s   faults caught: 6/6  ->  OK
----------------------------------------------------------------
GRAND TOTAL                            PASS     1044.0s   19/19 suites passed
```

Notes on how this table was reached (honesty record): the first take of this
run FAILED 17/19 with two rows red, both diagnosed and fixed before this take —
(1) line-gate caught `audit/AUDIT-hub.json` + `AUDIT-schema.json`, the
adversarial round's own generated ledgers, born after the exemption manifest
was compiled; classified honestly as generated audit DATA via a dated `audit/`
directory rule in `linegate-exemptions.json`. (2) fault (a)'s text anchor
pointed into `lean_dock.py`, whose green branch the SUB200 wave-1 split moved
to `lean_ct_fill.py` — the faultcheck harness crashed at inject time and
reported 0 PASS for the whole suite; the catalog was re-pointed (comment
records the move) and faults (a)+(f) were re-proven solo (control PASS →
fault CAUGHT) before this full take. The `run_demo` row's `1 SKIP` is the
runner's designed `--skip-browser` shape inside run_all; the FULL headless-UI
`run_demo` (11 PASS / 0 FAIL / 0 SKIP) is item 5's own proof, section 1.

The `run_demo --skip-browser` inside this table plus the standalone full
`run_demo` runs recorded in section 1 together cover every acceptance surface.

---

## 4. DECLARED LIMITATIONS (exactly where each stands)

1. **Toolchain pin divergence** — the driver pins
   `leanprover/lean4:v4.31.0` (two measured 4.31 quirks: thmInfo async
   `TheoremVal.value` read; processHeader log union), cell-2 `lean_repo` pins
   `v4.32.0` (measured CT). Declared-not-unified; probed every CT run
   (`extractor.t2.lean.toolchain.divergence`) + on the ceiling
   (`extra.toolchainPinDivergence`). **Owed**: unify on ONE pin and re-measure
   whichever moves (re-run `run_smoke.py` for the driver, or re-run gate 17 for
   cell 2). Source: REPORT-LEANDOCK bound 1 / REPORT-GREENFLOW / REPORT-CAP-LEAN.

2. **Lean single-file scope** — the driver elaborates one file per invocation;
   multi-file lake import graphs are RECOMMENDED-UNPROVEN (`lake env lean --run`
   per file after `lake build`, no scratch lake project built this round).
   Rides every output as `honestCeilings.lean.driverLimits[0]`. Source:
   REPORT-LEAN-DRIVER-SPIKE "Answers for the NEXT round" #1; REPORT-LEANDOCK
   bound 2.

3. **Browser editor gutter at stub tier G shows blocked-greens** — with no
   measured capability stream aggregated on the ephemeral hubs, the browser
   editor mounts cell 4's stub transport at tier G; attested kernel greens are
   BLOCKED there by the cell's own guard (`wouldBeGreen:true,
   greenAllowed:false, "tier G is not compiler truth"` +
   `green-may-never-be-faked`, zero `pg-fill-green` glyphs) — honest, asserted
   in the headless gate. The CT gutter green IS proven headless at the MEASURED
   tier (§7(i)). Source: REPORT-GREENFLOW bound 4; REPORT-HEADLESS-UI bound 1.

4. **Two pre-existing environment skips** — (a) hub: one subtest skips on the
   Windows symlink privilege (WinError 1314), pre-existing, subtest-loud
   (REPORT-ROOTFIX / REPORT-GREENFLOW: "hub 44 OK / 1 env skip"); (b) the
   browser canvas screenshot quirk — `Page.captureScreenshot` could hang on the
   Monaco canvas; the headless UI driver deliberately never calls it (the hang
   class is gone), and `browser_shot.mjs` is retired to a MANUAL tool. Source:
   REPORT-HEADLESS-UI (screenshot hang class); hub suite skip record.

5. **Duplicated pyright subprocess bound** — the V1 vessel exercises cell 2's
   measured pyright handle AND cell 3 building its OWN pyright backend, so two
   pyright subprocess trees can co-exist under the vessel; declared, owned by
   the vessel, tree-killed at teardown. Source: vessels/v1_capability_extractor.py
   (`duplicated-subprocess` note); vessels/REPORT-V1.md.

6. **Cell-5 DOM-skin fragility bound** — the cell-5 visual skin is enforced by
   `app/test/shell1c.skin.test.tsx` asserting on `app/src/styles.css` BYTES
   (hex-grep 0, paint-untouched, no-!important-on-paint); the skin section is
   kept byte-intact through the sub-200 @import split precisely because that
   byte-level test is fragile to reordering. Source: REPORT-UI-1C-POLISH.md;
   REPORT-SUB200-app-src.md (skin byte-preservation note); styles.css header.

7. **Faultcheck scratch specifics** (from REPORT-FAULTCHECK bounds): junctioned
   node_modules in scratch copies (a link, not a copy; fault runs write nothing
   there); fault (a) uses cell 3 `--fast` (its live-pyright oracle skipped in
   that pair; the FULL cell-3 suite runs in run_all_suites.py); faults (c)/(d)
   fail at module setup by design (BUILD-FAILING guards). Fault (f) added this
   round runs `python linegate.py` in the scratch (no junctions needed).

---

## 5. Adversarial-round readiness

Every source file is now <= 200 lines and LINE-GATED (the ceiling is an enforced
invariant, not a convention: run_all_suites.py row 1 + faultcheck fault (f)).
The claim-audit design (Stage A per-area claim auditors on whole-file-auditable
files -> Stage B adversarial refuters >=20% sample -> Stage C bottom-up README
tree) is FROZEN in the transcript ([ADVERSARIAL ROUND DESIGN]) and its launch
gate — waves 1+2 + line-gate + clean sweep + this report — is met by this
round's close. The adversarial round can begin against a tree where every file
is whole-file auditable and the ceiling cannot silently regress.
