# REPORT-SUB200 — packages/byok-arena (2026-08-02)

Adversarial-round prep: every non-exempt source file in the area brought UNDER the
200-line hard ceiling by cohesion splits. Behavior-preserving only; facade pattern
on every split (original module paths remain, re-exporting the full public surface
from new in-cell submodules). External importers (hub `ai/server.ts`, `ai/service.ts`,
`ai/test/v6.outlet.test.ts`, `demo.ts`, all tests) needed ZERO changes.

## Splits (old file (lines) → new modules (lines))

| Old | New |
| --- | --- |
| `src/adapters/gemini.ts` (466) | facade 71 + `gemini/wire.ts` 53 + `gemini/errors.ts` 65 + `gemini/normalize.ts` 100 + `gemini/send.ts` 161 + `gemini/continuation.ts` 115 |
| `src/adapters/openai.ts` (428) | facade 68 + `openai/wire.ts` 40 + `openai/errors.ts` 49 + `openai/normalize.ts` 97 + `openai/send.ts` 166 + `openai/continuation.ts` 103 |
| `src/adapters/anthropic.ts` (381) | facade 68 + `anthropic/wire.ts` 80 + `anthropic/normalize.ts` 78 + `anthropic/send.ts` 146 + `anthropic/continuation.ts` 97 |
| `tests/wall-conformance.test.ts` (322) | `wall-conformance.test.ts` 126 (7 tests) + `wall-conformance-face.test.ts` 186 (7 tests) + `wall-helpers.ts` 36 |
| `src/testkit/goldens.ts` (301) | facade 28 + `goldens/anthropic.ts` 77 + `goldens/openai.ts` 118 + `goldens/gemini.ts` 109 + `goldens/task.ts` 23 |
| `src/probe/catalog.ts` (260) | aggregator 35 + `catalog/entry.ts` 11 + `catalog/vault.ts` 34 + `catalog/adapters.ts` 148 + `catalog/cost-arena.ts` 56 + `catalog/scan-wall.ts` 34 |
| `src/wall.ts` (233) | facade 37 + `wall/types.ts` 93 + `wall/construct.ts` 139 |
| `src/adapters/shared.ts` (227) | facade 18 + `shared/runtime.ts` 72 + `shared/send.ts` 167 |
| `src/arena/arena.ts` (211) | `arena/arena.ts` 155 (runArena + type re-exports) + `arena/compare.ts` 69 |

Adapter split axis: wire-shapes+normalization / send+retry (over shared loop) /
continuation-cache. Private class fields became an explicit per-adapter mutable
state object threaded through the split functions — same lifecycle, same probe
emission order (probe-stream conformance tests unchanged and green).

## Invariants proven

