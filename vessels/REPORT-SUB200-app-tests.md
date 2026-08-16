# REPORT — SUB200 restructure (wave 2), area `app/test*`

Round: adversarial-round prep, wave 2. Mission: every non-exempt source file in
`app/test/` + `app/test-acceptance/` UNDER 200 lines, split by cohesion behind
shared helper modules, behavior-preserving. `app/src` untouched (concurrent
app-src stream owns it). Date: 2026-08-02.
Result: **done — all area files <=198, app vitest 111 passed + 1 todo (exact
baseline), acceptance 4/4, tsc clean, run_demo 11/0/0 live.**

## What was split

| Old file (lines, tests) | New files (lines, tests) |
| --- | --- |
| `test-acceptance/acceptance.headless.test.tsx` (679, 4) | `acceptance.headless.test.tsx` (193, 1: §7 d+f+b — original path kept) + `acceptance.ceiling.test.tsx` (106, 1: §7 h) + `acceptance.greenflow.test.tsx` (146, 1: §7 i) + `acceptance.doctored.test.tsx` (75, 1: §7 j) + helpers (below) |
| `test/v4.serve.test.tsx` (623, 8) | `v4.serve.test.tsx` (143, 2: health + THREE-WAY — **name kept**, see notes) + `v4.serve.verdicts.test.tsx` (98, 2) + `v4.serve.guards.test.tsx` (138, 3) + `v4.serve.trace.test.tsx` (111, 1) |
| `test/shell.face.test.tsx` (479, 13) | `shell.face.test.tsx` (141, 6: menubar) + `shell.face.tabs.test.tsx` (93, 3) + `shell.face.save.test.tsx` (91, 4) + `shell.face.dialogs.test.tsx` (62, 3) |
| `test/v5.bus.test.tsx` (428, 9) | `v5.bus.test.tsx` (140, 3: join + a + b) + `v5.bus.bounds.test.tsx` (125, 3: c + d + d-prime) + `v5.bus.guards.test.tsx` (105, 3: hover/spoof/teardown) |
| `test/p3.face.test.tsx` (412, 10 + 1 todo) | `p3.face.test.tsx` (145, 3: paints) + `p3.face.honesty.test.tsx` (171, 7 + the 1 todo) |
| `test/shell1c.face.test.tsx` (377, 9) | `shell1c.face.test.tsx` (111, 3: welcome + search) + `shell1c.face.windows.test.tsx` (147, 6: accent/gear/rail/chrome) |
| `test/shell1c.layout2.test.ts` (330, 28) | `shell1c.layout2.test.ts` (166, 15: geometry) + `shell1c.layout2.machine.test.ts` (93, 6) + `shell1c.layout2.persist.test.ts` (96, 7) |
| `test/shell.units.test.ts` (306, 27) | `shell.units.test.ts` (123, 13: splitter/prefs/layout) + `shell.units.tabs.test.ts` (88, 6) + `shell.units.fs.test.ts` (111, 8) |

[CLAIM-AUDIT correction 2026-08-03: per-file test counts in two rows above were
off by one against a fresh recount of the files (p3.face family is 10 + 1 todo,
honesty file carries 7; layout2 geometry file carries 15, persist 7). Family
totals and the measured suite grand total (111 passed + 1 todo) were and are
correct.]

Split axis everywhere: the files' own numbered describe-groups; shared setup
hoisted VERBATIM into non-test helper modules (no `.test.` in helper names, so
the vitest globs collect no new tests from them). Original describe titles kept
verbatim in every split file — full test names are byte-identical to before.

## New helper modules

- `test/helpers/reactFlowShims.ts` (41) — the jsdom React Flow shims, ONE copy
  (was pasted verbatim in 5 files); each suite calls `beforeAll(installReactFlowShims)`.
