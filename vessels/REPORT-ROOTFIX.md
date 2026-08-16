# REPORT-ROOTFIX — item 3a: package-root-uri-mismatch proper fix + staging retirement

**Round: remediation (agentic-convos/remediation-round.md item 3a)**
**Status: DONE — all suites green**
**Date: 2026-07-29**

## Resumed-agent audit (the limit-kill precedent, honored)

The round-1 ROOT-fix agent died on a usage limit mid-item. Disk audit (mtimes
2026-07-20 18:41–18:45) found its partial work — verified, kept, completed:

| Artifact | State found | Action |
|---|---|---|
| `packages/structure-extractor/extractor/docks/pyright_backend.py` | FIX APPLIED (wire uris from didOpen'd absolute paths, rel↔abs table, normcase reverse map) | verified live, kept |
| `packages/structure-extractor/extractor/pipeline.py` | files table + loud outside-project-root drop applied | verified, kept |
| `packages/structure-extractor/selftest/test_live_pyright_oracle.py` | NEW `test_bare_package_dir_resolves_live` present | verified green live, kept |
| `outerwall/analyze.py` | docstring updated, `_normalize_root` CODE still copy-staging (killed mid-edit) | completed: staging retired |
| records (ASSEMBLY-CHANGES, ARCHITECTURE-PHASE2), outerwall/acceptance tests | untouched | written/updated this session |

## The fix (cell 3 COPY; the recorded change request, applied)

`LspPyrightBackend` now takes `files: list[(rel, abspath)]`. Every LSP wire
uri is built from the didOpen'd ABSOLUTE path under the detected project
root — never by joining the dock's ingest-root-relative rel onto
`project_root` (which mis-rooted the uri whenever ingest root ≠ project
root: a bare package dir puts the project root at the package PARENT, so
`<parent>/core.py` was queried, an unopened non-file, and every definition
lookup returned `[]` → calls degraded to leads). Responses map back into the
dock's rel vocabulary via an `os.path.normcase` reverse table (absorbs
pyright's drive-letter lowercasing — the V1 root-cause find, reused).

**Invariants held:** node ids and `span.file` vocabulary unchanged for a
given ingest root (ids minted from structural identity; spans stay
ingest-root-relative) — only LSP wire paths changed. When ingest root ==
project root the rel keys are byte-identical to the old form, so
`richpkg.recorded.json` replays without re-record (sha-verified).

**Regression gate:** `test_bare_package_dir_resolves_live` extracts
`fixtures/pyrich/richpkg` (bare dir) with pyright LIVE; asserts the mismatch
case is really exercised (project root == package parent ≠ ingest root),
span.file carries no `richpkg/` prefix, pyright-RESOLVED calls edges exist
(the bug's signature inverted), and full name-keyed relation parity with the
parent-root recorded run.

## Staging retirement (outer wall)

`outerwall/analyze.py _normalize_root`:
- bare package dirs now extract DIRECT — no scratch copytree. The
  `outerwall.root.staged` probe STAYS (probe APIs never shrink) and records
  the decision with `mode: "direct"`, the fixed bound named, and the
  declared consequence spelled out.
- single-FILE staging KEPT (the extractor walks dirs) — sha256-pinned,
  byte-identity asserted, record gains `mode: "staged"` (additive).

**Declared consequence, never smoothed:** span.file/ids are ingest-root-
relative, so the bare-dir moat extract now mints `core.py` (not
`moatpkg/core.py`) and ids remint accordingly (acceptance unused id:
n_94602d86cdf431c2 → n_0b636277e755222b). Root-sensitivity of structural
identity — declared since the master assembly (post-DONE addendum). The
relation set (names, kinds, resolution outcomes) is unchanged — asserted by
the cell's parity test. Parent-root layouts (serve_app / run_shell_demo:
workspace = package parent) are BYTE-IDENTICAL to before the fix — proven by
run_shell_demo's unchanged ids (unused_fn n_94602d86cdf431c2, main
n_6e177dcaaec5588a — the assembly-era records) → /graph unchanged for the
moat fixture through the live demo stack.

## Tests updated honestly (reason comments in-file)

- `outerwall/test_outerwall.py`: `test_staging_logged_with_byte_identity` →
  `test_package_dir_extracts_direct_and_decision_logged` (asserting the
  retired workaround would assert the workaround; now asserts mode=direct,
  no scratch root, pyright-resolved calls edges in the bare-dir moat graph,
  no `moatpkg/` span prefix) + NEW `test_single_file_staging_still_sha_pinned`
  (the kept leg, now pinned by a test of its own).
- `app/test-acceptance/acceptance.headless.test.tsx` +
  `acceptance/headless/squiggle_check.mjs`: core.py node filter accepts both
  span vocabularies (`"core.py"` and `.../core.py`); ids + byte spans cross
  untouched.
- `acceptance/run_demo.py`: the declared-bound line now reports the FIXED
  state (mode=direct) instead of the retired staging story.

## Suite results (this session, in order)

| Suite | Result |
|---|---|
| cell 3 `python selftest/run_all.py` (live oracle incl.) | **104/104 OK** (103 baseline + bare-dir test) |
| `python outerwall/test_outerwall.py` | **31/31 OK** (30 baseline; 1 updated w/ reason, 1 added) |
| `python hub/test_hub.py` | **44 OK** (1 pre-existing symlink-privilege subtest skip, loud) |
| `python vessels/test_v1.py` | **10/10 OK** |
| `python vessels/test_v3_extractor_to_model.py` | **16/16 OK** |
| `python acceptance/run_demo.py --skip-browser` | **8 PASS / 0 FAIL / 1 SKIP** (28s; incl. live squiggle + headless walls suite) |
| `python acceptance/run_shell_demo.py` | **11 PASS / 0 FAIL** (19s) |
| app `npx vitest run` | **99 passed, 1 todo** |

## Records written

- `packages/structure-extractor/ASSEMBLY-CHANGES.md` — remediation section
  (change request applied, original bound referenced, provenance note).
- `ARCHITECTURE-PHASE2.md` — catalog entry `package-root-uri-mismatch`
  rebased BOUND → FIXED.

## Bounds / notes for the round

- Concurrent-round note: a Lean-spike agent appended its own section to cell
  3's ASSEMBLY-CHANGES.md during this session (lean_driver spike) — no
  overlap with this change set.
- The hub suite's 1 skip is the environment's symlink privilege
  (WinError 1314), pre-existing, subtest-loud, unrelated.
- Probe catalog counts: cell 3 137→137; outerwall catalog unchanged
  (`outerwall.root.staged` reused, payload extended additively).
