# REPORT — LEAN-DOCK (dock wiring round; remediation worklist items 1+2)

**Task**: upgrade `packages/structure-extractor`'s LeanDock from the tier-G
tree-sitter placeholder to the REAL Lean path using the round-1 PROVEN driver
(`vessels/REPORT-LEAN-DRIVER-SPIKE.md`). This is the round that makes genuine
kernel-verified greens exist in the envelope. The outer-wall/hub/UI green-flow
is the NEXT round — the envelope was the finish line here, and only cell 3
(+ the V1 connector test it legitimately changed) was touched.
**Status**: DONE — cell suite 131/131, V1 11/11, V3 16/16; outerwall 27/31
untouched with the 4 failures recorded below (all the legitimate
verdict-arrival change the brief predicted).

## Resume audit (audit-first rule honored)

Disk state checked before any edit: `extractor/docks/lean_dock.py` was the
untouched G-tier placeholder (no partial CT wiring existed); the spike dir
(`extractor/docks/lean_driver/`) was complete and re-verified live TODAY —
`run_smoke.py` -> SMOKE PASS, all assertions, warm ~2.5s/file. Nothing redone
blind; the driver stands verbatim, only consumed.

## What exists now (all measured, never asserted)

- **Genuine kernel greens in the envelope.** `fixtures/lean_ct/Verified.lean`
  through the pipeline at CT: `base_fact` / `uses_base` / `unused_hyp_case`
  -> fill `green`, origin `checked`, source
  `lean-kernel:v4.31.0:kernelAccepted decl=<name> run=<sha16-of-driver-stdout>`
  (the runSha resolves in the probe stream via
  `extractor.backend.leanDriver.resp`). `sorry_case` -> **amber**, source
  names `sorryAx`. The module node stays unknown (not a kernel-judged unit).
- **The RESOLVED proof-dependency edge**: `proof_uses Verified.uses_base ->
  Verified.base_fact`, resolver `lean-kernel`, extractor `lean-driver`,
  from `decls[].refs` — with its 1:1 resolved decision (`R_LEAN_DRIVER`).
  All 38 out-of-set constants (core refs + implicit `Init` import) are
  probed `X_CORE` rejections — zero silent drops.
- **unusedHypotheses**: per-decl probed payloads
  (`extractor.t2.lean.unusedHyp`, `unused_hyp_case -> ["h2"]`, `h` NOT
  flagged) + a run summary probe + `extra.unusedHypothesesSummary` riding
  the honestCeiling in the envelope (Node schema stays CLOSED — no fields
  added).
- **Driver limits[] ride VERBATIM** (`extra.driverLimits`, 9 entries,
  single-file bound included).
- **Verdict mapping** implemented as the PURE function
  `lean_dock.lean_verdict` (spike mapping + one deliberate tightening):
  green = kernelAccepted AND NOT usesSorry AND unexpectedAxioms=[] **AND the
  file elaborated error-free**. The tightening exists because a measured run
  on the Mathlib-importing `fixtures/lean/Basic.lean` showed a decl
  (`double`) PRESENT with `kernelAccepted:true` inside a header-failed file
  — the spike's candidate formula alone would have minted a false green from
  a poisoned environment. Declared on the ceiling, gated by tests.
- **Guard**: failure class **`unbacked-green`** (`UnbackedGreenError`) — a
  green without origin `checked` + a `GREEN_ATTESTED_PREFIXES` source + a CT
  tier is probed (`extractor.green.enforcement.violation`) and raised at
  assemble; `SchemaNode.validate` rejects it too. Forged-green tests cover
  schema, assemble, and tier level; a kernel-shaped source at tier G still
  raises (no self-upgrade).
- **Tier semantics stay measured**: at G the dock is the pre-round
  placeholder — `fixtures/golden/lean.edges.json` regenerated under a pinned
  G and diffed **byte-identical** to the pre-round bytes; a pinned-G run
  fires zero driver probes. CT behavior only under a CT capability response
  (stub gained lean->CT mirroring python; the REAL tier keeps coming from
  cell 2 through the V1 feed).
- **Driver-dead is typed**: driver-timeout (tree-killed via `taskkill /T /F`
  — the elan shim spawns a child lean; cell backend precedent) /
  driver-crash / driver-bad-json -> probed `extractor.t2.lean.driver.dead`,
  decls stay unknown, anchors become `U_BACKEND_*` leads, **no partial
  green** (both paths tested live through the pipeline).
- **Latency probed per invocation**: `extractor.t2.lean.driver.timing`
  {file, wallNanos}; measured this round ~2.5-3.2s warm/file; a multi-file
  tree = sequential invocations (bound logged in the ceiling status).
