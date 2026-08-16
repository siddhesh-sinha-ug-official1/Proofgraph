# ASSEMBLY-CHANGES — capability-layer (Phase 0 schema swap)

Cell: `packages/capability-layer` · Canonical source of truth: `packages/schema`
(read-only to this cell). Baseline suite: 84/84 via `python -m pytest capability/tests -q`.

## Swap pattern chosen: (b) verified-in-sync (per file, least invasive)

`capability/schema.py` keeps its local constants so the cell stays independently
runnable and the import-boundary gate's ALLOWED lists stay honest and unchanged.
A new test gate asserts extracted-constant equality with the canonical generated
files and checks the schema PIN, so drift on either side explodes loudly in this
cell's own suite. "One schema" holds because divergence is loud, not because the
bytes live in one place.

Canonical sources are loaded in the test by **file-read + exec** (never module
import, never sys.path edits), so no entry was added to `importgate.py`'s
ALLOWED_STDLIB / ALLOWED_THIRD_PARTY / internal-root lists — the canonical
package is consumed as data. For `schema_tools.py` (whose flat-import fallback
is `from ids import sha256_hex`), the test registers a minimal `sys.modules["ids"]`
shim carrying the exec'd canonical `sha256_hex`, then removes it — recorded here
as deliberate runtime plumbing, not a hidden import.

Pattern (a) direct import was rejected because it would require either widening
the import gate (gate churn for a constants-only dependency) or sys.path
manipulation inside package code (breaks independent runnability if the sibling
package is absent at import time).

## Files touched

| File | Change | Ruling / seam served |
| --- | --- | --- |
| `capability/tests/test_13_schema_sync.py` | **NEW** Gate 13: (1) canonical package presence check; (2) `DEPTH_TIERS`, `DEPTH_ALLOWS_RESOLVED_EDGES`, `DEPTH_TO_MAX_PROVENANCE`, `HONEST_CEILINGS` equal `packages/schema/gen/capability_constants.py`, plus a literal assertion of the resolved-edges table; (3) `worst_case_order()` equals canonical `OUTLINE_WORST_ORDER` from `gen/schema_constants.py`, split 7-token, red at index 0, fused `"none/green"` banned; (4) PIN file matches schemaVersion `v0` / schemaHash `3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c`, canonical `check_pin` passes against the actual `schema.json` hash, and negative cases prove the pin gate is live. | Rulings 2 and 4; schema PIN; "green may never be faked" (negative pin checks keep the gate non-vacuous). |
| `capability/schema.py` | Docstring/comment updates ONLY (no value or behavior change): header now records the verified-in-sync seam with `packages/schema` and the pin, and `worst_case_order()`'s docstring names ruling 4. Constants are byte-identical to before the swap and to the canonical tables. | Labels the adapter; ruling 2 note (this cell's `DEPTH_ALLOWS_RESOLVED_EDGES` table is now canon). |
| `ASSEMBLY-CHANGES.md` | This record. | Assembly rule: labelled-adapter record. |

## Pins / catalog

- Probe catalog: **88 before → 88 after** (no entries removed; the sync gate is
  test-time only and fires no runtime probe leads, so no new catalog entries
  were warranted).
- Import gate: ALLOWED lists unchanged; whole-package scan still clean.

## Semantic changes

None. No test assertion was weakened or retargeted; the cell's local constants
already matched the canonical tables (this cell's resolved-edges table was the
one adopted as canon by ruling 2), so the swap only adds enforcement.

## Suite result

`python -m pytest capability/tests -q` → **95 passed** (84 baseline + 11 new
Gate 13 tests), Windows / Python 3.12.

---

# Phase 1 — the WALL (capability-layer-wall/1.0.0)

Carved the cell's minimal, clean, versioned, typed face per WALL-CONVENTIONS.md
and SEAM-MAP.md (V1 extractor / V2 editor consume this face). Promoted OVER the
pins — nothing deleted, nothing renamed, no cross-cell imports, no vessels.

## Files

