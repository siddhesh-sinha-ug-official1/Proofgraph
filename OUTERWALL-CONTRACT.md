# Outer-wall contract — Phase 3 (frozen before build)

The outer wall: one membrane around the assembled system. Two interfaces; cross-cell analysis inside.

## Programmatic face (Python, `proofgraph/outerwall/`)

```python
analyze(source_root, roots=None, config=None) -> {
  "graph": {...},          # canonical envelope, nodes' outline FILLED per ruling 8 (no longer null)
  "verdicts": {...},       # nodeId -> {fill: {...}, outline: {...}} (projection of graph, convenience)
  "provenance": {...},     # nodeId/edgeId -> {cell, tier, extractor, resolved} + per-lang honest ceilings
                           #   + capability measurement provenance (measuredBy, evidence pin refs)
  "gapAnalysis": {
     "unused": [...], "unreferenced": [...],          # [] + "undeclared" marker if no roots
     "cycles": {...},                                  # sccs + condensation (isDAG asserted)
     "reachability": {...},                            # per-root, from the model wall
     "incompleteBases": {nodeId: [leadIds]},           # ruling 8's lead-capped nodes
     "blindSpots": [...], "soundnessNote": "..."       # logged, never claimed complete
  }
}
```

- Composition: hub pipeline (extract → ingest, real V1 capability_fn for python) + the
  emergent layer. OUTLINE per **ruling 8** (see master transcript): reflexive-transitive
  base over resolved edges; 7-token worstOf (fill red/amber/blue → token; green →
  lemma|definition by kind; empty → none); unknown fills act on STATUS only
  (worse-of via FILL severity red<amber<blue<unknown<green); any lead out of the base
  caps status at unknown + lands in incompleteBases.
- Graph algorithms: model wall `query()` ONLY (rustworkx + networkx crosscheck +
  condensation-is-DAG). The outline closure may use rustworkx directly (log the library),
  never hand-rolled traversal without a crosscheck.
