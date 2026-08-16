# ASSEMBLY-CHANGES — byok-arena (Tree 6)

Cell: `packages/byok-arena` (copied from read-only original `A:\26lean-push`).

## Phase 0 — schema swap: NO CHANGES (by design)

This cell is **schema-absent by design** (SEAM-MAP V6): it imports nothing from
`packages/schema` and mints no graph elements; the Phase-2 vessel passes the graph
as DATA, never as imported types. The absence is test-enforced (import-boundary
gate: src imports = `node:crypto` + in-cell relative only; catalog has no node/edge
kinds). Phase 0 therefore touched nothing here. Baseline: **89/89 tests green,
probe catalog 163.**

## Phase 1 — the WALL (2026-07-20)

Carved the cell's minimal, clean, versioned, typed face per WALL-CONVENTIONS.md,
promoted OVER the pins (additive only — no export deleted, no catalog entry removed,
all 89 pre-wall tests pass unchanged).

| File | Change | Why |
| --- | --- | --- |
| `src/wall.ts` | **NEW.** `createByokWall(config)` → `{validateKey, chat, submitToolResults, estimateCost, pins}` + `WALL_VERSION = "byok-arena-wall/1.0.0"` + `WallRefusal{failureClass}`. Wraps `createCell()`; the four methods delegate to the cell's adapters/cost machinery with the SAME normalized types (`interface.ts`). `masterSecret` REQUIRED (dev default/empty/missing → `insecure-master-secret`); `fetchImpl` injectable as today. Construction gates probed: `wall.masterSecret.gate`, `wall.schemaAbsence.gate` (NO schema PIN assert — asserts the by-design absence STAYS: no node/edge kinds, no `schema.*` leads; drift → `schema-absence-violated`), `wall.construct`. Provider dispatch outside `anthropic\|openai\|gemini` → `unknown-provider` (probed on `wall.reject`). `pins` = the diagnostic quartet + `runSecretLeakScan()`. Adapter failures pass through unchanged (cell's own `AdapterErrorKind` taxonomy). `index.ts` untouched. |
| `src/probe/catalog.ts` | **EXTENDED** (additive, end of `buildCatalog()`): 5 new `wall.*` leads — `wall.masterSecret.gate`, `wall.schemaAbsence.gate`, `wall.construct` (decisions), `wall.call` (call), `wall.reject` (branch). Catalog **163 → 168**; the bus hard-rejects uncataloged emits, so wall decisions are catalogued, not just emitted. All 163 pre-wall entries byte-unchanged. |
| `tests/wall-conformance.test.ts` | **NEW** (14 tests) — pins vs face: chat+submit rounds (anthropic + openai) through the wall deep-equal the `adapter.*.normalize.output` / `adapter.*.submit.output` pins (+ TRAP 1/2 pins + `submit.idEcho`); `estimateCost` == `cost.estimate.output` pin (unpriced gpt-4.1 explicit 0); `validateKey` models == `validateKey.response` pin with honest ceiling `spendable:"unknown"` and NO extra face field; dev-default masterSecret refused (string/Buffer/empty/missing) while the standalone CELL keeps its default; `unknown-provider` refusal probed; three-provider round → `runSecretLeakScan()` via `wall.pins` `rawKeyFound:false` + NEGATIVE CONTROL (key planted in message content through the face IS caught — scanner proven live through the wall); `pins.dump()` free of plaintext keys and the master secret; `tap()` via pins live+unsubscribe; catalog additive-only (163 preserved + exactly 5 `wall.*`); schema absence re-asserted through the wall + wall.ts imports in-cell relative only. |
| `MEMBRANE-SPEC.md` | **NEW.** One page: face signatures, what stays a pin, honest-ceiling surface, failure classes (wall-raised + pass-through), versioning + the schema-absence stance (deviation from the generic schema-PIN rule, by design and documented), conformance contract. |

Suite after wall: **103/103 green** (`node --test "tests/*.test.ts"`; 89 baseline + 14
conformance/gate tests). No typecheck script exists for this cell (zero-dep, Node 24
native type-stripping) — the import-boundary gate and suite are the cell's gates, both
green with `wall.ts` inside the src census. `demo.ts --live` stays out of every test path.
Cell remains independently runnable from `packages/byok-arena` (`npm test`, `node demo.ts`).

## SUB200 restructure (2026-08-02)

Adversarial-round prep: every source file in the cell brought UNDER the 200-line
hard ceiling by cohesion splits. **Behavior-preserving only** — facade pattern on
every split: each original module path remains and re-exports its full public
surface from new in-cell submodules, so external importers (hub `ai/`, tests,
`demo.ts`) need ZERO changes. Import-boundary gate unaffected (all new imports are
in-cell relative; new files enter the src census). Probe catalog re-assembled
element-for-element IDENTICAL (verified by index-by-index diff against the
pre-split builder: 168 entries, same order; schema-ABSENCE gate — kind ∉
{node,edge}, no `schema.*` — holds on every section).

