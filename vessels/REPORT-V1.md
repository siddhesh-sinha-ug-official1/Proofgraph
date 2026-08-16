# REPORT — Vessel V1: capability wall → structure-extractor wall

Laid 2026-07-20 · assembly code only (`proofgraph/vessels/`), walls-not-cytoplasm.
Files: `vessels/v1_capability_extractor.py` (the vessel), `vessels/test_v1.py`
(the connector test, 10 tests), plus ONE labelled cell change request against
cell 2 (recorded in `packages/capability-layer/ASSEMBLY-CHANGES.md`, Phase-2
section). Cell 3 was NOT modified.

## What was laid

`V1CapabilityFeed` — a `capability_fn` factory over cell 2's
`capability_wall(lang)` in cell 3's expected `CapabilityHandle{lang, tier,
handle_kind, handle}` shape, injected through the extractor wall's formalized
V1 socket (`extract(root, capability_fn=...)`). Walls are reached through
`vessels/pathing.py` (the sanctioned loader; no bare `import wall`).

Per language:
- **known to cell 2** → the wall's MEASURED tier crosses the seam byte-equal,
  provenance `measuredBy: capability-layer` stamped into the handleKind that
  cell 3 pins on `extractor.ingest.capability.response`; the vessel re-reads
  cell 2's `capability.probe.measuredTier` pin and refuses
  (`silent-tier-upgrade`) if face and pin ever disagree.
- **refused by cell 2, known to the extractor** (lean/latex/go/...) → the
  extractor's local stub is used ONLY as an explicitly RECORDED fallback:
  refusal pin events (tap-captured), stub tier, and `measuredBy: local-stub`
  land in `feed.provenance` and in the response pin's handleKind. A stub
  answer without a record is the named class `unrecorded-stub-fallback`
  (structurally unreachable: the record is written before the handle exists).
- **unknown to both** → cell 2's typed `WallRefusalNotice` is converted into
  cell 3's own typed `UnknownLanguageError`. No fabricated tier anywhere.

## Cell-2 change request (labelled, its suite green: 118 → 124)

Real `python` profile so cell 2's OWN P0–P11 battery measures python live
against `cmd /c npx --yes -p pyright pyright-langserver --stdio` (the mandated
spawn form). Full record + file table in the cell's ASSEMBLY-CHANGES.md.
Highlights: python profile + discovery fixture (pyright candidate, MIT;
`reusesCompiler: true` recorded with its rationale — CPython has no
type-checking frontend, pyright IS the type authority; a paper claim the
battery then tests), `testbed/python_repo/` fixture, spine hardening
(languageId per profile; server→client requests answered — pyright blocks on
`workspace/configuration`; drive-letter case canonicalized in `path_to_uri` —
pyright lowercases `A:` → `a:`, which made P1/P2 diagnostic waits unmatchable;
colon-unquoted rootUri + workspaceFolders; `_tree_kill` closing the
orphaned-subprocess-tree leak), additive probe-shape generalizations
(Location[], CompletionList, documentChanges, per-profile scratch-file ext,
version-filtered P2 waits). Fixture-language probe streams unchanged
(reproducibility gate 13 still green).

## MEASURED tier (no asserted tiers — the ruling's question answered)

**CT, earned live.** P2 injected the battery's generic fallback
`result = "str" + 1` — a real python type error — and pyright returned
`Operator "+" not supported for types "Literal['str']" and "Literal[1]"`
(severity 1, anchored at the injected line). paperTier CT == measured CT.
Battery: P0 pass · P1 pass (0 diags) · **P2 pass** · P3 skip (no `let`) ·
P4 warn (cross-file `helper` resolved; dependency-callee probe did not earn
the second hit) · P5 pass (refs span 2 files) · **P6 fail — the ybg-flavored
probe's measured consequence, documented**: pyright populates completion
`detail` lazily via completionItem/resolve, which the battery does not send,
so "no typed members returned"; the on-demand inventory still carries the
real items (`parse` among them). Non-gating (only P2 gates). · P7 pass
(rename edits 2 files) · P8 skip · P9 pass · P10/P11 pass (restart
re-derives; restartFast=false). CT was hoped, CT was measured — because the
diagnostics path is real, not because anything was asserted.

## Handle strategy (recorded decision)

Cell 3's python dock builds its OWN pyright backend from `PipelineConfig`
(`pyright_mode="live"`); `CapabilityHandle.handle` (cell 2's live handle,
passed through unwrapped) is NOT consumed — the documented V1 friction.
**Decision: keep the duplication and LOG it** rather than bridge cell 2's
handle into cell 3's backend socket, which would require touching
`_make_dock` (cytoplasm). Consequence: during a python extract two live
pyright subprocess trees exist (cell 2's measured child, owned by the vessel
until `shutdown()`; cell 3's backend, closed by the pipeline). Logged as the
`duplicated-subprocess` bound on every python feed; test_a4 proves both sides
really ran (cell 3's `extractor.backend.pyright.resp` pins, mode `live-lsp`).

## Connector test — pins × pins (test_v1.py, 10/10 OK)

| Path | cell-2 pin | cell-3 pin | proven |
|---|---|---|---|
| python (live, fixtures/pyrich) | `capability.probe.measuredTier` = CT; `capability.wall.construct` | `extractor.ingest.capability.response` tier | byte-equal tier strings; provenance (`capability-layer:` + `MEASURED tier`) in the pin payload |
| python resolution | (CT measurement above) | `extractor.assemble.graph.emit`, envelope | resolved edges EXIST and == emit pin count; guard pin `extractor.tier.enforcement.violation` SILENT |
| reduced double (labelled "S" fn) | n/a (simulated reduced measurement — reduces, never upgrades) | `extractor.cap.applied` capName `python.pyright.tier-gate` actual `"S"`; graph.emit resolvedEdges 0 | zero resolved edges at S through the REAL dock; leads survive; guard silent because the dock obeyed (guard FIRING on a forged resolved-at-S edge is proven in cell 3's own conformance suite) |
| awk (measured NON-CT) | `capability.probe.measuredTier` = G | `extractor.ingest.file` (seen) with NO `lang.detected`, NO capability response; empty envelope; `extractor.wall.refusal` unknown-language from `honestCeiling("awk")` | a language the extractor cannot ingest gets no tier injected at all; honest emptiness both sides |
| lean (refusal → recorded stub) | `capability.wall.refusal` lead (tap-captured; lang=lean, unknown-language) | response pin tier G with `local-stub FALLBACK` + failure class IN the handleKind; nodes>0, edges==[], resolvedEdges 0, guard silent | reduced stays reduced through both membranes; fallback recorded, never silent |
| klingon (unknown to both) | refusal lead | `extractor.wall.refusal` unknown-language | typed refusals both walls; provenance tier None — no fabricated tier anywhere |
| lifecycle | `capability.wall.shutdown` payloads `terminated:true` | n/a (cell 3's backend closed by its pipeline) | wrapper proc dead (`poll() != None`); node.exe sweep vs pre-run baseline empty (20s window) |

## Bounds logged (no silent caps)

1. **duplicated-subprocess** — see Handle strategy above (feed.bounds + here).
2. **no-grammar-floor** — cell 2's stub tree-sitter runtime has no `.py`
   grammar: python has NO G fallback this round; if pyright dies mid-run the
   fallback tier is P. Verbatim in the discovery grammar lead; gated by
   cell-2 test_16 test_e.
3. **P6/inventory reduced detail** — measured consequence, documented above.
4. Cell 2's `dump()/history()` remain module-global last-run state: the
   vessel snapshots each run's pins AT CONSTRUCTION (measuredTier/construct
   payloads into `feed.provenance`) so later runs cannot rot the evidence.

## Failure classes (seam catalog extended in ARCHITECTURE-PHASE2.md)

- `silent-tier-upgrade` — enforced live by the vessel (face-vs-pin byte check).
- `unknown-language` — exercised through BOTH walls.
- `tier-inflation` — guard pin asserted silent/inapplicable as appropriate;
  firing path owned by cell 3's conformance suite.
- **NEW** `orphaned-subprocess-tree` — closed in cell 2's spine (`_tree_kill`),
  swept by test_z / gate-16.
- **NEW** `unrecorded-stub-fallback` — structurally unreachable by
  construction; record-before-handle proven on the lean path.

## Suites (all green, end state)

- Vessel: `python proofgraph/vessels/test_v1.py` → **10/10 OK** (~12s warm).
- Cell 2: `python -m pytest capability/tests -q` → **124 passed**
  (118 baseline + 6 gate-16).
- Cell 3: `python selftest/run_all.py` (FULL, live oracle) → **103/103 OK**
  (unmodified; re-run after the vessel landed).
