# REPORT — GREEN-FLOW (remediation worklist item 1's finish line)

**Task**: the first REAL kernel-verified green travels checker → analyze() →
hub → graph view → editor gutter — the SAME content-addressed Node.id
byte-identical at every hop — and the unbacked-green guard still rejects at
every wall.  Outer wall updated HONESTLY for the verdict-arrival world;
the unknown-never-green acceptance story SURVIVES on a new input.
**Status**: DONE — outerwall 41/41 (was 27/31), run_demo FULL 11 PASS /
0 FAIL / 0 SKIP (real browser included), whole-organism sweep green.
**Cells touched**: NONE (the brief's prediction held — cell 4's guard
admitted the attested CT greens exactly as shipped).  All changes are
assembly code, logged in agentic-convos/remediation-round.md.

## The finish line, measured (never asserted)

`acceptance/fixtures/unused_hyp.lean` at CT (cell 2 measures lean; cell 3's
LeanDock runs the proven v4.31.0 kernel driver):

- `base_fact` / `uses_base` / `lonely` → fill **green**, origin `checked`,
  source `lean-kernel:v4.31.0:kernelAccepted decl=<name> run=<sha16>`; the
  module node stays **unknown** (not a kernel-judged unit).
- The RESOLVED edge `proof_uses uses_base → base_fact` (resolver
  `lean-kernel`, extractor `lean-driver`); **zero leads**; `incompleteBases
  == {}` — the resolved world.
- RULING-8's first real exercise: green theorem fills contribute the
  `lemma` token; `uses_base` (green over a green base) **rings green NOW**
  (`{status: green, worstOf: ['lemma']}`); the unknown module stays
  `{unknown, ['none']}`.  Verified at the outer wall on real data AND by a
  new synthetic case (green over amber base → rings amber,
  `['amber','lemma']`).
- sorry ⇒ **amber** asserted AT THE OUTER WALL on cell 3's read-only
  `fixtures/lean_ct/Verified.lean` (`sorry_case`: amber, source names
  `sorryAx`, ring amber, never green).

### §7(i) — the green trace (acceptance/TRACE-full.json → `greenTrace`)

`n_4f3647710786b797` (`unused_hyp.uses_base`) byte-identical at EVERY hop:

1. **kernelEvidence** — fill.source `run=cc8e…` (sha16) RESOLVES to the
   probed `extractor.backend.leanDriver.resp` invocation (green BECAUSE the
   kernel verified it — the evidence chain, not a style).
2. **modelWallGreenGuard** — `graph-model.wall.ingest.greenGuard`
   `allowedGreen:true` (attested origin `checked` + non-default source).
3. extraction preimage pin → 4. model ingest → 5. analyze() canonical bytes
   → 6. hub `GET /graph` (byte offsets asserted) + 7. `GET /analysis`
   (fill green SERVED) → 8. **view** `dump().paints` fill `#2E7D32`
   (the cell's own canonical green — pins, not pixels; resolved edge
   renders as a REAL edge, zero `render.edge.leadGuard`) → 9. **editor
   gutter** `editor.verdict.gutter.paint` glyph `pg-fill-green`, chained to
   `editor.verdict.green.guard` `greenAllowed:true, tier:CT`.  The editor
   mounts at the tier the analysis MEASURED
   (`capability.lean.measuredTierPin.measuredTier == "CT"`, asserted before
   mounting) — never a locally asserted tier.

### §7(j) — the companion guard (doctored green, checker evidence stripped)

Fails at EVERY wall, each with its NAMED class, never silently:
- cell 3 `SchemaNode.validate` → **`unbacked-green`**;
- graph-model wall ingest → **`fake-green`** (pinned on
  `graph-model.wall.ingest.rejected`; the SAME wall that admitted the real
  greens; committed state SURVIVES the refusal — verdicts still served);
- editor wall → **`green-may-never-be-faked`**
  (`editor.verdict.green.blocked`, zero green glyphs painted).

### The surviving honest ceiling

The all-unknown story moved to the NEW `acceptance/fixtures/
honest_ceiling.typ` (typst: cell-2 typed refusal `unknown-language`,
recorded local-stub fallback, tier G): nodes + dashed leads only, ZERO
green at every layer — analyze() → hub bytes → view paints → AI no-claim
(§7 c + h) and at the outer wall (Test04TypstHonestCeiling, the ported
pre-arrival lean tests).  **Measured correction to the brief's suggestion**:
the lean Mathlib-import fixture does NOT stay unknown — it is measured
**red** (file-error/elaboration-error sources on every elaborated decl), so
it cannot carry the all-unknown story; typst does.

### serve_app on the lean CT fixture

`python hub/serve_app.py --fixture acceptance/fixtures/unused_hyp.lean
--root unused_hyp.uses_base --http-port 0 --ws-port 0 --pyright none` →
ready (4 nodes, 1 edge, 0 leads); `/graph` serves the 3 greens verbatim
(origin checked, lean-kernel sources) + the resolved edge; `/analysis`
serves 3 green fills + 3 green rings.  Verified live this round.

## Outer wall — Test03 rewritten honestly (each change carries its reason)

| old expectation (absence) | new expectation (arrival) |
|---|---|
| `edges == []` | exactly the kernel-resolved `proof_uses` edge |
| all statuses `unknown`, zero green | 3 attested greens + unknown module; wall greenGuard pins admitted them |
| `incompleteBases` populated | `incompleteBases == {}` (leads resolved away) |
| lean capability = local-stub G fallback | measuredBy `capability-layer`, tier CT (pin `measuredTierPin == CT`); the stub-fallback test moved to typst verbatim |

