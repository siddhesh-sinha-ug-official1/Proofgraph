# ASSEMBLY-CHANGES — structure-extractor (cell 3)

Phase 0 schema swap: this cell stops carrying its own inline schema
transcription and becomes **verified-in-sync** with the canonical package at
`packages/schema/` (single source of truth). Baseline before swap: 68/68
(`python selftest/run_all.py`, live-pyright oracle included).

**Swap pattern chosen: (b) verified-in-sync, for every artifact.** The cell
must stay independently runnable from its own folder (Operating Contract 6)
and its modules are imported as the `extractor` package with no path
dependency on a sibling package at runtime — so the cell keeps local mirrors
(`extractor/schema.py`, `extractor/capability.py`) and a **membrane test**
(`selftest/test_schema_sync.py`) asserts value-equality with
`packages/schema/*` + `gen/*`, byte-agreement of the mint against
`vectors.json`, and a `check_pin` assertion against the pinned identity
(schemaVersion `v0`, schemaHash
`3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c`).
Any drift explodes loudly instead of forking the schema. No file in
`packages/schema/` was modified.

## Files touched (why / which ruling or seam)

| File | Why | Ruling/seam |
|------|-----|-------------|
| `extractor/schema.py` | Replaced the local `n:`/`e:` 24-hex JSON-preimage mint (hashing normalized span TEXT) with the **canonical mint**: `n_`/`e_` + first 16 hex of sha256 over `\x1f`-joined domain-tagged preimage; node preimage = `("node:v0", lang, kind, canonicalName, file, path)` where `path` is the STRUCTURAL locator (`mod::name`), so ids are content-INsensitive to body edits. Added `canonical_name_for`/`structural_path_for`/`compute_node_identity` mirroring `packages/schema/ids.py`. Placeholder became `"unresolved:" + rawRefName` (raw, never hashed). `SchemaEdge.validate` now REQUIRES the placeholder prefix on unresolved dstIds (closes the cell's own triage gap). Enum tuples + `OUTLINE_WORST_ORDER`/`WORST_TOKEN_TO_STATUS`/`BANNED_WORST_TOKENS` mirror `gen/schema_constants.py`. Carries `PINNED_SCHEMA_VERSION`/`PINNED_SCHEMA_HASH`. | Rulings 5, 6, 4, 1; pin |
| `extractor/capability.py` | `TIER_MAX_GRADES` deleted (reconcile-verified dead). Added `DEPTH_TIERS` + `DEPTH_ALLOWS_RESOLVED_EDGES = {CT:True, S:False, G:False, P:False}` mirroring `gen/capability_constants.py`; `allows_resolution()` is now CT-only (S lost resolution rights). | Ruling 2 |
| `extractor/assemble.py` | Tier-inflation guard now keys off `cap.allows_resolution()` (the seam owner's table) instead of a hardcoded `(CT, S)` allowlist — resolution forbidden at S/G/P. | Ruling 2 |
| `extractor/docks/python_dock.py` | `allow_grimp` is CT-only (grimp resolution counted as resolved edges; at S every candidate is now a lead). | Ruling 2 |
| `extractor/docks/base.py` | Leads mint the raw-name placeholder via one-arg `unresolved_placeholder(dstName)`. | Ruling 6 |
| `extractor/t1/extract.py` | Nodes minted via `compute_node_identity` (structural locator, not span text); `RawNode` gained `module` (container/scope feeding the preimage); dedup message reworded (structural identity, not content-addressed); **`provenance.resolved` flipped False → True** — it means "extractor successfully bound this element's identity", true for every well-formed structural node T1 emits; the `extractor.provenance.node.stamp` probe payload stamps `resolved: True`. | Rulings 5, 7 |
| `extractor/pipeline.py` | Persisted/returned shape is the canonical Graph envelope `{schemaVersion:"v0", nodes, edges, leads}` — `resolved:false` rows moved OUT of `edges[]` into `leads[]`, in both `dump()` and the written `graph.json`. | Ruling 3 |
| `extractor/probe/catalog.py` | One catalog DESCRIPTION reworded: the provenance-stamp probe's text now states ruling 7's definition of `resolved`. **No entry removed** — catalog count 131 before, 131 after (a membrane never deletes a pin). | Ruling 7 |
| `selftest/test_schema_sync.py` | **NEW membrane test** (13 tests): check_pin vs `packages/schema/PIN` + recomputed `schema.json` hash; enum/worst-order/placeholder-prefix value-sync vs `gen/schema_constants.py`; mint byte-agreement vs `ids.py` on all 8 `vectors.json` golden vectors + fresh inputs; emitted ids match the idScheme regexes; placeholder-required-on-leads validation; `DEPTH_ALLOWS_RESOLVED_EDGES` sync vs `gen/capability_constants.py` + CT-only assertion + `TIER_MAX_GRADES` absence; envelope separates `edges[]`/`leads[]` with `schemaVersion:"v0"`. | All adopted rulings |
| `selftest/test_t1.py` | Old span-text tests updated: `test_whitespace_reformat_keeps_ids` → `test_reformat_and_body_edits_keep_ids` (body edits now KEEP the id — semantic change, ruling 5); `test_normalization_function` (span-text normalization/content-sensitivity) replaced by `test_structural_identity_function` (identity is a pure function of lang/kind/module/rawName/file — semantic change, ruling 5). Preimage probe asserts `file`+`path` visible. | Ruling 5 |
| `selftest/test_connectors.py` | Determinism test uses canonical `n_`/`e_` 16-hex forms + new mint signature; placeholder asserted to be the raw-name form verbatim. | Rulings 5, 6 |
| `selftest/test_honest_ceiling.py` | Two NEW tests: an all-S capability run must produce zero resolved edges (tier-cap reasons probed), and a forged resolved edge at S raises `TierInflationError` at the assemble guard. S-tier resolution rights removed — semantic change, ruling 2. | Ruling 2 |
| `selftest/test_provenance.py` | Now asserts `provenance.resolved is True` on every T1 node — semantic change, ruling 7 (was stamped False under the old local reading). | Ruling 7 |
| `fixtures/golden/*.edges.json`, `rich.snapshot` | **Regenerated via `selftest/tools/gen_goldens.py`** (never hand-edited); regeneration re-run and verified byte-stable. Diff review vs the original cell: edge counts preserved (7/2/11/1/4), kind/src/resolved sets identical, snapshot byte-identical — the golden edge view is name-keyed, so the id-format change is invisible here and the placeholder column already displayed raw names. `fixtures/pyright/richpkg.recorded.json` untouched (sha256-verified identical to origin — LSP traffic is keyed by file/position, not by our ids; no re-record needed). | Rulings 5, 6 |
| `extractor/docks/pyright_backend.py` | **Baseline sync, not swap**: ported the post-review Windows tree-kill (`taskkill /PID <pid> /T /F` + wait) in `close()` from the origin cell's final DONE state — the assembly copy was taken 2026-07-20 00:08 while the cell was still building; the origin closed at 10:03 with this fix (orphaned `cmd /c npx` subprocess trees, five orphaned node processes observed). | env hardening (origin parity) |
| `selftest/test_t1.py` (same file as above) | **Baseline sync, not swap**: ported `_copytree_writable()` (clears Windows ReadOnly attribute on temp fixture copies; an external sweeper on this machine marks trees ReadOnly and `shutil.copytree` preserves attributes) from the origin's final DONE state. | env hardening (origin parity) |
| `ASSEMBLY-CHANGES.md` | This record. | assembly rule |

## Pins

- Probe catalog: **131 → 131** (no entry removed; one description updated per ruling 7).
- Golden fixtures: regenerated, counts/names preserved; pyright recording byte-identical.
- `packages/schema/` untouched (read-only to this cell).

## Semantic changes (ruling-forced, each named in the test comment)

1. Ruling 5 — node ids are content-INsensitive: a body edit keeps the id
   (`test_reformat_and_body_edits_keep_ids` inverted the old
   `assertNotEqual`); span-text normalization tests replaced by structural
   identity tests.
2. Ruling 2 — S-tier lost resolution rights: `allows_resolution()` CT-only,
   grimp resolution CT-only, assemble guard raises on resolved-at-S;
   `TIER_MAX_GRADES` (dead) deleted.
3. Ruling 6 — placeholder is `"unresolved:" + rawRefName` (was
   `"unresolved:" + hash(name, kind)`); `SchemaEdge.validate` now REQUIRES the
   prefix on unresolved dstIds (new constraint, previously unchecked).
4. Ruling 7 — `provenance.resolved` on T1 nodes flipped False → True
   (`test_provenance` asserts True; catalog description updated).
5. Ruling 3 — persisted/dumped envelope split `edges[]` (resolved only) from
   `leads[]` (unresolved only) and gained `schemaVersion:"v0"`.

## Suite

Final: `python selftest/run_all.py` (FULL, live-pyright oracle included) —
see transcript; fast iterations via `--fast`.

Note on provenance of this record: the swap edits were applied by a swap
session that died on a usage limit before writing this file and running the
final full suite; this record reconstructs the change set from a full diff
against the read-only origin (`A:\23lean-push\structure-extractor`) and
completes the remaining work (goldens re-verified generator-authentic,
origin-parity fixes ported, full suite run).

---

# Phase 1 — the WALL (structure-extractor-wall/1.0.0)

The cell's minimal, clean, versioned, typed face (WALL-CONVENTIONS.md +
SEAM-MAP.md), promoted OVER the diagnostic pins, never replacing them.
Baseline before wall: 85/85 full suite.

## Files touched (all additive)

| File | Why |
|------|-----|
| `wall.py` (NEW, package root) | The face: `ExtractorWall` / `extract_wall` / `WALL_VERSION = "structure-extractor-wall/1.0.0"`. `extract(root, capability_fn=None, out_dir=None, config=None)` returns the canonical envelope `{schemaVersion:"v0", nodes, edges, leads}` + per-dock `honestCeilings` — `t3`/`summary` deliberately do NOT cross the face (they stay pins; Phase-3 gap analysis runs over the whole organism). `honestCeiling(lang)` serves the dock's declared ceiling VERBATIM from the pin surface, an explicit `{declared: False, tier: None}` surface for known-but-undeclared langs, and a typed `unknown-language` refusal (capability-wall vocabulary: no CT/S/G/P tier is fabricated) otherwise. `pins` exposes the quartet `{probeCatalog(), dump(), history(), tap()}` delegating to the cell — one wall = one cell = one probe stream. The wall asserts the schema PIN at construction AND before every extract (cell mirror vs canonical `packages/schema/PIN` vs recomputed `schema.json` hash — three-way agreement or `schema-pin-mismatch` refusal). Face guard `validate_envelope` raises named classes `lead-in-edges` / `id-mismatch`; `FAILURE_CLASSES` maps all six named classes (incl. the cell's `tier-inflation` / `faked-edge`, which propagate through the wall unwrapped). `capability_fn` is the formalized V1 socket; the known friction (`CapabilityHandle.handle` never consumed by `_make_dock`) is documented in MEMBRANE-SPEC.md as Phase-2 vessel work, NOT fixed here. |
| `extractor/probe/catalog.py` | Six NEW `extractor.wall.*` catalog entries (§6.14): `version`, `pin.check`, `extract.call`, `extract.return`, `honest_ceiling.request`, `refusal` — this bus hard-rejects uncataloged emits, so the catalog was extended, not bypassed. **131 → 137; no entry removed or reworded.** Plain (wall-less) `ExtractorCell` runs never fire them (asserted in tests). |
| `MEMBRANE-SPEC.md` (NEW) | The one-page membrane contract: face signatures, V1 socket + known friction, what stays a pin, honest-ceiling surface, failure classes, versioning, conformance contract. |
| `selftest/test_wall_conformance.py` (NEW, 18 tests) | **Conformance = pins vs face.** Envelope equals the assemble-stage pins (`extractor.assemble.edge.normalize` deduped, `extractor.assemble.graph.emit` counts, `dump()` split) for the shipped python dock AND a stub dock; zero resolved edges from any non-CT tier through the wall (all-S run ⇒ `edges == []`; a forged resolved edge at S raises `TierInflationError` THROUGH `extract()`, violation probe visible via pins); every lead dstId carries the `unresolved:` prefix; edge-id recompute matches the canonical mint (`packages/schema/ids.py`, imported flat); honest ceilings cross the face byte-identical to the `honest_ceiling.report` pin; unknown-language typed refusal + undeclared surface; pin drift refuses at birth AND at a later extract; face determinism (two walls ⇒ identical envelopes + identical `history(strip_wall=True)`); catalog census 131 pre-wall entries preserved + exactly the 6 wall leads; quartet reachable and `tap` live through the wall. |

