# REPORT — P3-acceptance: the §7 runner (the organism breathes)

Date: 2026-07-20 · Assembly: `A:\30lean-push\proofgraph` · Agent: P3-acceptance
Cells modified: **NONE** (packages/* byte-untouched; hub/ai/app existing sources untouched —
only NEW assembly files were added). npm/pip installs: **ZERO**.

## The one command

```
python acceptance/run_demo.py                # everything, incl. the real-browser step
python acceptance/run_demo.py --skip-browser # headless §7 gate only
python acceptance/run_demo.py --suites       # + live re-run of hub/outerwall/app/ai suites
```

End state, run on this machine: **9 PASS / 0 FAIL / 0 SKIP, exit 0** (55 s warm
without `--suites`; 111 s with — hub, outerwall, app incl. the vite-build secret
gate, and ai suites all OK live). Any FAIL exits nonzero with evidence; a
browser skip is a LOGGED SKIP, never a pass.

## What was laid (all NEW files; nothing existing modified except the seam catalog)

| Piece | Path | Role |
| --- | --- | --- |
| The runner | `acceptance/run_demo.py` | one command: analyze both fixtures -> 8 named §7 checks + browser step -> `ACCEPTANCE-REPORT.md`; stdout UTF-8-forced; all child trees torn down (taskkill /T) |
| Headless walls suite | `app/test-acceptance/acceptance.headless.test.tsx` + `app/vitest.acceptance.config.ts` | V5 joined bus + REAL editor wall + REAL graph-view wall mounted on the REAL analyses (refuses if analyses missing — `acceptance-evidence-missing`); writes `acceptance/evidence/headless.json` |
| AI check | `acceptance/headless/ai_check.mjs` | boots `ai/server.ts` (`createAiServer`, FAKE transport, port 0) against the runner's live hub; POST /ask; evidence JSON |
| Squiggle check | `acceptance/headless/squiggle_check.mjs` | V2's exact path (spawns `vessels/v2_hub_runner.py`, WS transport verbatim incl. the declared initialize enrichment) against a TEMP moat variant |
| Browser driver | `acceptance/headless/browser_shot.mjs` | zero-dep CDP over Node's built-in WebSocket driving Edge/Chrome `--headless=new`; screenshots + facts harvested from the §7.8 spike surfaces (`window.pgGraphWall` / `window.pgEditorWall` pins) in the LIVE page |
| Artifacts | `acceptance/analysis-moat.json` · `analysis-lean.json` (canonical bytes == hub GET /analysis) · `TRACE-full.json` · `ACCEPTANCE-REPORT.md` · `evidence/{headless,checks}.json` · `browser/*.png` (4) | the run's evidence trail |

## §7, checked (every check named, PASS/FAIL, evidence persisted in `evidence/checks.json`)

| § | check | proof (pins × pins, never a return value alone) |
|---|---|---|
| a | `a-unused` | unused == exactly `n_94602d86cdf431c2` (moatpkg.helpers.unused_fn, DECL node kind=function); reachable == {main, side_calc, used_fn} ids; wall's rustworkx×networkx crosscheck agrees; roots declared `['moatpkg.core']` -> module-name-expanded (V3 translation, pinned) |
| b | `b-outline-rings` | every moat node outline FILLED `{status:"unknown", worstOf:["none"]}` (honest — no verdict compiler; ruling-8 non-empty tokens from the frozen 7-token vocab); face==pins (verdicts == node rows); two-library closure agreement pinned; **`packages/schema/validate.py` green on the ON-DISK `analysis-moat.json` graph, loaded independently of the outer wall's loader** |
| c | `c-lean-honest` | lean: statuses == {unknown} in nodes AND verdicts (green count literally 0); 0 resolved edges, 1 lead (`resolved:false`, dashed class); incompleteBases covers every lead source; `roots-undeclared` taken as the answer — `[]` + marker, nothing inferred |
| d | `d-brushing` | headless bus-level round-trip: V5 `createJoinedBus` VERBATIM + real `createEditorWall` (cell 4's own stubs, tier-G floor) + real `createGraphViewWall`, BOTH mounted on the REAL moat analysis. Editor caret in side_calc -> `editor.select.emit.bus` × `link.select.in` carry `n_998d574447100ad9` byte-equal; graph `clickNode(main)` -> `link.select.out`/`link.bus.emit` × T4 `busLog` × `editor.select.recv.reveal` (`highlightApplied:true`) carry `n_6e177dcaaec5588a` byte-equal. Independent JSON parses + UTF-8 byte arrays re-verified python-side. Exact bounded counts (editorLog 2 = [editor, graph], graphEmitted 1, dropped 0) — no echo storm |
| e | `e-ai` | through the V6 outlet on the LIVE hub (FAKE transport goldens — cell 6's own testkit): "what is unused?" -> answer names the REAL `n_94602d86cdf431c2`, labelled `[FAKE-transport ...]`; `listUnused` executed against the hub-served graph (`outlet.tool.exec` pins -> toolCalls; tool output carries the id); graphFacts 6 nodes/2 roots |
| f | `f-system-trace` | `n_6e177dcaaec5588a` (moatpkg.core.main) byte-identical at EVERY hop: `extractor.t1.node.id` (preimage pin) -> model-wall ingest pin surface (`idInRootIds:true`) -> analyze() canonical bytes (offset+sha256) -> hub GET `/graph` (offsets [361,1106], slices re-verified byte-wise) + GET `/analysis` (10 offsets) -> graph-view `ingest.node` pin -> editor `busLog` + `recv.reveal` (headless via the V5 bus). Assembled into **`acceptance/TRACE-full.json`** (extends the V4 mechanism; the V4 seed `n_ccb26550281c06b8` remains owned/verified by `outerwall/test_outerwall.py::Test02Rich`) |
| g | `g-squiggle` | V2's path reused: cell 2's REAL battery (`v2_hub_runner.py`, measured CT, face==pin guard) -> pyright child -> hub WS bridge -> real editor wall opening a TEMP COPY of moatpkg with `result = "str" + 1` appended (fixture sha256 before==after, asserted in BOTH node and python). Diagnostic lands at bytes [235,244) == `indexOf` of the injected expression exactly; real message `Operator "+" not supported...`; severity error; uri+version guards `apply`; initialize enrichment fired exactly once; `capability.wall.shutdown terminated:true`, runner exit 0 |
| h | `h-unknown-honesty` | lean unknown through EVERY layer: analyze() (all unknown) -> hub-served canonical bytes (GET /analysis BYTE-EQUAL to `canonical_json(analyze(...))`; typed 503 `no-analysis-computed` exercised before attach; zero green in served verdicts) -> view `dump().paints` in jsdom (V4 harness pattern: hatched grey fills, unknown rings, `outlineWasNull:false`, `render.edge.leadGuard` fired once per lead, 0 resolved edges, ghost placeholder for the unresolved target painted unknown) -> AI outlet honest NO-CLAIM over `roots-undeclared` ("makes no reachability claim", no node id fabricated) |
| 3 | `browser-spot-check` | REAL msedge (`--headless=new`, CDP over Node's built-in WebSocket, zero installs) on the full stack hub 8477 + ai 8478 + vite 5199: **moat page** — real Monaco on core.py (status line honest `tier: G · transport: stub-tier-G`), 6 hatched-grey nodes with unknown rings (paints read from `window.pgGraphWall` pins IN the browser), `analysis: applied (6 verdicts)`, AI panel names the unused id with the listUnused tool payload rendered; **lean page** — 4 nodes + the ghost unresolved-target placeholder all unknown, ONE dashed `unresolved` lead, editor honestly `nodes indexed: 0`, AI honest no-claim. Screenshots: `acceptance/browser/{moat-overview,moat-ai,lean-overview,lean-ai}.png`. **Bonus browser-level brushing evidence**: CDP click on the main node -> `window.pgEditorWall` busLog carries `{type:"node.select", origin:"graph", nodeId:n_6e177dcaaec5588a}` byte-identical + Monaco reveal lines 6-7 `def main`, `highlightApplied:true` — in the live browser (the §7(d) gate itself is the headless proof) |

## Bounds hit (logged, never silent — full list in ACCEPTANCE-REPORT.md)

1. `package-root-uri-mismatch` staging (moat root staged, sha256 pinned, byteIdentical).
2. Cell-2 pin streams snapshotted pre-shutdown (V1 bound 4).
3. FAKE transport labels itself; ids in the answer are REAL hub data.
4. `measured-child-respawn` + one-shot initialize enrichment (V2 bounds), re-hit by (g).
5. Temp-variant staging — the moat fixture NEVER mutated (sha256 before==after, two independent witnesses).
6. span-file remap (EditorPane's declared bound) reused verbatim in the headless suite + squiggle check; ids and byte spans untouched.
7. Stub floor tier G wherever no measured stream is aggregated (headless + browser editor); (g) is the measured-tier path.
8. Ghost placeholder census: the view renders +1 node per distinct unresolved lead target (the cell's own honest behavior, painted unknown never green) — encoded in both the headless and browser expectations.
9. vite v5 binds `::1`-only on this box (Node >=17 localhost); the runner's port probe checks both loopback families, and vite is spawned as a plain `node node_modules/vite/bin/vite.js` child (npm.cmd/cmd.exe indirection failed silently to start on Windows — root cause of the only two red iterations during bring-up).

## Failure classes (seam catalog extended in ARCHITECTURE-PHASE2.md, rebased not reverted)

NEW: `acceptance-evidence-missing` (headless suite refuses absent analyses — never mints its own),
`browser-tooling-missing` (no Chromium -> typed exit 3 -> LOGGED skip, never a pass).
EXERCISED live this run: `no-analysis-computed` (typed 503 before attach, twice), `roots-undeclared`
(lean, through wall -> hub -> AI), `unknown-language` (lean's recorded cell-2 refusal + local-stub
fallback provenance). Build-failing classes stay owned by their suites (re-run green under `--suites`).

## Suites (end state — measured live by `--suites` this run)

hub **36/36 OK** · outerwall **30/30 OK** · app **28 passed + 1 todo** (v4.serve 8, v5.bus 9,
p3.face 10+1todo, build gate 1) · ai **14/14 OK**. Cells untouched (recorded 113/124/103/96/133/103;
schema 23py+14ts) — cited in ACCEPTANCE-REPORT.md with sources, not re-measured.

## Blocked / deviations

- No cell change was needed or made. No installs. No existing hub/app/ai source edits.
- The app's `test.todo` ("live hub GET /analysis -> paints end-to-end") is now DISCHARGED by this
  runner (§7 b/h view checks + browser step render a COMPUTED, hub-served analysis); the todo marker
  itself lives in the component suite and was deliberately left as-is (assembly discipline: the
  acceptance runner owns the live assertion, the component suite keeps mocking the contract).
- "Unused node flagged" in the browser surfaces through the AI panel + gapAnalysis payload (the
  graph pane paints verdicts only — no dedicated unused badge exists in the app; noted honestly,
  not styled around).