- `test/helpers/shellProbe.ts` (16) — `resetShellState` + `probes` (was pasted in 5 files).
- `test/helpers/shellFaceFixture.tsx` (141) / `shell1cFixture.tsx` (120) — the
  mocked-hub contract fixtures + `renderShell` + menu helpers (kept SEPARATE:
  the two rounds' mocks differ in override hooks and recorded routes).
- `test/helpers/p3fixture.ts` (99) — the 6-node moat fixture + ruling-8 verdicts
  + `httpGetOf`.
- `test/helpers/v4hub.ts` (145) + `v4pins.ts` (94) — serve_hub_v4 spawn/health/
  teardown lifecycle (`setupV4Hub()` registers the original beforeAll/afterAll;
  EVERY v4 split file spawns its OWN hub — the launcher's ports are ephemeral,
  parallel files never collide) + localBus/pin/dump/byte-identity helpers.
- `test/helpers/v5joint.ts` (127) — clean.py fixtures + `mountJoint` + teardown +
  pin helpers.
- `test-acceptance/helpers/analyses.ts` (142) — the three REAL analyses
  (independent double-parses kept), ids, URIs, envelope builders, editor-node
  mappers, `LEAN_MEASURED_TIER`; still REFUSES loudly when analysis-*.json are
  missing (`acceptance-evidence-missing`).
- `test-acceptance/helpers/mounts.ts` (96) — `mountJoint`/`mountLeanEditor` +
  teardown + pin helpers.
- `test-acceptance/helpers/evidence.ts` (29) + `globalSetup.ts` (41) — see below.

## The §7 evidence seam (the one real design decision)

The original single file accumulated `evidence` across its 4 tests and wrote
`acceptance/evidence/headless.json` in ONE afterAll. Four files cannot share an
afterAll, and parallel workers cannot safely read-modify-write one JSON. So:

- each split suite accumulates its own keys and writes ONE part file
  (`acceptance/evidence/headless-parts/<suite>.json`) in its afterAll — same
  partial-on-failure semantics as before, per file, race-free under parallelism;
- a NEW vitest `globalSetup` (`test-acceptance/helpers/globalSetup.ts`, wired
  in `vitest.acceptance.config.ts`) deletes `headless.json` + all parts BEFORE
  any test (stale evidence can never masquerade — the old wholesale overwrite
  made staleness impossible; this preserves that) and, in teardown (pass or
  fail), merges parts + the base fields (`generatedBy`, `coreUri`, `ids`) into
  the SAME `headless.json` shape.
- `run_demo.py` is UNCHANGED — it still runs `vitest run --config
  vitest.acceptance.config.ts` and reads `evidence/headless.json`. Verified two
  ways: merged file key-identical to the pre-split evidence (all 9 top-level
  keys, ids/byteEqual/greenGlyphCount/leadGuardCount facts equal), and a full
  live `python acceptance/run_demo.py` = **11 PASS / 0 FAIL / 0 SKIP** (119s) —
  notably ON TOP OF the concurrent acceptance-stream's own run_demo facade
  split, so the two wave-2 streams are proven compatible.

## faultcheck fault (b) filename dependency (preserved, not adapted)

faultcheck fault (b) injects a hub-side id flip and runs
`npx vitest run --no-cache test/v4.serve.test.tsx` BY NAME expecting the
`serializer-edge-drop` signature. The split therefore KEEPS a real
`test/v4.serve.test.tsx` carrying the three-way equality gate; its (helper-
registered) beforeAll still runs `fetchGraphVerified`, which is where the
signature erupts under the fault. The vitest name filter matches ONLY that file
(not `v4.serve.*.test.tsx` — verified: by-name run = 1 file / 2 tests green).
No faultcheck file touched.

## Suites (measured live)

| Suite | Before | After |
| --- | --- | --- |
| `app npx vitest run` | 111 passed + 1 todo (9 files, 39.7s) | **111 passed + 1 todo** (23 files, 50.2s) |
| `app npx tsc --noEmit` | clean | **clean** (exit 0) |
| `vitest run -c vitest.acceptance.config.ts` | 4 passed (1 file) | **4 passed** (4 files) |
| `python acceptance/run_demo.py` (DEFAULT, full) | 11/0/0 | **11 PASS / 0 FAIL / 0 SKIP** (119s) |
| fault-(b) control `vitest run --no-cache test/v4.serve.test.tsx` | (part of 8) | **2/2** (1 file matched by name) |

One run_demo attempt before the green one died in python step 1 with a
`SpineTimeout: no message from lean4-language-server in 30s` — BEFORE the
vitest suite runs, in the capability layer's live-LSP probe (the known
cold-start/concurrent-load class; green on immediate retry). Declared, not this
stream's surface.

## Verification table — every file in the area (ceiling: <200)