Kept: roots-undeclared honesty (unchanged by arrival).  Added: sorry→amber;
ceiling limits + pin divergence asserted; doctored-green wall rejection.
Suite 31 → **41 tests, FULL GREEN** (~69 s; two lean batteries + typst +
xyz + moat live pyright + rich recorded).

## Browser step — ephemeral by rule

The live stack owns 8477/8478/8479/5199, so the browser spot check now runs
EVERY hub+ai pair on EPHEMERAL ports through the app's own harness seams —
`?hub=` (existed) and `?ai=` (added this round, additive, mirroring it);
`ai/server.ts` gained the additive `--hub`/`--port 0` CLI; a vite already
on 5199 is REUSED read-only.  Harness fixes for the app-shell world:
`browser_shot.mjs` opens the `rail-ai` tool window before asking, and reads
the analysis state line from the status bar (fallback; old selector kept).
Real-browser facts this run (msedge, headless=new over CDP): moat page
6 nodes all-unknown + AI names the unused id; lean page 3 GREEN paints +
unknown module, 0 leadGuards; ceiling page all-unknown, 2 dashed leads +
2 ghost placeholders, AI no-claim.  Six screenshots under
`acceptance/browser/`.

## Toolchain pin divergence (carried VERBATIM; still declared, not unified)

From the lean honest ceiling, riding every CT output
(`honestCeilings.lean.toolchainPinDivergence`, asserted by
`test_lean_ceiling_declares_limits_and_pin_divergence`):

> {"driverPin": "leanprover/lean4:v4.31.0", "capabilityPin":
> "leanprover/lean4:v4.32.0", "action": "declared-not-unified — driver
> keeps its two MEASURED v4.31 quirks; cell 2 measured CT on v4.32.0;
> unification is report-round work (re-measure whichever pin moves, re-run
> run_smoke.py)"}

REPORT-LEANDOCK.md bound 1's recommendation STANDS: unify on ONE pin —
re-pin the driver to v4.32.0 AND re-measure its two 4.31 quirks (thmInfo
async `TheoremVal.value` read; processHeader log union) via `run_smoke.py`,
or re-pin cell 2's lean_repo to v4.31.0 and re-run gate 17.  Whichever
moves gets re-measured; nothing is assumed to transfer.

## Bounds (declared, riding the outputs)

1. Toolchain pin divergence — above, probed every CT run.
2. Driver limits (9, single-file scope included) ride
   `honestCeilings.lean.driverLimits` verbatim; multi-file lake unproven.
3. ~3 s warm / ~76 s cold per driver invocation, probed; suites budget it
   (outerwall ~69 s, run_demo full ~83 s).
4. The browser editor pane mounts the stub floor at tier G when no measured
   stream is aggregated (browser gutter shows debt/unknown there — honest);
   the CT gutter green is proven headless at the MEASURED tier (§7 i).
5. hub Test05 census updated 137 → 148 for cell 3's ADDITIVE LEAN-DOCK
   probe growth (a shrink would still fail — probe APIs never shrink).
   [updated: REAL-INPUTS later grew it 148 → 149 additively; the census
   assert now lives in hub/test_hub_pins.py (SUB200 split) and pins 149 —
   re-verified 2026-08-03.]

## Sweep (end state this round, all measured live)

| suite | result |
|---|---|
| outerwall | **41/41 OK** (~69 s) |
| hub | **44 OK** (1 env skip: symlink privilege — pre-existing, declared) |
| acceptance run_demo (FULL, real browser) | **11 PASS / 0 FAIL / 0 SKIP** (~83 s) |
| acceptance run_shell_demo | **11 PASS** |
| vessels V1 / V2 / V3 | **11/11 · 4/4 (one transient under concurrent cell-2 load; clean solo) · 16/16** |
| graph-model (cell 1) | **113 OK** |
| capability-layer (cell 2) | **131 OK** |
| structure-extractor (cell 3) | **131 OK** |
| editor-shell (cell 4) | **96 OK** (untouched) |
| graph-view (cell 5) | **133 OK** (untouched) |
| byok-arena (cell 6) | **103 OK** (untouched) |
| packages/schema | **23 py + TS node--test OK** |
| ai (node --test) | **14 OK** (additive --hub CLI covered by the existing suite) |
| app (vitest FULL incl. build gate) | **111 passed + 1 todo** (UI-polish agent's concurrent work merged; reconciled at round end — no semantic conflicts) |

## Files touched (assembly only)

- `outerwall/test_outerwall.py` (Test03 rewrite, Test04 typst, renumber 05-08,
  green-world ruling-8 synthetic)
- `acceptance/fixtures/honest_ceiling.typ` (NEW), `acceptance/run_demo.py`
  (ceiling world, checks i+j, ephemeral browser step, report prose),
  `acceptance/headless/browser_shot.mjs` (app-shell ask flow + status-bar
  fallback)
- `app/test-acceptance/acceptance.headless.test.tsx` (h→ceiling; new i, j),
  `app/src/main.tsx` (additive `?ai=` seam), `ai/server.ts` (additive
  `--hub` CLI)
- `hub/test_hub.py` (census 137→148, additive-growth comment)
- `OUTERWALL-CONTRACT.md` (green-flow addendum, additive),
  `acceptance/ACCEPTANCE-REPORT.md` (regenerated by the runner),
  `vessels/REPORT-GREENFLOW.md` (this report)
- Outputs regenerated: `acceptance/analysis-{moat,lean,ceiling}.json`,
  `acceptance/TRACE-full.json` (+`greenTrace`), `acceptance/evidence/*`,
  `acceptance/browser/*.png`