| Old file (lines) | New modules (lines) |
| --- | --- |
| `src/adapters/gemini.ts` (466) | facade `gemini.ts` (71) + `gemini/wire.ts` (53) + `gemini/errors.ts` (65) + `gemini/normalize.ts` (100) + `gemini/send.ts` (161) + `gemini/continuation.ts` (115) |
| `src/adapters/openai.ts` (428) | facade `openai.ts` (68) + `openai/wire.ts` (40) + `openai/errors.ts` (49) + `openai/normalize.ts` (97) + `openai/send.ts` (166) + `openai/continuation.ts` (103) |
| `src/adapters/anthropic.ts` (381) | facade `anthropic.ts` (68) + `anthropic/wire.ts` (80, incl. §6.G mapper) + `anthropic/normalize.ts` (78) + `anthropic/send.ts` (146) + `anthropic/continuation.ts` (97) |
| `src/adapters/shared.ts` (227) | facade `shared.ts` (18) + `shared/runtime.ts` (72) + `shared/send.ts` (167) |
| `src/wall.ts` (233) | facade `wall.ts` (37) + `wall/types.ts` (93) + `wall/construct.ts` (139) |
| `src/probe/catalog.ts` (260) | aggregator `catalog.ts` (35) + `catalog/entry.ts` (11) + `catalog/vault.ts` (34) + `catalog/adapters.ts` (148) + `catalog/cost-arena.ts` (56) + `catalog/scan-wall.ts` (34) |
| `src/testkit/goldens.ts` (301) | facade `goldens.ts` (28) + per-provider `goldens/anthropic.ts` (77) / `goldens/openai.ts` (118) / `goldens/gemini.ts` (109) + `goldens/task.ts` (23) — every golden byte-identical |
| `src/arena/arena.ts` (211) | `arena/arena.ts` (155, runArena + type re-exports) + `arena/compare.ts` (69, types + TRAP-3 validators) |
| `tests/wall-conformance.test.ts` (322) | `wall-conformance.test.ts` (126, gates + pins/catalog, 7 tests) + `wall-conformance-face.test.ts` (186, pins-vs-face + leak scan, 7 tests) + shared `wall-helpers.ts` (36) — 14 tests total, none weakened |