| File | Change |
| --- | --- |
| `wall.py` | **NEW** at package root. Exports `WALL_VERSION="capability-layer-wall/1.0.0"`, `capability_wall(lang, repo=None, config=None)`, `CapabilityWall`, `WallRefusal`, `WallRefusalNotice`, `WallPins`. Face: `{known, lang, tier, paperTier, honestCeiling, provenance, probeReport (summary: per-probe verdicts + greenAllowed, raw evidence stays a pin), handle (UNWRAPPED live Handle), shutdown(), pins, wallVersion, schemaPin}`. Asserts the schema PIN at every construction by consuming `packages/schema` **as data** (file-read + exec of `ids.py`/`schema_tools.py` + `PIN` + `schema.json` — same pattern as Gate 13; importgate ALLOWED lists untouched; wall.py sits outside the gate's scan root but keeps the same discipline anyway). `shutdown()` closes the cell's known leak: terminates the live LSP child left running inside the Handle (idempotent; emits `capability.wall.shutdown`). |
| `MEMBRANE-SPEC.md` | **NEW** one-page membrane spec: face signatures, pin surface, honest-ceiling propagation (incl. the organism-level statement: unknown-tier language surfaces UNKNOWN at the wall — `known=False, tier=None`, honestCeiling `"no profile — tier unknown"`), failure classes, concurrency bound, versioning + conformance contract. |
| `capability/tests/test_15_wall_conformance.py` | **NEW** Gate 15 (23 tests): pins-vs-face on a CT run and the zigish fake-green run (wall tier == `capability.probe.measuredTier` pin; paperTier == scorecard pin; `greenAllowed` == `capability.probe.faked` pin == `green_allowed(tier,p2)`; per-probe summary verdicts == probe pins; `dump()["capability"]` == face; ruling-2 `provenance.resolved`), schema-pin negative gates (wrong hash / wrong version ⇒ `schema-pin-mismatch`, proving the gate is live), typed unknown-language refusal (tap-observed lead, cell pins untouched, no crash, tier=None), `concurrent-run-unsupported` refusal, live-handle passthrough (hover + floor parse), and the **no-leaked-process check**: after `wall.shutdown()` the LSP child's `proc.poll()` is not None. Wall loaded by file-read + exec (importgate lists honest and unchanged). |

## Wall decisions recorded

- **Failure classes:** `schema-pin-mismatch` (raised), `unknown-language`
  (RETURNED as typed `WallRefusalNotice` — never a crash, never a fabricated
  tier), `concurrent-run-unsupported` (raised). The cell's
  `HonestCeilingViolation` (tier-inflation) passes through unwrapped.
- **Concurrency bound (my call):** non-blocking module lock `_RUN_LOCK`;
  a concurrent wall-mediated run is REFUSED with `concurrent-run-unsupported`
  (not queued) — deterministic, and keeps pins-vs-face reads honest given the
  cell's module-global `dump()`/`history()`. Direct `capability()` callers
  bypass the wall/lock (documented).
- **Wall leads:** catalog EXTENDED **88 → 91** (additive; this bus hard-rejects
  uncatalogued emits): `capability.wall.construct` (value, on the run's own
  bus), `capability.wall.refusal` (branch, on a private bus so no other run's
  history is polluted; tap-observable), `capability.wall.shutdown` (state, on
  the wall's own run bus).
- `probeReport` on the face is a SUMMARY (ids/ran/verdicts + enforcement
  results); full evidence stays a pin via `pins.dump()['battery']` /
  `pins.history()`.

## Pins / additive audit

- No export deleted/renamed; `capability/` sources untouched except the new
  test file. Probe catalog 88 → 91 (grew, never shrank). Import gate ALLOWED
  lists unchanged; whole-package scan still clean (gate 01 green).

## Suite result

`python -m pytest capability/tests -q` → **118 passed** (95 Phase-0 baseline
+ 23 new Gate 15 wall-conformance tests), Windows / Python 3.12.

---

# Phase 2 — V1 CELL CHANGE REQUEST: real `python` profile (measured live against pyright)

Labelled change request from vessel V1 (capability wall → extractor wall).
The V1 ruling (ARCHITECTURE-PHASE2.md): teach cell 2 a real `python` profile so
its OWN P0–P11 battery MEASURES python live — the extractor's stub tier is
replaced by cell 2's REAL measurement, never by an assertion.  Baseline before
this change: 118/118 (`python -m pytest capability/tests -q`).

## Files touched (all additive; every hunk marked `[ASSEMBLY CHANGE V1]`)

| File | Change |
| --- | --- |
| `capability/fixtures.py` | `PROFILES["python"]` (fileExt `.py`, compilerCLI None, typing `static` = "a real static checker exists" — pyright; additive keys `languageId`, `probeRepo`) + `DISCOVERY["python"]` (pyright candidate, MIT, microsoft-stewarded, reusesCompiler=True with the recorded rationale: CPython has no type-checking frontend — pyright IS the type authority; the claim is paper, the battery measures it). Grammar entry states verbatim that tree-sitter-python is NOT wired into the stub floor (logged bound). |
| `capability/capability.py` | python branch in `_default_config`: `server_argv = cmd /c npx --yes -p pyright pyright-langserver --stdio` (mandated form; non-Windows falls back to plain npx), `work_dir` defaults INTO `testbed/python_repo` so P6/inventory scratch docs resolve `import lib` (nothing is written there — python has no compiler shim). `repo_map` honored via new optional profile key `probeRepo`. `wire()` now receives `language_id` from the profile. |
| `capability/spine.py` | (1) `LspClient(language_id=...)` — didOpen languageId is per-profile; default keeps the historical `yaddabinggiberish` bytes. (2) server→client REQUESTS are now answered on the wire (`workspace/configuration` → `[{}]*len(items)`, anything else → `null`): pyright blocks analysis on them; the shim never sends one, so the fixture-language streams are unchanged. (3) `path_to_uri` lowercases the drive letter — **the bug this change found**: pyright canonicalizes `A:` → `a:` in every uri it publishes, so an uppercase-drive client can never string-match its own document (P1/P2 diagnostics waits timed out). The shim echoes the client's uri form, so ybg behavior is unchanged. (4) `initialize` also sends colon-unquoted `rootUri` + `workspaceFolders` (the exact form cell 3's proven backend uses; `%3A` roots put pyright in "no source files" mode). (5) `_tree_kill`: `kill()`/`restart()`/hung-`shutdown()` now taskkill the WHOLE process tree on Windows — killing only the `cmd /c npx` wrapper orphans the node child (failure class **orphaned-subprocess-tree**; the same leak cell 3 closed in its backend). |
| `capability/probe.py` | Additive shape-generalizations so the battery can MEASURE real servers: P2 diagnostics wait accepts only version-None/2 publishes (pyright stamps versions; the shim sends none — unchanged); P4 accepts `Location | Location[] | LocationLink[]`; P6 scratch doc uses the profile's fileExt + unwraps `CompletionList`; P7 counts `documentChanges` when `changes` is absent. Verdict semantics untouched. |
| `capability/libinventory.py` | Same fileExt + CompletionList generalization for the stage-H scratch doc. |
| `testbed/python_repo/` (NEW) | `main.py` / `util.py` / `lib.py` — the python probe repo. The bare `helper(...)` call is the cross-file target (P4/P5/P7/P9); `lib.parse(...)` the dependency target; no `let` line so P2 falls through to its generic injection `result = "str" + 1`, which IS a real python type error. |
| `capability/tests/test_16_python_profile.py` (NEW, 6 tests) | One shared LIVE run via the wall. Asserts: real pyright spawn on the wire + P0 pass; face tier == `capability.probe.measuredTier` pin byte-equal, pinned to the MEASURED result **CT** together with its proof (P2 pass = new severity-1 pyright diagnostic at the injected line — the tier can never drift from its evidence); greenAllowed == `green_allowed(tier,p2)`; ruling-2 `provenance.resolved ⇔ CT`; P6 measured consequence documented (honest FAIL — pyright fills `detail` lazily via completionItem/resolve, which the battery does not send; on-demand inventory still carries the real items incl. `parse`); P3/P8 skips; the no-grammar-floor bound visible in the discovery lead; shutdown kills the whole npx tree (wall shutdown pin `terminated:true`, cmd wrapper dead, zero orphaned node.exe vs. the pre-run sweep). LOUD skip if npx is missing. |

## MEASURED RESULT (no asserted tiers)

The battery measured **CT** for python on this machine — earned, not hoped:
P2 injected `result = "str" + 1` and pyright returned `Operator "+" not
supported for types "Literal['str']" and "Literal[1]"` (severity 1, anchored
at the injected line).  paperTier CT (the pyright discovery claim) == measured
CT — the paper did not lie this time.  Battery detail: P0 pass · P1 pass (0
diagnostics) · P2 pass · P3 skip · P4 **warn** (cross-file `helper` resolved;
the dependency-callee probe did not earn the second hit) · P5 pass (refs span
2 files) · P6 **fail** (documented above — ybg-flavored probe; measured
consequence, not a silent cap) · P7 pass (rename edits 2 files) · P8 skip ·
P9 pass · P10 pass · P11 pass (re-derived state, restartFast=false).

## Bounds logged (rule: no silent caps)

- python has **no grammar floor** this round (stub runtime has no `.py`
  grammar): if pyright dies, the fallback tier is P, not G.  Stated verbatim
  in the discovery grammar lead + gated by test_e.
- P6/inventory reduced detail (above) — measured, documented, non-gating.

## Pins / additive audit

- Probe catalog: **91 → 91** (no new leads needed; every python event rides
  existing catalogued leads).
- No existing test changed; no export renamed; fixture-language probe streams
  byte-stable (gate 13 reproducibility still green).
- Import gate untouched (no new imports beyond stdlib `re` already allowed).

## Suite result

`python -m pytest capability/tests -q` → **124 passed** (118 baseline + 6
Gate 16), Windows / Python 3.12, live pyright 1.1.411 via npx.

---

# Remediation round — CELL CHANGE REQUEST: real `lean` profile (CAP-LEAN, measured live against the Lean 4 toolchain server)

Labelled change request from the remediation round (agentic-convos/
remediation-round.md, cell-2 task: "measure Lean — the capability side of
G→CT"), mirroring the V1 python precedent above: teach cell 2 a real `lean`
profile so its OWN P0–P11 battery MEASURES lean live — never an asserted
tier.  Baseline before this change: 124/124 (`python -m pytest
capability/tests -q`).

## Server wiring decision (investigated, not assumed)

Both entries were driven headless over LSP stdio on this machine before any
cell code was written:

- **`lake +leanprover/lean4:v4.32.0 --dir=<repo> serve` is the wired form**
  (direct spawn, no cmd wrapper — lake.exe is a real exe, unlike npx).
  Measured: cwd-independent (`--dir` carries the workspace), initialize
  round-trip 0.2 s, and the toolchain PIN rides the argv via the elan shim's
  `+<toolchain>` prefix.  The pin matters: elan's default 'stable' DRIFTS —
  observed live v4.32.0 at master-assembly time → **v4.32.2 auto-installed
  nine days later** on first unpinned invocation.  **Toolchain used and
  pinned: `leanprover/lean4:v4.32.0` (Lean 4.32.0, x86_64-w64-windows-gnu,
  commit 8c9756b2; Lake 5.0.0)** — in `LEAN_TOOLCHAIN`
  (capability/capability.py), the spawn/prepare argv, and the fixture repo's
  `lean-toolchain` file.
- `lean --server` standalone would need hand-managed LEAN_PATH/LEAN_SRC_PATH
  for imports — rejected; lake serve derives them from the lakefile.
- **lake serve does NOT auto-build imports** (measured on an unbuilt
  workspace: main.lean's header fails with "unknown module prefix 'Util'"
  and the body is never elaborated).  Hence the PREPARE step below.
- Lean echoes the spine's exact uri form byte-for-byte (lowercase drive +
  %3A — the V1 pyright canonicalization already matches; no new uri work).
- `shutdown`/`exit` does NOT terminate the 4-deep chain (elan shim lake →
  real lake → lean watchdog → lean file workers) within 10 s; the V1
  `_tree_kill` taskkill path closes it — same orphaned-subprocess-tree
  class, verified again by gate 17's lean.exe/lake.exe sweep.

## Files touched (all additive; every hunk marked `[ASSEMBLY CHANGE CAP-LEAN]`)

| File | Change |
| --- | --- |
| `capability/fixtures.py` | `PROFILES["lean"]` (fileExt `.lean`, compilerCLI None — the server ships inside the toolchain, typing `static` — Lean's checker is the kernel; V1 keys `languageId:"lean4"`, `probeRepo:"lean_repo"`; NEW additive keys below) + `DISCOVERY["lean"]` (candidate lean4-language-server, Apache-2.0, leanprover-stewarded, reusesCompiler=True with the recorded rationale: the watchdog spawns `lean` file workers — the elaborator IS the server; the claim is paper, the battery measures it).  Grammar entry states verbatim that tree-sitter-lean is NOT wired into the stub floor (logged bound: no G fallback). |
| `capability/capability.py` | `LEAN_TOOLCHAIN` pin + `_lake_exe()` (PATH, falling back to this machine's recorded `A:\lean\elan\bin\lake.exe`); lean branch in `_default_config`: pinned `lake … serve` server_argv, `work_dir` INTO `testbed/lean_repo` (scratch docs resolve `import lib`; nothing written there), and `prepare_argv` = pinned `lake … build`.  NEW generic pre-wire PREPARE step in `capability()`: runs `cfg["prepare_argv"]` when set and emits the outcome as the NEW catalogued lead **`capability.wire.prepare`** — environment setup is measured state, never silent; a FAILED prepare does not abort (the battery then measures the degraded environment honestly). |
| `capability/probes.py` | Catalog EXTENDED **92 ← 91** (additive; this bus hard-rejects uncatalogued emits): `capability.wire.prepare` (call, `{argv,exitCode,stdoutTail,stderrTail}`). |
| `capability/spine.py` | NEW additive method `LspClient.wait_diagnostics_settled(uri, versions, grace, timeout, progress_method)`: lean publishes diagnostics PROGRESSIVELY per elaboration snapshot, and the measured orderings are inconsistent (didOpen: `[]`, `[]`, real set, then progress-done; didChange: progress-done FIRST, real set after) — "take the first matching publish" can read a not-yet-final answer.  The settled wait uses `$/lean/fileProgress` (empty `processing`) as an activity signal and returns the LAST matching publish after a quiet grace window.  Called ONLY by profiles declaring `settleDiagnostics` — fixture-language wire behavior is byte-identical (never called for them; gate 13 stays green). |
| `capability/probe.py` | Three additive per-profile generalizations, each measured before being added: (1) `p2Injection` — the appended P2 payload; lean's generic injection `result = "str" + 1` is a PARSE error (grammar-level — wrong evidence class for the compiler-truth litmus), while `example : Nat := "s"` elaborates and fails in the TYPE checker (severity 1, anchored at the injected line).  (2) `settleDiagnostics` — P1/P2/P2-restore waits go through the settled path above.  (3) `crossCallPattern`/`depCallPattern` — lean application is whitespace-sensitive (`f(x)` is a parse error on v4.32.0; `f (x)` is the call form), so the ybg-shaped `name(` scan patterns can NEVER match valid lean; the profile supplies `name (`-shaped patterns (group 1 = callee name).  Verdict semantics untouched; fixture languages keep every historical default byte-for-byte. |
| `testbed/lean_repo/` (NEW) | `main.lean` / `Util.lean` / `lib.lean` + `lakefile.toml` (defaultTargets Util+lib) + `lean-toolchain` (the same pin).  `printAnswer (…)` is the cross-file target (P4/P5/P7/P9), `lib.parse (…)` the dependency target, `lib.` the P6/inventory namespace; no `let`, no `#eval` — the clean file publishes ZERO diagnostics for P1.  Build artifacts `.lake/` + `lake-manifest.json` are regenerated by the prepare step (same regenerable class as `.testtmp`; excluded from any tree-hash claims). |
| `capability/tests/test_17_lean_profile.py` (NEW, 7 tests) | One shared LIVE run via the wall, mirroring gate 16: prepare lead ran with exit 0 + real `lake … serve` spawn with `--dir` (test_a); face tier == `capability.probe.measuredTier` pin byte-equal, pinned to the MEASURED result **CT** with greenAllowed == `green_allowed(tier,p2)` and ruling-2 `provenance.resolved ⇔ CT` (test_b); P2 evidence pinned — the profile injection present in the injected text, severity-1 diagnostic containing "Type mismatch" (elaborator evidence, not a parse error), p2.verdict pass (test_c); measured consequences pinned — P6 fail ("no typed members"), P3 skip, P4/P5/P7 pass via the profile call patterns, P8 pass via semanticTokens, P9 pass via call hierarchy, stage-H on-demand inventory EMPTY and documented (test_d); no-grammar-floor bound visible verbatim (test_e); toolchain pin present in BOTH prepare and spawn argv + positionEncoding utf-16 measured in the dump (test_f); shutdown kills the whole 4-deep tree — wall shutdown pin `terminated:true`, shim dead, zero orphaned lean.exe/lake.exe vs. the pre-run sweep (test_z).  LOUD skip if lake is missing. |

## MEASURED RESULT (no asserted tiers)

The battery measured **CT** for lean on this machine — earned, not hoped:
P2 appended `example : Nat := "s"` and the elaborator returned `Type
mismatch: "s" has type String but is expected to have type Nat` (severity 1,
anchored at the injected line).  paperTier CT (the reuses-the-compiler
discovery claim — for lean literally true: the elaborator IS the server) ==
measured CT.  Battery detail: P0 pass · P1 pass (0 diagnostics, settled) ·
P2 **pass** · P3 skip (no unannotated `let x = …` surface) · P4 **pass**
(BOTH hits: cross-file `printAnswer` → Util.lean AND dependency `lib.parse`
→ lib.lean — deeper than python's P4 warn) · P5 pass (refs span 2 files) ·
P6 **fail** (ybg-shaped scratch puts `lib.` at COMMAND position — not a term
context in lean; zero items; measured consequence, not a silent cap) · P7
pass (rename edits 2 files) · P8 **pass** (semanticTokens — advertised and
answered, unlike the python run's skip) · P9 **pass** (call hierarchy) · P10
pass · P11 pass (re-derived state, restartFast=false).  positionEncoding:
lean advertises none and speaks utf-16 — the spine's existing negotiated
default already matches (measured in the dump; no per-profile encoding
change was needed).

## Bounds logged (rule: no silent caps)

- lean has **no grammar floor** this round (stub runtime has no `.lean`
  grammar): if the server dies, the fallback tier is P, not G.  Stated
  verbatim in the discovery grammar lead + gated by test_e.
- **Unbuilt-workspace sensitivity**: the measured CT depends on the fixture
  libs being built; lake serve does not auto-build imports.  The prepare
  step closes this deterministically and its outcome is a catalogued lead;
  if it ever fails, the battery measures the degraded environment honestly
  (header errors → no P2 diagnostic → tier ≤ S, green forbidden).
- **Toolchain drift**: 'stable' moved v4.32.0 → v4.32.2 during this round;
  everything is pinned to v4.32.0 (argv + lean-toolchain).  A deliberate
  toolchain bump re-runs the battery and re-pins gate 17 against the new
  measurement.
- P6/stage-H inventory reduced to EMPTY for lean (command-position scratch
  doc) — measured, documented, non-gating.
- First-ever run on a machine without the pinned toolchain: elan downloads
  it inside the prepare step (budget: `prepare_timeout` 600 s, config-
  overridable) — the same cold-start class the master round hit.

## Pins / additive audit

- Probe catalog: **91 → 92** (additive only: `capability.wire.prepare`;
  nothing removed or renamed — probe APIs never shrink).
- No existing test changed; no export renamed; fixture-language probe
  streams byte-stable (gate 13 reproducibility still green — every new code
  path is keyed off profile keys the fixture languages do not carry).
- Import gate untouched (new imports `shutil`/`subprocess` in capability.py
  are already in ALLOWED_STDLIB; whole-package scan still clean, gate 01).

## Suite result

`python -m pytest capability/tests -q` → **131 passed** (124 baseline + 7
Gate 17), 36 s, Windows / Python 3.12, live Lean 4 Server 0.3.0 (toolchain
leanprover/lean4:v4.32.0) via elan-shimmed lake, live pyright via npx.
Zero lean.exe/lake.exe/node.exe orphans after the run.

---

# SUB200 restructure (adversarial-round prep)

Every source file in this cell now lands UNDER 200 lines. Splits are by
cohesion; BEHAVIOR-PRESERVING ONLY — no semantic change, no rename of any
public surface, no assertion weakened. Every original module path REMAINS as
a facade re-exporting its full public surface, so external importers (other
areas, tests, cells, hub) need ZERO changes.

## Old file → new modules

| Old (lines) | New modules (lines) |
| --- | --- |
| `capability/probe.py` (619) | facade `probe.py` (63, assembles `_Battery` + `run()`) → `probe_battery.py` (115: helpers + base: init/emit/_guarded/_encoding/measured_tier), `probe_p0_p2.py` (154: P0–P2 + injection helpers), `probe_p3_p5.py` (160: P3–P5 + position helpers), `probe_p6_p11.py` (178: P6–P11). Probe families are mixin classes; `_Battery` composes them — methods byte-moved, order preserved. |
| `capability/shim/ybg_lsp.py` (618) | entry `ybg_lsp.py` (104: docstring + main loop + full re-export; REMAINS the file `spine.shim_argv()` spawns by path — when standalone it puts the layer root on sys.path and imports the siblings package-qualified, root `capability` = the gate's allowed internal root) → `shim/ybg_state.py` (152: env config/STATE/framing/$-probe/paths/encoding math), `shim/ybg_ybc.py` (150: run_ybc/scratch/line_text/diagnostics), `shim/ybg_handlers.py` (163: caps/initialize/hover/definition/references), `shim/ybg_symbols.py` (110: rename/documentSymbol/completion). |
| `capability/spine.py` (530) | facade `spine.py` (54: assembles `LspClient` + `wire()`, re-exports wire surface) → `spine_wire.py` (97: exceptions/uri/framing/EXPECTED_METHODS/shim_argv), `spine_client.py` (119: ctor/spawn/reader threads/crash), `spine_msgs.py` (161: recv/consume/send/request/waits incl. settled-diagnostics), `spine_proto.py` (154: initialize/degrade/cache/didOpen/didChange/kill/restart/shutdown). |
| `capability/probes.py` (373) | facade `probes.py` (26) → `probes_bus.py` (149: bus/catalog/tap machinery), `probes_catalog_ae.py` (119: stage A–E registrations), `probes_catalog_fj.py` (105: stage F–J registrations). Aggregated catalog verified ELEMENT-FOR-ELEMENT identical (json-equal to the pre-split `probeCatalog()`, 89 entries; +3 wall leads = 92 when the wall loads). |
| `wall.py` (352) | facade `wall.py` (111: docstring, imports, PIN constants, `_RUN_LOCK`, `__all__`) + three section files exec'd INTO the wall namespace in original order: `wall_refusals.py` (74), `wall_pin.py` (80), `wall_face.py` (122). The exec-section shape keeps every wall loading mode byte-compatible (module import / `vessels/pathing.load_wall` importlib-by-file / the tests' file-read + exec) with ONE namespace and a fresh `_RUN_LOCK` per load, exactly as the single file behaved. |
| `capability/capability.py` (306) | facade `capability.py` (165: the A→J pipeline + re-exports) → `capability_config.py` (118: LEAN_TOOLCHAIN pin/_lake_exe/_default_config/_plan_shim), `capability_state.py` (45: Capability dataclass + _LAST + dump()/history() — same dict object re-exported, so the wall's `_cap_mod._LAST` access is unchanged). |
| `testbed/mock_ybc.py` (300) | entry `mock_ybc.py` (135: docstring/VERSION/HELP/main; REMAINS the file `config["ybc_argv"]` spawns — python puts its dir on sys.path[0], so the siblings import as plain modules) → `mock_ybc_lang.py` (101: regexes/DOC/io/literal typing/symbols/check), `mock_ybc_query.py` (85: repo walk/token_at/def/refs/argv parse). |
| `capability/fixtures.py` (294) | facade `fixtures.py` (36) → `fixtures_profiles.py` (100: INDEX_SOURCES + PROFILES), `fixtures_discovery.py` (170: DISCOVERY + ARCHIVED_SERVERS + license sets). Pure data move, element-for-element identical. |
| `capability/floor/treesitter.py` (291) | facade `treesitter.py` (117: FloorHandle/symbols_of/build + re-exports) → `floor/ts_runtime.py` (58: TSNode/Tree/_tok/_LineGrammar), `floor/ts_grammars.py` (132: Ybg/Awk grammars + StubTreeSitterRuntime). |
| `capability/tests/test_15_wall_conformance.py` (284) | `test_15_wall_conformance.py` (109: statics) + `test_15b_wall_runs.py` (184: CT + fake-green conformance classes) + shared `tests/wall_common.py` (28: the file-read + exec loader, ONE shared wall namespace as before). 23 tests before → 23 after. |
| `capability/tests/test_17_lean_profile.py` (265) | `test_17_lean_profile.py` (173: gates a–f) + `test_17b_lean_shutdown.py` (47: the z orphan-sweep gate, still last by discovery order) + shared `tests/lean_common.py` (62: one live lean run, PID baseline, LOUD lake skip). 7 tests before → 7 after. |

## Guarantees checked

- Import gate: ALLOWED lists byte-untouched; whole-package scan clean
  (gate 01 green). All new intra-package imports are relative or root
  `capability` (the declared internal root).
- Probe catalog: 89 registered entries json-identical to pre-split (order,
  ids, kinds, payloadTypes, descriptions); wall still extends to 92.
- Probe streams: gate 13 reproducibility green (fixture streams unchanged —
  no payload, order, or clock change; splits moved code, never edited it).
- Spawn entries preserved: `capability/shim/ybg_lsp.py` (by-path spawn via
  `shim_argv()`, verified standalone from a foreign cwd) and
  `testbed/mock_ybc.py` (by-path spawn via `ybc_argv`).
- Suite count: 131 collected before and after; no assertion changed.

## Semantic changes

None.

## Suite result

`python -m pytest capability/tests -q` → **131 passed** (post-restructure;
full run incl. live pyright + lean batteries), Windows / Python 3.12.

[ADVERSARIAL AUDIT NOTE 2026-08-03] The line counts in the table above were
exact at restructure time; later doc-only edits drifted three files slightly
(current `wc -l`: `shim/ybg_lsp.py` 105, `spine_wire.py` 99,
`floor/treesitter.py` 119). Current per-file counts live in
`proofgraph/audit/AUDIT-capability-layer.json`.

[WAVE-B ROUND 2026-08-16 — D1 pins instance isolation] `wall_face.py`:
`WallPins` was a static shim delegating `dump()/history()` to
`_cap_mod.dump/.history` (module-global LAST-RUN state).  Measuring a
second language silently overwrote every earlier `wall.pins.history()`
reader — outerwall's `snapshot_streams` iterated `feed._walls` and every
lang's snapshot came out as the SECOND-measured language's stream
(capability provenance misattributed at the diagnostic surface).  Fix:
`WallPins(bus, state)` binds to THIS run's own bus + captured state;
`CapabilityWall.__init__(cap, bus, state, schema_pin)` and
`capability_wall()` capture `_cap_mod._LAST["state"]` immediately after
`capability()` returns.  `probeCatalog/tap` stay module-global (both are
process-wide by design); the cell's module-global `_cap_mod.dump/.history`
remain untouched as the standalone-caller shim.  New gate
`tests/test_15c_pins_isolation.py` proves it: after standing up the CT
wall, `_cap_mod._LAST` is rebound under it and `wall.pins.history()` /
`wall.pins.dump()` are UNCHANGED (pre-fix, both would follow the rebind).
Cap-layer suite: 131 → 132 passed (`python -m pytest capability/tests -q`,
~60s).

[WAVE-C ROUND 2026-08-16 — WC-W8 didChange version is a per-uri monotonic]
`spine_client.py` + `spine_proto.py` + `probe_p0_p2.py`. `did_change`
hardcoded `textDocument.version = 2`; the P0-P2 probe battery baked the
constant into its waits (`versions=(None, 2)`). A second `did_change` on the
same uri would have collided with the first's version on real servers that
stamp `publishDiagnostics` with the request version (pyright), so the P2
restore wait could match a stale post-injection publish instead of the
post-restore one — and a general second-change caller would have wire-lied
about which snapshot the diagnostics belong to. Fix: `_ClientCore.__init__`
declares `self.doc_versions: dict[str, int]`; `did_open` seeds `= 1`; each
`did_change` increments `self.doc_versions[uri]` and stamps THAT value on
the wire. `restart()` resets the counter (fresh server generation).
Probe waits now read `cur = self.client.doc_versions.get(self.main_uri)`
and pass `versions=(None, cur)` — the fixture-shim path still matches
`None` (the shim sends no version field) so awk/zigish gates are unchanged.
New gate `tests/test_18_did_change_versions.py` (2 tests): fabricates a
minimal LspClient handle (no subprocess) and captures the JSON-RPC frames
`notification()` sent, asserting versions 1,2,3 across `did_open + 2×
did_change` on one uri, and independent per-uri counters across two uris.
Cap-layer suite: 132 → 134 passed (`python -m pytest capability/tests -q`,
~69s).

## 2026-08-16 — D-dedup remediation round (Cluster U — U7 + U4/U8)

- **U7 · capability/schema.py** — `worst_case_order()` no longer hand-types
  the 4th copy of the frozen 7-token OUTLINE_WORST_ORDER. It now reads
  `OUTLINE_WORST_ORDER` from `packages/schema/gen/schema_constants.py` via
  file-read + exec (the same data-only pattern gate 13 already uses in
  `_exec_canonical`), so this cell can no longer structurally drift from the
  canonical order. Gate 13 (`test_13_schema_sync`) keeps a value-equality
  assertion on top so the invariant is still explicit; the split 7-token
  red-first shape check remains unchanged. The import-boundary gate's
  ALLOWED lists are untouched — canonical stays consumed AS DATA. The value
  is cached after the first successful load. File went 67 → 96 lines
  (`pathlib` add + docstrings), still well under the 200-line linegate.
- **U4/U8 · capability/shim/ybg_state.py** — restored the V1 lowercase-drive
  fix to the shim-side `path_to_uri` (present in the client-side
  `capability/spine_wire.py` since ASSEMBLY CHANGE V1 but MISSING from the
  drifted shim copy). On Windows the shim now publishes lowercase-drive
  URIs, so pyright-style clients (which canonicalise `A:` → `a:`) can
  string-match the shim's echoed document URIs against their own. Symmetric
  with `uri_to_path` above (already Windows-drive-aware). File 155 → 161
  lines.

Suite: `python -m pytest capability/tests -q` — 134 passed (~71s), no
count change; existing gate 13 tests still assert equality with the
canonical OUTLINE_WORST_ORDER and the schema PIN.
