# vessels/ ASSEMBLY-CHANGES

## Wave C (H-cluster) — H11 dead-handles-after-shutdown (2026-08-16)

[H11 · vessels/v1_feed.py] `V1CapabilityFeed.capability_fn` served
cached handles with NO check on `self._down`; `shutdown()` terminated
the LSP children but never invalidated `self._handles` / `self._walls`,
so a post-shutdown `capability_fn(lang)` handed out a
`CapabilityHandle` whose `.handle._client.proc` was already dead.  Fix:
(a) new typed error class `FeedShutdownError` (`failure_class =
"feed-shutdown"`); capability_fn raises it FIRST when `_down` is set.
(b) shutdown() now clears `_handles` and `_walls` after the wall
shutdowns run (pre-clear so live_clients() returns [] and any second
capability_fn call raises loudly rather than serving a stale reference
to a dead child).  Idempotent shutdown preserved.  Facade
`v1_capability_extractor.py` re-exports the new error class.  New
`test_v1_langs_lifecycle.test_z` assertions (extended, same method):
after shutdown, `live_clients() == []`, `capability_fn("python")` and
`capability_fn("lean")` both raise `FeedShutdownError`, second
`shutdown()` returns the same pin list byte-equal.  Vessel V1 suite:
11 tests, OK (unchanged count — assertions added to the existing
lifecycle test).

## SUB200 restructure (2026-08-02)

Behavior-preserving split of every vessels source file to under 200 lines.
Original module paths remain as FACADES / entry points — external
importers (outerwall's `from v1_capability_extractor import
V1CapabilityFeed`, serve_app's `import pathing` + `import lsp_backend`,
squiggle_check's spawn of v2_hub_runner.py) and the by-path suite
invocations (run_all_suites, faultcheck, run_demo) need zero changes.

- vessels/v1_capability_extractor.py (262) → facade 75 (keeps the V1
  invariants docstring + full __all__) + v1_walls.py 65 (pathing-loaded
  walls, canonical language set, error classes) + v1_feed.py 163
  (V1CapabilityFeed).
- vessels/v2_hub_runner.py (215) → runner 136 (unchanged entry point +
  protocol loop) + v2_hub_info.py 93 (_session_info / _bridge_pins
  evidence extractors).
- vessels/test_v1.py (331) → test_v1.py aggregator 61 (load_tests, python/
  awk module first, lean/latex/unknown/lifecycle second — test_z, the
  explicit shutdown, still runs LAST) + v1_seam_shared.py 137 (the ONE
  shared feed + five extractions, built lazily; atexit safety net keeps
  the original tearDownClass shutdown/rmtree) + test_v1_live_python.py
  117 + test_v1_langs_lifecycle.py 135.  Test count unchanged (11); the
  LOUD npx skip is preserved (ensure_stack raises SkipTest).
- vessels/test_v3_extractor_to_model.py (576) → aggregator 59 (load_tests
  over four modules in original class order) + v3_seam_shared.py 93
  (walls/ids via pathing, fixture configs, Bundle, lazy SKELETON/RICH) +
  test_v3_byte_identity.py 145 + test_v3_accounting.py 129 +
  test_v3_semantics.py 140 + test_v3_negatives.py 147.  Test count
  unchanged (16).
- vessels/test_v2_squiggle.mjs (484) → entry 37 (same `node --test
  vessels/test_v2_squiggle.mjs` invocation; ONE spawned hub, one process —
  imports register the cases in the original order) + v2_squiggle_env.mjs
  164 (fixture/uri/NODES, helpers, connectTransports with the DECLARED
  initialize enrichment, shared ctx + spawned-hub before/after) +
  v2_runner_protocol.mjs 47 (Runner) + v2_squiggle_cases.mjs 183 (tier
  honesty + end-to-end squiggle) + v2_squiggle_drop.mjs 115 (backend-kill
  drop + teardown/orphan sweep).  Test count unchanged (4).

No semantic changes; no public renames; no assertion weakened.

## ADVERSARIAL claim-audit (2026-08-03) — doc-side fixes only

Stage-A audit of every vessels source file (22 files, whole-read; output
proofgraph/audit/AUDIT-vessels.json).  Text-only fixes, no identifier,
behavior, or assertion changed:

- serve_hub_v4.py docstring: spawner claim updated (v4.serve.test.tsx →
  each split V4 test file via app/test/helpers/v4hub.ts); ready-line key
  list gained `entryName` (the code always printed it); rich-config
  pointer updated (test_v3_extractor_to_model.py → v3_seam_shared.py,
  where the config moved in the SUB200 split).
- v2_squiggle_drop.mjs comment: "silent-give-up" reworded to LOUD give-up
  (reconnect-cap) — the probe's own detail says "giving up LOUDLY, not
  silently" (contract rule 8).

Dated note: the SUB200 table above recorded v2_squiggle_drop.mjs at 115
lines — true at split time; the rewording fix above added one line
(115 → 116, still well under 200).  All other SUB200 counts re-verified
exact on disk 2026-08-03.

Suites after fixes (counts unchanged): V1 11 · V2 4 · V3 16.