- **System diagnostic surface**: `system_pins()` → {probeCatalog, dump, history, tap}
  aggregating every cell's pins + hub/seam probes, one outermost header
  (`cellId: "system.outerwall"`). history() must be able to reproduce the V4 trace and
  extend it (this is where §7's "one Node.id identical at every hop" is read from).
- Honest ceiling: an unknown-language source in the tree → its nodes/verdicts surface
  unknown (never green) all the way through analyze()'s return; typed refusals recorded
  in provenance.
- Named failure classes: reuse the seam catalog; new ones (e.g. outline-vocabulary-leak:
  a non-7-token string in worstOf is a build-failing bug) get catalogued.
- HTTP: hub gains additive GET `/analysis` (the analyze() result, canonical json) once
  computed; POST /analyze already re-runs the pipeline.

## Human face (TS, `proofgraph/app/` becomes browsable)

- Vite app: editor wall (Monaco tier) + graph-view wall + V5 joined bus + `/graph` +
  `/analysis` from the hub + `/lsp` WS for diagnostics (V2 path).
- Verdict gutter + OUTLINE ring colors from analysis data (canonical WORST_TO_STATUS —
  already in packages/schema/gen). unknown renders unknown/grey; leads dashed.
- AI panel: `proofgraph/ai/` gains a tiny zero-dep node HTTP server (`ai/server.ts`,
  POST /ask {question}) wrapping the V6 outlet; the browser calls it; **keys live only in
  that node process** (vault + injected masterSecret), never in vite/browser code.
  Fake-transport mode by default (no real keys in this round's demo; --live flag documented
  but out of demo path).
- Dev ports: hub HTTP 8477, hub WS 8479 (a SEPARATE socket, discovered by the app via
  /health.lsp.url — its number is free to differ), ai 8478, vite 5199 (graph-view's pinned
  port) — fixed, documented in app/README.

## Acceptance fixtures (shared; already created)

- `proofgraph/acceptance/fixtures/moatpkg/` — python moat case: `core.py` (root; uses
  `helpers.used_fn`) + `helpers.py` (`used_fn`, `unused_fn` ← the unused decl) + empty
  `__init__.py` (excluded by cell 3's defaults — known behavior). Roots: `["moatpkg.core"]`.
- `proofgraph/acceptance/fixtures/unused_hyp.lean` — lean honest-ceiling case: G-tier dock
  ⇒ T1 nodes + leads only ⇒ unknown everywhere, dashed leads, never green.
  **SUPERSEDED (green-flow round, additively): lean EARNED CT** — cell 2 measures lean
  (CAP-LEAN) and cell 3's LeanDock runs the proven kernel driver (LEAN-DOCK), so this
  fixture now produces the VERDICT-ARRIVAL world: kernel-clean decls fill `green`
  (origin `checked`, source `lean-kernel:v4.31.0:kernelAccepted … run=<sha16>` — the
  run-sha resolves to the probed driver invocation), the `proof_uses uses_base →
  base_fact` edge arrives RESOLVED (resolver `lean-kernel`), zero leads, ruling-8 green
  rings (`worstOf ['lemma']`), the module node stays `unknown`. The sorry⇒amber case is
  asserted at the outer wall on cell 3's read-only
  `packages/structure-extractor/fixtures/lean_ct/Verified.lean`.
- `proofgraph/acceptance/fixtures/honest_ceiling.typ` — the SURVIVING all-unknown
  honest-ceiling case (green-flow round): typst is a language cell 2 still REFUSES
  (typed `unknown-language`, recorded local-stub fallback, tier G) ⇒ T1 nodes + dashed
  leads only, unknown everywhere, never green, incompleteBases populated,
  roots-undeclared honored. The unknown-never-green acceptance story lives here now.
  (The lean Mathlib-import fixture was MEASURED red — elaboration errors — not
  unknown, so it does NOT carry this story.)
- **REAL-INPUTS round (worklist item 3b, additive)** — two previously-unseen REAL
  inputs, vendored byte-verbatim with PROVENANCE.md sha256 pins + license texts,
  frozen by `outerwall/test_real_inputs.py` (21 tests: two-run byte-identical
  canonical analyses, validate.py, assert_no_holes, verdicts == the checkers'
  actual output, the Classical.lean collision regression):
  - `proofgraph/acceptance/fixtures/real_py/colorama/` — colorama 0.4.6
    (BSD-3-Clause, this machine's wheel; 6 pure-python modules): live pyright,
    roots `["colorama.initialise"]` module-expanded, 28 nodes / 27 resolved edges /
    26 leads, literally zero green (pyright resolves, never verifies), 11 genuinely
    unreached ansi/winterm helpers = the frozen unused set.
  - `proofgraph/acceptance/fixtures/real_lean/src/` — `ByCases.lean` +
    `Classical.lean` + `SizeOfLemmas.lean` VERBATIM from the
    `leanprover/lean4:v4.31.0` toolchain source (Apache-2.0; the driver's own pin):
    61 nodes, 58 kernel greens + 3 unknown modules, 45 resolved `proof_uses`, zero
    leads; every green's `decl=` names the node's OWN written identifier and every
    `run=` resolves to the probed driver invocation for THAT file.  Surfaced and
    fixed (cell 3, `[ASSEMBLY CHANGE REAL-INPUTS]`): raw-last-component decl
    matching mis-attributed verdicts under a real name collision
    (`Classical.choose` vs top-level `Exists.choose`) — now disambiguated on the
    written identifier, ambiguity attests nothing, probed
    `extractor.t2.lean.decl.match` (catalog 148→149).  Ruling-8 measured richer
    than any demo: a green theorem over a green DEF rings BLUE
    (`em` worstOf `['definition','lemma']` — ruling 1 through ruling 8).

## Green-flow addendum (remediation worklist item 1 — the first REAL green end to end)

- The first genuine kernel green travels checker → analyze() → hub → graph view →
  editor gutter with the SAME content-addressed Node.id byte-identical at every hop —
  acceptance check §7(i) (`greenTrace` in `acceptance/TRACE-full.json`).
- Green is admitted ONLY with the full attestation chain: origin `checked` + a
  `GREEN_ATTESTED_PREFIXES` fill.source + measured CT. The forgery is rejected at
  THREE walls, each with its named class — cell 3 schema `unbacked-green`,
  graph-model wall ingest `fake-green` (pinned on `graph-model.wall.ingest.rejected`,
  committed state survives the refusal), editor wall `green-may-never-be-faked`
  (`editor.verdict.green.blocked`) — acceptance check §7(j).
- RULING 8 in the green world (first real exercise): green fills contribute
  kind-derived tokens (`theorem`→`lemma`, other decls→`definition`); a green-based
  theorem over a green base rings GREEN; a green theorem over an amber (sorry) base
  rings AMBER (`worstOf ['amber','lemma']`); unknown still acts on STATUS only.
- The editor mounts at the tier the analysis MEASURED (`capability.lean.
  measuredTierPin`), never a locally asserted tier; cell 4's guard passing at CT is
  proven by the `editor.verdict.green.guard` / `editor.verdict.gutter.paint` pins.
- Declared and NOT smoothed: the toolchain pin divergence (driver
  `leanprover/lean4:v4.31.0` vs cell-2 lean_repo `v4.32.0`) rides every lean output
  (`honestCeilings.lean.toolchainPinDivergence`); unification stays report-round work.

## Acceptance runner (after both faces land): `proofgraph/acceptance/run_demo.py`
One command. Drives analyze() on the fixtures + the app/hub/ai stack and asserts §7:
editor shows file + diagnostics + gutter; graph colored by verdict with the unused node
flagged + OUTLINE rings; brushing both ways by shared id (headless bus-level proof +
browser-level spot check); AI outlet answers "what's unused" naming the real node id;
system history() shows one Node.id byte-identical at EVERY hop including editor selection;
the typst ceiling input renders unknown, never green (§7 c/h — the story lean graduated
from); the lean input's kernel green travels every hop byte-identically (§7 i) and the
doctored green fails at every wall (§7 j). Writes acceptance/ACCEPTANCE-REPORT.md.

### HEADLESS-UI addendum (remediation worklist item 5 — additive)
The browser-level check runs WITHOUT a person, BY DEFAULT, with ZERO pixel
screenshots: step 3 drives a real Chromium (`--headless=new` over CDP, zero installs)
through `acceptance/headless/headless_ui.mjs`, asserting the full on-screen path via
DOM/a11y reads + the §7.8 spike surfaces (`window.pgGraphWall` / `pgEditorWall` /
`pgShellLog` pins): the file OPENS with verdict markers (`shell.file.open` source
hub-fs, a11y tab strip, `editor.verdict.gutter.paint` glyphs — origin `assumed` =
amber DEBT, an attested green at the browser's tier-G stub floor is BLOCKED
`green-may-never-be-faked` and downgraded, never painted green: the CT gutter green
stays §7(i)'s headless proof); the graph renders nodes COLORED BY VERDICT
(`dump().paints` incl. the kernel greens `#2E7D32`, ids present in the DOM
byte-identically); BRUSHING carries the SAME byte-identical id across BOTH walls'
pins in BOTH directions (a real graph-node click AND a real CDP Monaco caret click,
UTF-8 bytes re-verified runner-side); the unknown-tier ceiling renders unknown,
never green (paints, gutter, ghost placeholders, AI honest no-claim).  Every server
is EPHEMERAL (vite included — 5199 is never squatted or reused); each page's hub
workspace is a TEMP FIXTURE COPY (real fixtures asserted byte-identical
before/after).  `--skip-ui` (deprecated alias `--skip-browser`) is for emergencies
and produces a LOGGED SKIP, never a pass; `browser_shot.mjs` (pixel screenshots)
is a MANUAL tool only, outside the gate.  Evidence:
`acceptance/evidence/ui-{moat,lean,ceiling}.json` + `ui-spec-*.json`.