## Pins

- Probe catalog: **131 → 137** (6 wall leads added; nothing removed).
- No existing export deleted or renamed; no existing test changed.
- `packages/schema/` untouched (read by the wall's pin assertion only).

## Suite

Final: `python selftest/run_all.py` (FULL, live-pyright oracle included) —
**103/103 OK** (85 baseline + 18 wall-conformance).

---

# Remediation round — package-root-uri-mismatch: the recorded change request, APPLIED

The bound recorded at Phase 3 close (master-assembly.md [PHASE 3 CLOSED] +
vessels/REPORT-OUTERWALL-PY.md + the ARCHITECTURE-PHASE2.md seam catalog):
cell 3 detects a python package's PARENT as the pyright/grimp project root
(`_detect_project_root`: topmost `__init__.py` dir's parent) but the LSP
backend minted didOpen/definition URIs by joining the dock's INGEST-root-
relative rel paths onto that project root. When the source root IS the bare
package dir (ingest root ≠ project root), every wire uri pointed at
`<parent>/core.py` — an unopened non-file — so live definition lookups
honestly returned `[]` and calls degraded to leads. The outer wall worked
around it by copy-staging such roots under a scratch parent (sha256-pinned);
the CELL fix was recorded as a candidate change request, NOT applied. This
round applies it.

Provenance note (the resumed-agent pattern, again): the code edits + the new
test were applied by a remediation-round agent that died on a usage limit
before writing this record; the resuming agent audited the disk state against
the round brief, verified the fix live, and completed the records + sweeps.

## Files touched (why)

| File | Why |
|------|-----|
| `extractor/docks/pyright_backend.py` | **The fix.** `LspPyrightBackend` now takes `files: list[(rel, abspath)]` (the dock's vocabulary ↔ absolute paths) and builds EVERY wire uri from the didOpen'd ABSOLUTE path under the detected project root — never by joining rel onto `project_root`. Responses map BACK into the dock's rel vocabulary via a normcase reverse table (absorbs pyright's drive-letter lowercasing, the V1 root-cause find). Unknown rel keys keep the legacy project-root join as a last resort (never a crash). `RecordingWrapper` takes the same `files` for its sha table. Node ids / `span.file` do NOT change for a given ingest root — only LSP wire paths. |
| `extractor/pipeline.py` | `_make_dock` builds the `files` table from `ss.files` (`f.path` = ingest-root-relative key, `f.abspath` didOpen target); files OUTSIDE the detected project root are dropped LOUDLY via the `extractor.cap.applied` probe (capName `python.pyright.file-outside-project-root`), never silently. Recorded-mode sha keys stay `f.path` — when ingest root == project root the keys are byte-identical to the old form, so `fixtures/pyright/richpkg.recorded.json` stays valid (sha-verified, no re-record). |
| `selftest/test_live_pyright_oracle.py` | **NEW test** `test_bare_package_dir_resolves_live` — extracts `fixtures/pyrich/richpkg` (the BARE package dir) with pyright LIVE: asserts the mismatch case really is exercised (project root detected as the package PARENT while ingest root is the package dir), `span.file` stays ingest-root-relative (no `richpkg/` prefix — ids minted from the structural locator, only wire paths changed), pyright-RESOLVED calls edges exist (the bug's signature — they degraded to leads before the fix), and the name-keyed relation set equals the parent-root recorded run 1:1. |
| `ASSEMBLY-CHANGES.md` | This record. |

## Pins

- Probe catalog: **137 → 137** (no new probeId; the outside-project-root drop
  rides the existing `extractor.cap.applied` lead).
- `fixtures/pyright/richpkg.recorded.json` untouched and still replay-valid
  (rel keys unchanged for parent-root extraction, per-file shas re-verified).
- No export renamed; `LspPyrightBackend.__init__` gained the `files`
  parameter (constructor is cell-internal — sole caller is `_make_dock`).

## Suite

`python selftest/run_all.py` (FULL, live-pyright oracle included) —
**104/104 OK** (103 baseline + the new bare-dir oracle test).

Downstream (assembly layers, same round): outer wall retired its bare-dir
copy-staging (outerwall/analyze.py; `outerwall.root.staged` probe stays,
payload mode "direct"), outerwall suite 31/31, hub 44 (1 pre-existing
symlink-privilege subtest skip), V1 10/10, V3 16/16, acceptance
run_demo.py --skip-browser 8 PASS/0 FAIL/1 SKIP + run_shell_demo.py 11/11
(parent-root moat ids byte-identical to the assembly-era records — the fix
is a wire-path no-op when ingest root == project root).

---

# Remediation round - Lean driver spike (driver spike, dock wiring pending)

NEW dir `extractor/docks/lean_driver/` only; nothing else in the cell
modified this round. Reason: feasibility spike proving the Lean
extraction/verdict driver standalone BEFORE any dock wiring (next round's
task). Contents: `Driver.lean` (kernel/environment-level metaprogram, ONE
JSON doc on stdout: toolchain/decls/imports/errors/limits), `lean-toolchain`
pin **leanprover/lean4:v4.31.0** (explicit + stable), `fixtures/` (3 scratch
cases), `run_smoke.py` (one-command re-verify; SMOKE PASS 31/31 assertions
incl. the read-only acceptance/fixtures/unused_hyp.lean), `README.md`.
Dock registry untouched - this dir is not referenced by any cell code path;
goldens/tests of the cell untouched. Full report for the wiring agent:
`proofgraph/vessels/REPORT-LEAN-DRIVER-SPIKE.md`.
Cell suite re-run after touch: see report (full run_all.py).

---

# Remediation round — LEAN-DOCK: the CT kernel-driver path wired (worklist items 1+2)

The G-tier tree-sitter placeholder LeanDock gained the REAL Lean path using
the round-1 PROVEN driver (`extractor/docks/lean_driver/`, spike report
`proofgraph/vessels/REPORT-LEAN-DRIVER-SPIKE.md`). Genuine kernel-verified
greens now exist in the envelope; the tier-G placeholder behavior is
byte-stable under a pinned G. Every hunk `[ASSEMBLY CHANGE LEAN-DOCK]`.

## Files touched (why)

| File | Why |
|------|-----|
| `extractor/docks/lean_dock.py` | **The wiring.** `extract()` dispatches on the REPORTED tier: CT → `_extract_ct` (new), anything else → `_extract_g` (the placeholder, preserved verbatim — tier semantics stay measured; no self-upgrade). CT path per file: subprocess `lean --run Driver.lean <abs>` with cwd = `lean_driver/` (adjacent `lean-toolchain` pins v4.31.0), Popen + timeout + Windows tree-kill (`taskkill /T /F`, the cell's pyright-backend precedent — the elan shim spawns a child lean). decls[].refs → RESOLVED `proof_uses` filtered to the ingested decl node set (reason `R_LEAN_DRIVER`, resolver `lean-kernel`; out-of-set constants = probed `X_CORE` rejections, never silent); imports[] → module import edges when the target module is ingested (`R_LEAN_IMPORT`; implicit `Init` = probed `X_CORE`; T1 anchors not among elaborated imports = `U_IMPORT_UNRESOLVED` leads). Verdicts (pure fn `lean_verdict`, testable without the driver): green = kernelAccepted ∧ ¬usesSorry ∧ unexpectedAxioms=[] in an error-free file → fill `{status:green, source:"lean-kernel:v<ver>:kernelAccepted decl=<n> run=<sha16>"}` + origin `checked`; usesSorry → amber (source NAMES sorryAx); error-severity diagnostic in a decl's span → red (also when the decl is ABSENT from decls[]); file-level errors outside every decl span → the module node carries red; everything unjudged stays unknown — NEVER green from absence, and a file with elaboration errors blocks green conservatively (stricter than the spike candidate formula, declared in the ceiling). unusedHypotheses → per-decl probe + summary probe + `extra.unusedHypothesesSummary` on the ceiling (Node schema is CLOSED — no new fields). Driver limits[] ride `extra.driverLimits` VERBATIM (single-file bound included; multi-file lake stays declared-not-implemented). Toolchain-pin divergence v4.31.0 (driver) vs v4.32.0 (cell-2 lean_repo) probed + declared on the ceiling every CT run — NOT unified. Driver-dead = typed `DriverDead` (driver-timeout \| driver-crash \| driver-bad-json): probed, file's decls stay unknown, its anchors become `U_BACKEND_*` leads, no partial green. |
| `extractor/capability.py` | Local stub gains lean → CT (`lean-kernel-driver-subprocess`), mirroring python's "honestly reachable HERE"; the REAL negotiated tier still arrives from cell 2 through the V1 feed at analyze() time. |
| `extractor/schema.py` | Green is now MINTABLE but only kernel-backed: `GREEN_ATTESTED_PREFIXES = ("lean-kernel:",)` + `green_fill_attested()`; `SchemaNode.validate` green branch now raises `unbacked-green` (was: unconditional "tree3 cannot produce green"). |
| `extractor/assemble.py` | **New guard** `UnbackedGreenError` (failure class `unbacked-green`): every green audited (`extractor.assemble.green.audit`) — origin `checked` + registered attestation + CT tier or probed violation (`extractor.green.enforcement.violation`) + raise. |
| `extractor/docks/reasons.py` | Marked additions `R_LEAN_DRIVER` / `R_LEAN_IMPORT` (the driver is kernel/environment-level, NOT InfoTree — naming stays honest). |
| `extractor/probe/catalog.py` | **137 → 148, additive only**: 9 CT-driver leads (`driver.invoke`, `driver.timing`, `backend.leanDriver.req/.resp`, `verdict`, `unusedHyp`, `unusedHyp.summary`, `driver.dead`, `toolchain.divergence`) + 2 assemble green-guard leads (`assemble.green.audit`, `green.enforcement.violation`). Nothing removed or reworded. |
| `extractor/pipeline.py` | `PipelineConfig` + `lean_driver_timeout_s` / `lean_driver_exe` (None → dock defaults); `_make_dock` threads them (the driver-dead test seam). |
| `wall.py` | `FAILURE_CLASSES` + `unbacked-green` → `UnbackedGreenError` (raised by the cell's assemble guard, propagates through extract() unwrapped, like tier-inflation/faked-edge). |
| `fixtures/lean_ct/Verified.lean` (NEW) | The CT fixture: clean chain (green + resolved edge), sorry theorem (amber), unused-hypothesis theorem (`[h2]` flagged). Single file, Init-only, driver-verified before wiring. |
| `fixtures/golden/lean_ct.edges.json` (NEW) | The CT golden: exactly the kernel-resolved `proof_uses Verified.uses_base → Verified.base_fact`. |
| `fixtures/golden/lean.edges.json` | **Regenerated BYTE-IDENTICAL** under a pinned G (diffed against the pre-round bytes — the tier-G regression gate). All other goldens regenerated unchanged; the pyright recording untouched. |
| `selftest/harness.py` | `force_tier_g` helper (G-path tests now PIN the tier they test — the stub default is CT); `lean_ct` in the snapshot fixture-root list. |
| `selftest/test_lean_ct_dock.py` (NEW, 26 tests) | CT path live (green attestation, amber-never-green, resolved edge + decision, probed rejections, unusedHyp payload+summary, driver limits verbatim, invocation+latency probes, pin divergence, verdict probes, CT determinism), the PURE verdict mapping (kernelAccepted-false never green, absence never green, …), the unbacked-green guard (schema + assemble + tier level, attested green passes), driver-dead (timeout tree-killed/typed/green-free, crash typed, G-run never touches the driver). LOUD skip without a lean binary. |
| `selftest/test_connectors.py`, `test_honest_ceiling.py`, `test_golden.py`, `test_probe_bus.py`, `test_wall_conformance.py` | G-path assertions pin tier G explicitly (reasons in-file); capability-wire asserts lean → CT; golden test adds the CT golden; census 131 → 142 pre-wall; failure-class registry + `unbacked-green`. No test deleted. |
| `selftest/tools/gen_goldens.py` | lean G-golden generated under pinned G; `lean_ct.edges.json` added. |

## Bounds declared (never smoothed)

- Toolchain pin divergence v4.31.0 (driver, 2 measured quirks) vs v4.32.0
  (cell-2 lean_repo): probed + on the ceiling; unification = report-round work.
- Single-file driver; multi-file lake projects declared-not-implemented
  (limits[] rides verbatim); a multi-file tree = sequential invocations.
- ~3s warm / ~76s cold per invocation — probed per-invocation
  (`extractor.t2.lean.driver.timing`).
- No per-ref/per-binder source positions (InfoTree-free): proof_uses use-site
  span = the decl span, said so on every candidate.
- Green blocked conservatively for ANY file with elaboration errors (stricter
  than the spike candidate formula — a poisoned environment attests nothing).

## Suite

`python selftest/run_all.py` (FULL, live pyright + live lean driver) —
**131/131 OK** (104 baseline + 27). Downstream, same round: V3 16/16;
V1 **11/11** (lean re-pinned as MEASURED CT across the seam, c2 proves
verdict-arrival WITHOUT false green on the unelaboratable Mathlib fixture;
the refusal → recorded-stub-fallback mechanism preserved verbatim on latex,
which cell 2 still refuses). Outerwall **27/31, NOT touched**: the 4 failures
are all Test03LeanHonestCeiling and are exactly the legitimate
verdict-arrival change (kernel-resolved edge exists / greens exist / zero
leads so incompleteBases empty / capability measuredBy=capability-layer CT)
— recorded in vessels/REPORT-LEANDOCK.md; the outer-wall green-flow round
owns those expectations. The arriving greens PASSED graph-model's wall
greenGuard (origin=checked + attested source) — no fake-green refusal fired.

---

## [ASSEMBLY CHANGE REAL-INPUTS] Remediation round, worklist item 3b — decl-matching disambiguation (measured on real toolchain source)

**Round ref**: agentic-convos/remediation-round.md (REAL-INPUTS stream
entry — the full record); frozen facts in outerwall/test_real_inputs.py.

**What surfaced (measured, never asserted)**: running analyze() on a REAL
previously-unseen input — the v4.31.0 toolchain's own `Init/Classical.lean`,
vendored to acceptance/fixtures/real_lean/ — hit a raw-name collision the
demo fixtures never exercised: `choose`/`choose_spec` declared INSIDE
`namespace Classical` AND top-level `Exists.choose`/`Exists.choose_spec`
share last name components. The pre-round matcher keyed BOTH sides by the
raw last component alone (`name.rsplit('.', 1)[-1]`), so the last writer
silently won:

- node `Classical.choose` carried `fill.source … decl=Exists.choose` — a
  kernel attestation naming a DIFFERENT declaration (measured verbatim);
- proof_uses edges crossed nodes: `Classical.em`'s kernel ref
  `Classical.choose` resolved to the `Exists.choose` node, and the real
  `Exists.choose → Classical.choose` dependency self-rejected (X_SELF).

**The fix (this cell owns the layer)**:

| File | Change |
|---|---|
| `extractor/docks/lean_dock.py` | NEW pure fn `match_decls(file_nodes, drv_names, stem)`: per-file driver-decl → node assignment by the WRITTEN identifier (node.name minus `<stem>.`) — exact match beats dotted-suffix match, longest suffix wins, and any residual tie on EITHER side attests NOTHING (typed decision — a wrong attestation is worse than none). `_extract_ct` uses it at all three former raw-lookup sites (verdicts, proof_uses src, ref→dst map); every assignment AND refusal probed as `extractor.t2.lean.decl.match`. Unique-raw files (every pre-round fixture) match exactly as before — discrimination is only ADDED where the old key collided. |
| `extractor/probe/catalog.py` | **148 → 149, additive only**: `extractor.t2.lean.decl.match` (decision). |
| `fixtures/lean_collision/Collide.lean` (NEW) | The distilled collision: `Collide.mark` + `Collide.uses_mark` (in-namespace) + top-level `Extra.mark`; `uses_mark := mark` is the real kernel dep. Driver-verified before the test. |
| `selftest/test_lean_ct_dock.py` (26 → 35 tests) | `TestDeclMatching` (pure, always runs): collision disambiguated (exact beats suffix), unique names match as before, auxiliaries unowned, duplicate-identifier tie attests nothing, contended node attests nothing, outranked claim typed. `TestCollisionRegressionLive`: the fixture through the REAL pipeline at CT — every attestation names the node's OWN decl, the edge lands on the namespace decl (crossed edge = regressed bug), match decisions probed. |
| `selftest/test_wall_conformance.py` | Pre-wall census 142 → 143 (additive growth documented in-file). |

**Declared, not fixed (out of scope, stated in-code)**: ref→dst resolution
is keyed by resolved constant name across the whole ingest set — two FILES
each declaring the SAME full name remain a latent ambiguity of the
single-namespace ingest model.

**Suite**: `python selftest/run_all.py` (FULL, live pyright + live lean
driver) — **140/140 OK** (131 baseline + 9 new). Goldens untouched and
green (`lean.edges.json` tier-G byte-stable; `lean_ct.edges.json`
unchanged — unique-raw fixtures match identically). Downstream sweep in the
round transcript.

---

# 2026-08-02 — SUB200 restructure (adversarial-round prep; behavior-preserving)

Every non-exempt source file in the cell brought UNDER 200 lines by cohesion
splits with FACADE modules — the original module paths remain and re-export
their full public surface, so external importers (vessels, hub, outerwall,
tests) need ZERO changes.  No semantic change, no rename of any public
surface, no assertion touched; comments/docstrings kept with the code they
describe.

## Old file → new modules (lines)

| Old file (lines) | New modules (lines) |
|---|---|
| `extractor/docks/lean_dock.py` (796) | facade `lean_dock.py` (121, dock registry name stable) + `lean_common.py` (56: constants, `_default_lean_exe`, `_pos_to_byte`, `DriverDead`, `run_ref`) + `lean_ct_driver.py` (89: driver invocation + stdout parsing) + `lean_verdicts.py` (133: `lean_verdict`, `match_decls`) + `lean_ct_fill.py` (94: per-file verdict application) + `lean_ct_edges.py` (194: proof_uses / imports / dead-file leads) + `lean_ct.py` (162: CT orchestrator) + `lean_g.py` (128: G-tier path) |
| `extractor/t1/extract.py` (451) | facade `extract.py` (146: dispatch + `extract_t1`) + `t1/common.py` (71: `Anchor`, `_RawNode`, helpers) + `t1/interpret_code.py` (133: python/go/c/cpp/lean) + `t1/interpret_docs.py` (138: latex/typst) |
| `extractor/docks/python_dock.py` (416) | facade `python_dock.py` (153: `PythonDock.extract` + delegates) + `python_grimp.py` (108) + `python_pyright_path.py` (174) + `python_ceiling.py` (57: constants + effective ceiling) |
| `wall.py` (356) | facade `wall.py` (186: `ExtractorWall`, face) + `extractor/wall_support.py` (150: failure classes, envelope guard, `WallPins`, config merge) + `extractor/wall_pin.py` (67: schema-PIN assertion).  Helpers live INSIDE the `extractor` package so vessel pathing's top-package shadowing guarantees cover them. |
| `extractor/docks/pyright_backend.py` (332) | facade `pyright_backend.py` (33) + `pyright_common.py` (85: protocol, typed failures, position/uri math) + `pyright_lsp.py` (187: live JSON-RPC client) + `pyright_recorded.py` (74: recorded/replaying pair) |
| `extractor/probe/catalog.py` (334) | aggregator `catalog.py` (27) + `catalog_stages.py` (80: §6.0–6.2) + `catalog_docks.py` (101: §6.3–6.5b) + `catalog_docs_graph.py` (115: §6.6–6.9) + `catalog_output_infra.py` (69: §6.10–6.14 + §7.8).  **Assembled CATALOG verified element-for-element identical (149 entries, same order, same tuples) against the pre-split module.** |
| `extractor/probe/bus.py` (210) | `bus.py` (136: `ProbeBus`, `StageTimer`; re-exports datatypes) + `probe/events.py` (96: `ProbeEvent`, `CatalogEntry`, kinds, errors, redaction) |
| `extractor/pipeline.py` (281) | facade `pipeline.py` (193: `ExtractorCell`; re-exports `PipelineConfig`/`HONEST_GAPS`) + `pipeline_config.py` (47) + `pipeline_docks.py` (73: `make_dock` — the docks mapping stays a call-time parameter so the `pipeline_mod.ALL_DOCKS` test seam keeps working) |
| `extractor/schema.py` (259) | facade `schema.py` (190: constants, green-attestation, `SchemaNode`/`SchemaEdge`; re-exports the mint) + `schema_ids.py` (85: the canonical mint) |
| `extractor/t3.py` (230) | `t3.py` (178: `compute_t3`) + `t3_checks.py` (90: NetworkX cross-check + DOT/JSON export) |
| `selftest/test_lean_ct_dock.py` (449) | `test_lean_ct_dock.py` (150: `TestLeanCtPath`) + `test_lean_ct_guards.py` (175: verdict mapping, unbacked-green, driver-dead) + `test_lean_decl_match.py` (139: matching + collision live) + shared `lean_ct_common.py` (28) |
| `selftest/test_wall_conformance.py` (346) | `test_wall_conformance.py` (172: envelope==pins + tier guard) + `test_wall_face.py` (168: ceiling face, version/PIN, envelope guard, pins quartet) + shared `wall_test_common.py` (31) |
| `selftest/test_schema_sync.py` (230) | `test_schema_sync.py` (135: pin/enum/mint sync) + `test_schema_rulings.py` (87: placeholder/capability/envelope rulings) + shared `schema_sync_common.py` (33) |

## Exemptions relied on

- `extractor/docks/lean_driver/Driver.lean` — proven artifact (splitting it
  would change the proven driver); untouched.
- `fixtures/**` (incl. `pyright/richpkg.recorded.json` recording,
  `golden/*`), `lean_driver/fixtures/*`, `lean-toolchain` — fixtures /
  recordings / goldens; untouched, byte-stable.

## Suite

`python selftest/run_all.py` (FULL: live pyright oracle + live lean CT
driver) — **140/140 OK** (same count as the pre-restructure baseline;
splits moved tests between files, none dropped, no assertion weakened).
Goldens untouched and green; CT/wall history-determinism tests green;
probe catalog identical (149 entries; pre-wall census still 143 + 6 wall);
`packages/schema` `schemagen.py --check` still exits 0 (8 artifacts in
sync); wall verified loading + extracting through `vessels/pathing.py`
with zero changes.

## 2026-08-16 — pre-GitHub PII scrub (remediation Wave A, cluster G3)

`fixtures/pyright/richpkg.recorded.json`: replaced the build-machine Windows
username with the neutral placeholder `user` in 12 stdlib response `file` paths
(`\Users\<username>\...` typeshed-fallback `builtins.pyi`/`ntpath.pyi`
definition targets). These are
OUT-OF-WORKSPACE definition locations that the resolver never maps to a graph
node, so `edge_view` is unchanged; the recording's v2 sha gate keys only on the
fixture-source `files` shas (untouched), so no `StaleRecordingError`. Verified:
`run_rich()` recorded-replay still yields 11 edges / 8 resolved; no assertion
weakened. Reason: a shipped fixture must not carry a real Windows username.

## 2026-08-16 — D-dedup remediation round (Cluster U — U3)

- **U3 · extractor/wall_pin.py** — the schema-PIN assertion's recompute step
  no longer hand-inlines the canonical JSON serialisation
  (`json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False)` +
  `hashlib.sha256`). It now delegates to
  `packages/schema/schema_tools.schema_hash` via file-read + exec (the same
  data-only pattern `selftest/schema_sync_common.py` uses), so this wall
  shares ONE spelling with the canonical package's serialisation contract
  instead of carrying a rival copy. The extractor import boundary
  (`extractor/boundary.py`) is untouched — the canonical package is still
  consumed AS DATA, never imported. Added `_exec_canonical` +
  `_canonical_schema_hash` helpers; dropped `import hashlib` from the
  module. File went 67 → 112 lines, well under the 200-line linegate.

Suite: `python selftest/run_all.py` — 140 passed (~68s); the membrane test
`selftest/test_schema_sync.py` continues to assert canonical-mint /
schema-hash / PIN byte agreement on the golden vectors and fresh inputs,
so drift on either side still explodes loudly.

- 2026-08-16 (Wave D pre-GitHub, cluster L+E · finding E3):
  `extractor/docks/base.py` — `innermost_owner` / `node_at` no longer
  linear-scan every node in the envelope per anchor.  Added a per-file
  sorted span index (`_span_index_for(nodes)`) memoized on `id(nodes)`;
  the lookup does `bisect_right` on `(byteStart, ...)` then walks left,
  skipping entries whose span ends at/before the query offset — turns
  each call from O(anchors × total-nodes) into
  O(anchors × log nodes-in-file + spans-touching-offset).  All 4 call
  sites (this file's `node_at`, `docks/latex_dock.py:75`,
  `docks/python_pyright_path.py:48+155`, `docks/typst_dock.py:76`) are
  unchanged — same signature, same result.  base.py 147 → 181 lines,
  well under the 200-line linegate.  Suite `python selftest/run_all.py`
  — 140 passed (~66s, ~3s faster; goldens unchanged, purely
  performance).