- Probe catalog **137 -> 148** (11 additive: 9 CT-driver + 2 green-guard)
  [updated: the later REAL-INPUTS round grew it 148 -> 149 additively
  (`extractor.t2.lean.decl.match`); re-measured 2026-08-03 at 149 —
  32+41+48+28 across the four catalog section files];
  goldens regenerated via `gen_goldens.py` and diff-reviewed (G-tier lean
  byte-stable; `lean_ct.edges.json` NEW; python/latex/typst unchanged;
  pyright recording untouched).

## Bounds carried (declared, not smoothed)

1. **Toolchain pin divergence** — driver `leanprover/lean4:v4.31.0` (two
   MEASURED quirks) vs cell-2 `lean_repo` `v4.32.0` (measured CT). Probed
   every CT run (`extractor.t2.lean.toolchain.divergence`) + declared on the
   ceiling (`extra.toolchainPinDivergence`), NOT unified.
   **Recommendation for the report round**: unify on ONE pin — re-pin the
   driver to v4.32.0 AND re-measure its two 4.31 quirks (thmInfo async
   `TheoremVal.value` read; processHeader log union) via `run_smoke.py`, or
   re-pin cell 2's lean_repo to v4.31.0 and re-run gate 17. Whichever moves
   gets re-measured; nothing is assumed to transfer.
2. Single-file only; multi-file lake = declared limit riding the output
   (`lake env` per-file is the spike's recommended next step, unproven).
3. ~3s warm / ~76s cold per invocation, probed; suites budget it.
4. No per-ref/per-binder source positions (InfoTree deliberately unused) —
   proof_uses use-site span = the decl span, said so on each candidate.
5. Green conservatively blocked for any file with elaboration errors (see
   the false-green measurement above) — stricter than the spike formula.

## Suites (end state this round)

- cell 3 FULL (`python selftest/run_all.py`, live pyright + live driver):
  **131/131 OK** (104 baseline + 27 new; suite ~52s).
- V1: **11/11** — updated honestly: cell 2 MEASURES lean since CAP-LEAN, so
  c1 now pins the measured-CT tier byte-equal across the seam; c2 proves
  verdict-arrival WITHOUT false green (the Mathlib fixture cannot elaborate
  single-file -> zero resolved edges, zero green, driver invocation probed);
  the REFUSAL -> recorded-local-stub-fallback semantics SURVIVE verbatim as
  c3 on latex (a language cell 2 still refuses).
- V3: **16/16** (no lean surface).
- **Outerwall: 27/31, NOT touched (next round owns this).** The 4 failures
  are ALL in `Test03LeanHonestCeiling` and are ONLY the legitimate
  verdict-arrival change:
  1. `test_nodes_and_leads_only` — `graph.edges` now contains the
     kernel-resolved `proof_uses` edge (`uses_base -> base_fact`, resolver
     `lean-kernel`) on the acceptance fixture; the old expectation was
     `edges == []`.
  2. `test_all_unknown_literally_zero_green` — statuses now include real
     `green` (the acceptance fixture is kernel-clean); the all-unknown
     expectation is obsolete BY DESIGN of this round.
  3. `test_incomplete_bases_populated_for_nodes_with_leads_out` —
     `incompleteBases == {}` because the former G-tier leads became resolved
     edges / probed rejections: zero leads out of lean nodes at CT.
  4. `test_stub_fallback_recorded_not_silent` — lean capability provenance
     is now `measuredBy: capability-layer, tier: CT` (cell 2 measures lean);
     the local-stub-fallback expectation moved to a still-refused language
     (mirrored by V1 c3).
  Everything else in the outerwall (27 tests incl. provenance, vocabulary,
  ruling-8 outline, hub canonical bytes, python paths) stayed green — and
  crucially the arriving lean greens **passed graph-model's wall greenGuard**
  (origin `checked` + attested source; no `fake-green` refusal fired
  anywhere). The next round can wire the green-flow to hub/view/editor and
  update those four expectations to assert the arrival instead of absence.

## Impact assessment for the next (outer-wall green-flow) round

- The envelope now delivers: green/amber fills with kernel attestations,
  the resolved lean edge, `unusedHypothesesSummary` + `driverLimits` +
  `toolchainPinDivergence` on the lean ceiling. greenGuard-compatible as
  measured (see above) — the hub/view/editor hops only need to CARRY them.
- Outerwall Test03 (4 tests) must be rewritten to assert verdict-arrival;
  no other outerwall surface changed in measurement.
- analyze() on lean roots now costs one cell-2 lean battery (lake) + ~3s
  driver per file — budget it in acceptance timing.
- The pin-divergence decision (bound 1) should be closed in the report
  round.