- **Suite**: `node --test "tests/*.test.ts"` — **103/103 green** (baseline 103 → 103;
  wall-conformance's 14 tests now discovered across two files, none weakened).
- **Catalog**: re-assembled catalog diffed index-by-index against the pre-split
  builder — **168 entries, element-for-element IDENTICAL, same order**; pre-wall
  163 + 5 `wall.*` asserted by tests; schema-ABSENCE gate (kind ∉ {node,edge}, no
  `schema.*` lead) holds on every section.
- **Import boundary**: gate green — all new files use in-cell relative imports only
  (allowed bare import remains `node:crypto`); wall-focused restatement in the
  conformance test still passes against the facade `wall.ts` (3 relative
  export-from statements, all resolving inside `src/`).
- **Hub/membrane**: `ai/` outlet suite (imports `wall.ts`, `testkit/fakefetch.ts`,
  `interface.ts` by path) — **14/14 green**, zero changes there.
- **Goldens**: every golden fixture byte-identical, only relocated by provider;
  no golden file changed shape or value (no exemption needed).
- `demo.ts` smoke-run OK.

## Exemptions

None required in this area. (`src/probe/bus.ts` at 199 was already under the
ceiling and untouched; goldens split cleanly by provider so the goldens
mandatory-exempt clause was not needed.)

## Verification table (every .ts in the area)

| File | Lines |
| --- | --- |
| src/probe/bus.ts | 199 |
| tests/wall-conformance-face.test.ts | 186 |
| src/adapters/shared/send.ts | 167 |
| src/adapters/openai/send.ts | 166 |
| src/adapters/gemini/send.ts | 161 |
| src/arena/arena.ts | 155 |
| tests/error-matrix.test.ts | 154 |
| src/vault/vault.ts | 154 |
| src/probe/catalog/adapters.ts | 148 |
| src/adapters/anthropic/send.ts | 146 |
| tests/trap3-submit.test.ts | 144 |
| tests/catalog.test.ts | 140 |
| src/testkit/fakefetch.ts | 140 |
| src/wall/construct.ts | 139 |
| tests/traps.test.ts | 138 |
| tests/cheap-connectors.test.ts | 137 |
| src/cost/pricing.ts | 137 |
| tests/arena.test.ts | 127 |
| tests/wall-conformance.test.ts | 126 |
| src/probe/leakscan.ts | 122 |
| src/testkit/goldens/openai.ts | 118 |
| tests/validatekey.test.ts | 116 |
| src/adapters/gemini/continuation.ts | 115 |
| tests/vault.test.ts | 110 |
| src/testkit/goldens/gemini.ts | 109 |
| src/interface.ts | 103 |
| src/adapters/openai/continuation.ts | 103 |
| tests/cost.test.ts | 102 |
| src/adapters/gemini/normalize.ts | 100 |
| src/adapters/openai/normalize.ts | 97 |
| src/adapters/anthropic/continuation.ts | 97 |
| src/index.ts | 95 |
| src/wall/types.ts | 93 |
| tests/gemini-stale-cache.test.ts | 83 |
| tests/secret-leak.test.ts | 81 |
| src/adapters/anthropic/wire.ts | 80 |
| tests/usage-mapping.test.ts | 79 |
| src/adapters/anthropic/normalize.ts | 78 |
| src/testkit/goldens/anthropic.ts | 77 |
| src/adapters/shared/runtime.ts | 72 |
| src/adapters/gemini.ts | 71 |
| src/arena/compare.ts | 69 |
| src/probe/redact.ts | 68 |
| src/adapters/openai.ts | 68 |
| src/adapters/anthropic.ts | 68 |
| src/adapters/gemini/errors.ts | 65 |
| src/adapters/openaiResponses.ts | 64 |
| tests/import-boundary.test.ts | 62 |
| tests/helpers.ts | 60 |
| demo.ts | 57 |
| src/probe/catalog/cost-arena.ts | 56 |
| src/adapters/gemini/wire.ts | 53 |
| src/adapters/openai/errors.ts | 49 |
| tests/determinism.test.ts | 46 |
| src/adapters/openai/wire.ts | 40 |
| src/wall.ts | 37 |
| tests/wall-helpers.ts | 36 |
| src/probe/catalog.ts | 35 |
| src/probe/catalog/vault.ts | 34 |
| src/probe/catalog/scan-wall.ts | 34 |
| src/testkit/goldens.ts | 28 |
| src/testkit/goldens/task.ts | 23 |
| src/adapters/shared.ts | 18 |
| src/probe/catalog/entry.ts | 11 |

Max 199 < 200 — ceiling holds on every file.

## Bugs noticed (NOT fixed this round)

No defects found. One observation recorded: `sendRequest` shortens a
server-requested Retry-After longer than the backoff cap to the cap
(`Math.min(retryAfterSec*1000, maxBackoffMs)`); the cap and both values are on
the retryDecision probe/log so this matches the no-silent-caps contract — the
probe's `retryAfterSec` and applied `backoffMs` can disagree by design.

---

[HONESTY-SWEEP correction 2026-08-03: the verification table was re-measured against today's tree (wc -l). 1 row(s) no longer match; file mtimes post-date this report — later rounds (remediation / claim-audit) edited these files, so the table was accurate at writing but is stale for: src/index.ts 95→96. Ceiling max is still 199 (src/probe/bus.ts). buildCatalog() re-run live: 168 entries, 5 wall.* — as claimed. All other rows re-measured exact; every listed file remains under the 200-line ceiling; exemption files and facade surfaces re-verified as claimed.]