| File | Lines |
| --- | --- |
| `test/p3.build.gate.test.ts` (untouched) | 80 |
| `test/p3.face.test.tsx` | 145 |
| `test/p3.face.honesty.test.tsx` | 171 |
| `test/shell.face.test.tsx` | 141 |
| `test/shell.face.tabs.test.tsx` | 93 |
| `test/shell.face.save.test.tsx` | 91 |
| `test/shell.face.dialogs.test.tsx` | 62 |
| `test/shell.units.test.ts` | 123 |
| `test/shell.units.tabs.test.ts` | 88 |
| `test/shell.units.fs.test.ts` | 111 |
| `test/shell1c.face.test.tsx` | 111 |
| `test/shell1c.face.windows.test.tsx` | 147 |
| `test/shell1c.layout2.test.ts` | 166 |
| `test/shell1c.layout2.machine.test.ts` | 93 |
| `test/shell1c.layout2.persist.test.ts` | 96 |
| `test/shell1c.skin.test.tsx` (untouched, pre-existing) | 198 |
| `test/v4.serve.test.tsx` | 143 |
| `test/v4.serve.verdicts.test.tsx` | 98 |
| `test/v4.serve.guards.test.tsx` | 138 |
| `test/v4.serve.trace.test.tsx` | 111 |
| `test/v5.bus.test.tsx` | 140 |
| `test/v5.bus.bounds.test.tsx` | 125 |
| `test/v5.bus.guards.test.tsx` | 105 |
| `test/helpers/reactFlowShims.ts` | 41 |
| `test/helpers/shellProbe.ts` | 16 |
| `test/helpers/shellFaceFixture.tsx` | 141 |
| `test/helpers/shell1cFixture.tsx` | 120 |
| `test/helpers/p3fixture.ts` | 99 |
| `test/helpers/v4hub.ts` | 145 |
| `test/helpers/v4pins.ts` | 94 |
| `test/helpers/v5joint.ts` | 127 |
| `test-acceptance/acceptance.headless.test.tsx` | 193 |
| `test-acceptance/acceptance.ceiling.test.tsx` | 106 |
| `test-acceptance/acceptance.doctored.test.tsx` | 75 |
| `test-acceptance/acceptance.greenflow.test.tsx` | 146 |
| `test-acceptance/helpers/analyses.ts` | 142 |
| `test-acceptance/helpers/mounts.ts` | 96 |
| `test-acceptance/helpers/evidence.ts` | 29 |
| `test-acceptance/helpers/globalSetup.ts` | 41 |
| `vitest.acceptance.config.ts` (edited: +globalSetup wiring) | 40 |

Exemptions relied on: **none** in the area (no generated artifacts, goldens or
vendored fixtures live under app/test*; `acceptance/evidence/` outputs are the
acceptance area's regenerated artifacts, not files of this area).

## Notes / deviations

- Benign module cycle `test/helpers/v4hub.ts <-> v4pins.ts` (getJson <->
  localBus) — both references resolve inside function bodies after evaluation
  (ESM-safe; same class as wave-1's declared ai/server cycle), exercised by
  every v4 file.
- `test-acceptance` is NOT in app/tsconfig `include` (pre-existing) — tsc
  coverage of the area is unchanged; the acceptance files are type-checked by
  vitest's transform as before.
- `evidence.generatedBy` now names the merged-parts pipeline instead of the
  single file — the field is informational (run_demo never reads it).
- `app/README.md` (lines ~177-181) still describes the pre-split per-file test
  breakdown; totals are unchanged and README is outside this area — left for
  the round's closing sweep.
- Coordination: the full `npx vitest run` (111+1) + `tsc` (clean) above ran at
  round end against the tree INCLUDING the concurrent app-src stream's state at
  that moment; the closing joint sweep should re-confirm the same totals once
  the app-src stream logs its own [x].
- No bugs found in the area during the split (nothing to flag).
---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 4 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: test/shell.face.test.tsx 141→143; test/shell.face.save.test.tsx 91→92; test/shell1c.skin.test.tsx 198→199; vitest.acceptance.config.ts 40→37. The headline 'all area files <=198' is therefore stale: the area max today is 199 (shell1c.skin.test.tsx) - still under the 200 ceiling. Caveat: vitest.acceptance.config.ts has not been modified since 2026-08-02 19:53, so its 40-vs-37 delta cannot be attributed to post-report edits; the other three rows drifted after this report. All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