Adapter split axis per the plan: wire-shapes+normalization / send (over the shared
retry loop) / continuation-cache; the private class fields became an explicit
per-adapter mutable state object threaded through the split functions (same
lifecycle, same probe order). Suite after restructure: **103/103 green**
(unchanged count; wall-conformance's 14 now discovered across two files).
Hub check: `ai/` outlet suite 14/14 green against the facades.

## Wave B — 2026-08-16 (round W1: Gemini multi-round wire bug)

| File | Change | Why |
| --- | --- | --- |
| `src/interface.ts` | **EXTENDED** neutral `Msg` with two optional fields: `functionName?: string` (for `role:"tool"` round-trip — the called function's NAME, which Gemini matches by; id is only optional echo) and `toolCalls?: ToolCall[]` (for `role:"assistant"` round-trip — the paired functionCall the model produced, preserved alongside `content` text). Both are optional; existing single-turn callers see zero behavior change. | The neutral schema had no way to carry the function's name across a tool-round-trip, so `reshapeMessages` had to fall back to `toolCallId` (wrong on Gemini). And no way to carry the paired functionCall on the assistant turn, so it was reshaped to text-only — dropping the very call that the functionResponse needs to match against on the second round. |
| `src/adapters/gemini/wire.ts` | **FIXED two multi-round bugs in `reshapeMessages`**: (1) `functionResponse.name` now takes `m.functionName ?? m.toolCallId ?? ""` (was `m.toolCallId ?? ""` → written the id into NAME, which Gemini matches by), and the id is now echoed via the optional `id` field with the same synth-id gate `continuation.ts:65-71` uses. (2) `role:"assistant"` with `toolCalls[]` now preserves the paired `functionCall` parts (with optional text) instead of collapsing to a text-only part — so Gemini has a call to match the second-round functionResponse against. Existing `role:"assistant"` messages WITHOUT `toolCalls` still take the text-only path (backward-compatible). Comment block above the function names round W1 as the reason. | Confirmed real bug from Wave A investigation: only the freshly-arrived results path in `continuation.ts` used the correct NAME/id mapping; any second-round call that flowed the results through the neutral history came out with the wrong wire and no paired functionCall, and Gemini's 400s were opaque. |
| `tests/gemini-wire-multiround.test.ts` | **NEW** (5 tests) — regression cover for W1: (1) `functionResponse.NAME` carries the function's name (not the toolCallId) and the real id is echoed in the optional `id` field; (2) synthesized (2.5) ids are NEVER echoed in the id field — mirrors `continuation.ts`; (3) the paired assistant turn keeps its `functionCall` part alongside the assistant text; (4) `functionCall.name == functionResponse.name` — the NAME-matched pair Gemini expects on the second round; (5) backward-compat: assistant messages without `toolCalls` still take the text-only path. | Locks the fix in the code the model interprets — the wire — not just the code that builds it. |

Suite after W1: **108/108 green** (`node --test "tests/*.test.ts"`; 103 baseline + 5 new).
Probe catalog byte-identical (no new pins). Facade imports unchanged (`gemini.ts`
re-exports the same names). Import-boundary gate unaffected.

## Wave C — 2026-08-16 (round WC-W3 + WC-W4)

| File | Change | Why |
| --- | --- | --- |
| `src/arena/compare.ts` | **FIXED WC-W3**: `deepEqual` was `JSON.stringify(a) === JSON.stringify(b)` — key-order sensitive. Two providers that parsed the SAME tool-call args to `{a:1,b:2}` vs `{b:2,a:1}` produced identical semantics but the arena flagged `argsEquivalent → false` and mislabeled the round as "normalization DIVERGES". Replaced with a structural recursive `_deepEq` that walks objects by key set (not enumeration order), preserves array-order sensitivity, and matches `===` on primitives (incl. NaN unequal). | Ends a false "divergence" that could hide a real one behind noise. |
| `src/interface.ts` | **EXTENDED WC-W4**: `ModelAdapter.submitToolResults` req shape now carries an optional `maxTokens?: number`. Additive; existing single-round callers unaffected. | The chat leg already honored `maxTokens` with a probe on the default substitution; the continuation leg silently pinned `DEFAULT_MAX_TOKENS`, so caller intent vanished on `submitToolResults` and truncated the user-visible answer. |
| `src/wall/types.ts` | **EXTENDED WC-W4**: `WallSubmitRequest` gained the same optional `maxTokens?: number`. Additive; W1 already extended the same interface for the tool round-trip, so the pattern is the one this round follows. | Threads the caller bound through the wall/face without a signature break. |
| `src/adapters/anthropic/continuation.ts` | **FIXED WC-W4**: `max_tokens` is now `req.maxTokens ?? DEFAULT_MAX_TOKENS` (was hardcoded `DEFAULT_MAX_TOKENS`). A new `adapter.anthropic.submit.maxTokens` decision probe mirrors the chat leg's pattern (`{provided,applied,required,reason}`) so a default substitution is logged, never silent. | The Anthropic Messages API REQUIRES `max_tokens` — the substitution must be logged. |
| `src/adapters/openai/continuation.ts` | **FIXED WC-W4**: `max_completion_tokens` now honors `req.maxTokens`; new `adapter.openai.submit.maxTokens` decision probe. | Same class of silent truncation on the OpenAI continuation. |
| `src/adapters/gemini/continuation.ts` | **FIXED WC-W4**: `generationConfig.maxOutputTokens` now honors `req.maxTokens`; new `adapter.gemini.submit.maxTokens` decision probe. | Same class of silent truncation on the Gemini continuation. |
| `src/probe/catalog/adapters.ts` | **EXTENDED WC-W4** (never shrunk): 3 new per-provider catalog entries for `adapter.<provider>.submit.maxTokens` — mirrors the existing `chat.maxTokens` entry. Catalog grew from 168 → 171 pins (163→166 pre-wall + 5 wall.*). | Bus rejects uncatalogued emits; the probes wouldn't fire without this. |
| `tests/arena-deepequal.test.ts` | **NEW** (4 tests) — regression cover for W3: order-insensitive plain-object equality; recursion into nested objects/arrays; primitives/nulls match `===`; runArena reports `normalizationHolds` when providers parsed args in opposite key orders (the exact prior mislabel). | Locks the fix in the check the arena actually runs. |
| `tests/submit-maxtokens.test.ts` | **NEW** (6 tests, 2 per adapter) — regression cover for W4: caller `maxTokens=4096` reaches the wire body on each of Anthropic/OpenAI/Gemini; omitted `maxTokens` falls back to `DEFAULT_MAX_TOKENS` AND emits a `submit.maxTokens` decision probe naming the default substitution. | Would have caught the pre-W4 silent truncation on all three adapters. |
| `tests/wall-conformance.test.ts` | **UPDATED** the "additive only" catalog-count assertion: pre-wall 163 → 166, total 168 → 171, with a comment naming Round WC-W4 as the growth reason. The invariant this test enforces (catalog never SHRINKS; wall.* entries only GROW it) is preserved, tightened to the new floor. | Rules said probe catalogs never SHRINK; extending them is legitimate. |

Suite after WC-W3 + WC-W4: **118/118 green** (`node --test "tests/*.test.ts"`;
108 baseline + 4 deepequal + 6 submit-maxtokens). Catalog byte-identical
element-order; only additive growth. Import-boundary gate unaffected.
