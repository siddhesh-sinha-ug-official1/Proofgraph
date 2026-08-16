# byok-arena — Tree 6: the AI outlet (BYOK Multi-Model Arena)

One uniform `ModelAdapter` over **Anthropic / OpenAI / Gemini**, each call billed to the
*user's own* pasted key held in a per-user **encrypted vault**, with an `estimateCost`
meter and the **arena** — the proof harness that runs two providers on the SAME
tool-call task and asserts their **normalized** outputs agree.

This round follows the Prime Directive: **maximally probe-able, no membrane.**
Every internal is exposed on purpose. The production face has since been carved as the
Phase-1 wall (`src/wall.ts` → MEMBRANE-SPEC.md) — additive only, every pin intact.

## Run it

```
node --test "tests/*.test.ts"   # the §9 gate suite (103 tests, zero dependencies, Node ≥ 23.6)
node demo.ts                    # offline walking skeleton on golden fixtures (fake transport)
node demo.ts --live             # same flow against the real network (YOUR env keys, YOUR bill)
```

## Layout

```
src/interface.ts          Provider, Msg, ToolDef, ToolCall, Usage, ChatResult,
                          AdapterErrorKind (6 members), AdapterError, ModelAdapter — §7.1 verbatim
src/probe/                ProbeEvent bus · catalog (168 leads: 163 pre-wall + 5 wall.*) · redactKey() chokepoint · leak scan
src/vault/                AES-256-GCM at rest, per-user HKDF data key, scope-check at EVERY read
src/adapters/             anthropic.ts · openai.ts (Chat; Responses branch stubbed in
                          openaiResponses.ts) · gemini.ts · shared.ts (allowlist + send/retry loop)
src/cost/                 snapshot price table, Sonnet-5 date cliff, Gemini-2.5-Pro 200k cliff
src/arena/                the round-trip gate (compares normalized results, reads the probe stream)
src/testkit/              golden dossier-exact native fixtures + fake fetch = the stub seam
src/wall.ts + src/wall/   Phase-1 wall: createByokWall() face over the cell — MEMBRANE-SPEC.md
tests/                    the §9 merge gates — every assertion reads PROBE output
```

## Entry points (Probe Density Contract)

`createCell(opts)` returns `{ bus, vault, adapters, runArena, runSecretLeakScan, estimateCost }`
plus the four introspection hooks: **`probeCatalog()`** (every lead, self-describing),
**`dump()`** (entire state; vault as ciphertext refs only), **`tap(probeId, fn)`** (one live
lead), **`history()`** (the ordered stream — `logicalClock`/`causeId` are the ordering;
`wallNanos` is real time in a separate field, never used for ordering).

## The three normalization traps (why the adapter exists)

1. **args type** — OpenAI returns tool arguments as a JSON **string** (`JSON.parse` at the
   boundary); Anthropic `input` / Gemini `args` are already objects. Neutral form: always an object.
2. **call-id field** — Anthropic `id` (`toolu_…`) · OpenAI Chat `id` (`call_…`) · OpenAI
   Responses `call_id` · Gemini `id` (may be absent on 2.5 → synthesized, name-mapped on echo).
   The opaque id is echoed back verbatim.
3. **result shape** — Anthropic `tool_result` block in a new user msg (`tool_use_id`) ·
   OpenAI one `role:"tool"` msg per call (`tool_call_id`) · Responses `function_call_output`
   (`call_id`, field `output`) · Gemini `functionResponse` part (object `response`, full
   `contents` re-sent).

## Honest ceilings (unknown ≠ green)

- `validateKey` 200 proves the key **authenticates**, never that it can **spend**
  (`honestCeiling` lead: `spendable:"unknown"`). Only a real spend proves spendability;
  `insufficient_quota` after a valid paste is a distinct, non-retryable state.
- The **arena** proves normalization **for the task it ran**, not universally
  (`arena.honestCeiling` lead).
- This round's self-tests run on **golden dossier-exact fixtures over a fake transport**
  (no live keys exist here). The live network is one constructor argument away:
  `createCell({ fetchImpl: fetch })` — nothing else changes.

## Security posture (§7.6, contractual)

Keys pass one `redactKey()` chokepoint before any probe/log/error — shown form is
`{present, last4, provider, keyLen}` only. TLS-only to a 3-host allowlist; Gemini key in
the `x-goog-api-key` header, never `?key=`. Per-user isolation enforced at every vault
read and revoke. The **secret-leak scan** walks the entire probe history, logs, and
errors and is build-stopping — with negative controls proving the scanner catches plants.

## Import boundary

The cell imports **only** platform `fetch` (global) and `node:crypto`. A gate test walks
`src/` and fails the build on anything else — reaching into the graph/editor/extractor
trees is a test failure, not a code-review nit.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-byok-arena.json`); each purpose line was written from the code itself and checked against the file's tests. Source subdirectories carry their own `README.md` with the same table for their files.

| File | Lines | Verified purpose |
|---|---:|---|
| `demo.ts` | 57 | Runnable driver (not part of the cell; the import-boundary gate walks src/ only): builds a cell on the golden fake transport (or live fetch with env keys under --live), does a vault store/retrieve roundtrip, taps arena.verdict, runs the anthropic-vs-openai arena, and prints the report, leak scan, and probe-surface summary. |
| `package.json` | 10 | Zero-dependency ESM manifest for the cell: name byok-arena, private, and the test script node --test tests/*.test.ts that runs the 103-test gate suite. |
