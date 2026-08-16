# REPORT — Vessel V6: byok wall ⇄ system (AI outlet skeleton)

Date: 2026-07-20 · Assembly: `A:\30lean-push\proofgraph` · Agent: V6

## What was laid

| Piece | Path | Role |
| --- | --- | --- |
| Outlet service | `proofgraph/ai/service.ts` | `createAiOutlet({byokWall, graph, provenance}) -> {ask(question, opts), tools, pins}` — assembly code, lives outside every cell |
| Connector suite | `proofgraph/ai/test/v6.outlet.test.ts` | node:test, zero new deps, drives cell 6's own testkit fake transport with V6-crafted golden wire fixtures |
| Runner manifest | `proofgraph/ai/package.json` | `{type:"module"}` + `npm test` = `node --test "test/*.test.ts"` (Node 24 native type-stripping; no installs) |
| Seam catalog growth | `ARCHITECTURE-PHASE2.md` | added `tool-loop-exceeded · graph-data-stale · unknown-tool` (V6) |

Cell modifications: **NONE.** Cell 6 (`packages/byok-arena`) is untouched; its
schema-absence gate stays intact. The composed graph enters the outlet as **DATA**
(canonical envelope `{nodes, edges, leads[]}`); the only schema imports in
`service.ts` are `import type` from `packages/schema/gen/graph-schema.ts` —
erased at runtime. The only cell 6 value the outlet ever touches is the injected
`byokWall` face.

## The tool loop (thin skeleton, one round)

`ask()` offers four tools answering FROM the provided data, never from the model's
imagination and never from cell internals:

- `listUnused()` — echoes the provided `provenance.unused` (graph-model wall
  `query("unused")` result), joined against graph nodes; **honest no-claim** when no
  unused set was provided (roots are declared, never inferred — the outlet fabricates
  nothing).
- `trustBase(nodeId)` — BFS over **resolved edges only**; leads are counted
  (`leadsNotFollowed`) but never followed (honest ceiling).
- `nodeInfo(nodeId)` — the full canonical node record; unknown id -> `isError` payload.
- `listLeads()` — leads verbatim, with the "resolved=false stays a lead" note.

Flow: `byokWall.chat(...)` -> `stopReason "tool_calls"` -> execute locally ->
`byokWall.submitToolResults(...)` -> final text. A renewed tool request after the
single permitted round throws `OutletFailure("tool-loop-exceeded")`.

## Test results

- `proofgraph/ai`: `node --test "test/*.test.ts"` -> **8/8 pass** (7 + the
  report-hygiene test once this file exists; it was skipped-pending on the first run,
  green after).
- `packages/byok-arena`: `node --test "tests/*.test.ts"` re-run -> **103/103 pass**
  (no cell change; catalog 163 pre-wall + 5 wall.* = 168, unchanged by V6).

## Pins asserted (BOTH sides of the seam, never a return value alone)

Cell-6 side (through `wall.pins.history()` / `wall.pins.*`):

- `adapter.anthropic.chat.toolDecl` — `raw` deep-equals `outlet.tools.defs` (the
  normalized request carried the four tools).
- `adapter.anthropic.chat.input` — tool names + the user question round-tripped.
- `adapter.anthropic.normalize.toolCall.id.normalized` — the golden call id.
- `adapter.anthropic.submit.idEcho` — `{echoedId, matchesReceived:true}` — the call id
  round-tripped verbatim (TRAP 2/3 held through the outlet).
- `adapter.anthropic.submit.input` — the submitted tool result carries the REAL unused
  node id; byte-identical to the outlet's `outlet.tool.exec` pin output.
- `adapter.anthropic.submit.output` — face text/usage == pin truth.
- `adapter.anthropic.normalize.output` (last) — equals the final answer.
- `wall.call` — dispatch sequence exactly `["chat","submitToolResults"]` (both in the
  golden round and before the tool-loop refusal).
- `wall.masterSecret.gate` — `accepted:true` on the properly-constructed wall.
- `secret.leak.*` via `wall.pins.runSecretLeakScan()` — see security.

Outlet side (assembly pins, `outlet.pins.history()`):

- `outlet.ask.input` (question as sha256+length ONLY, tools offered),
  `outlet.chat.result` (same call id as the cell's normalize pin),
  `outlet.tool.exec` (output answers from the graph data; byte-equal to the cell's
  `submit.input` pin), `outlet.submit.roundTrip` (ids match the cell's `idEcho`),
  `outlet.bound.singleToolRound`, `outlet.ask.output`, `outlet.staleCheck`,
  `outlet.construct`.

Wire level (testkit capture): native first request carried the four tools; the
continuation's `tool_result` was keyed by the verbatim `tool_use_id` and carried the
unused node id; tools re-declared on the continuation.

## Security (V6 invariants)

- The answer references the REAL unused node id from the graph handed in (fixture id
  `n_3333333333333333`, `helper_unused`, unreachable from declared root
  `n_1111111111111111`).
- **No key material** in `ask()`'s return, in any tool payload, in the outlet pin
  stream, or in the graph object after the run (graph also proven unmutated by
  deep-equality against a pre-run snapshot).
- `wall.pins.runSecretLeakScan()` through the outlet path: `rawKeyFound:false`,
  `keyInUrl:false` on the clean round; **planted-secret negative control THROUGH the
  outlet** (key as ordinary question text) -> `rawKeyFound:true` with a probe-site leak
  ending in the plant's last4 (`3344`) — the scanner is proven live on this path while
  the outlet's own pins stay key-free (question is pinned digest-only; a scrub
  chokepoint redacts + pins any hit as failure class `key-leak`).
- `masterSecret` REQUIRED: dev default / empty / missing refused at the wall
  (`insecure-master-secret`); the vessel constructs properly (test secret referenced
  here by last4 only: `4242`; api test key last4 `9911`).
- This report itself is covered by a suite test (`V6 report hygiene`) asserting none of
  the test secrets serialize into this file.

## Bounds logged (no silent caps)

- `maxToolRounds = 1` — the thin-skeleton single-round bound; pinned on every ask
  (`outlet.bound.singleToolRound`), refusal class `tool-loop-exceeded` when exceeded.
- `toolOutputMaxBytes = 16384` — per-tool-result cap; truncation is character-sliced,
  marked in the payload, and pinned (`outlet.bound.toolOutputTruncated`). Not hit by
  the fixtures; declared in `outlet.construct` and in `ask()`'s returned `bounds`.
- Streaming remains deferred inside cell 6 (`*.chat.streamDeferred`) — inherited cap,
  already logged by the cell; the outlet requests non-streaming only.
- Default provider is `anthropic`; openai/gemini reachable via `opts.provider` but the
  golden fixtures exercise the anthropic path (skeleton scope).

## Failure classes (seam catalog extended)

- **key-leak** (existing, V6-tested): clean scan + negative control through the outlet;
  outlet-side scrub chokepoint redacts and pins any hit.
- **tool-loop-exceeded** (NEW, tested): renewed tool request after the single round.
- **graph-data-stale** (NEW, tested): provenance (`unused`/`roots`) references node ids
  absent from the handed-in snapshot — provenance and graph must come from the same
  ingest; id-set membership is the implemented detector (a timestamp alone cannot prove
  same-snapshot-ness). Refused at construction.
- **unknown-tool** (NEW, tested): model requests a tool outside the declared four —
  answered with an `isError` tool result (recoverable in-band), never silently dropped.
- **lead-in-edges** (reused, tested): `resolved=false` inside `edges[]` (or
  `resolved=true` inside `leads[]`) refuses the envelope — leads stay leads.
- **insecure-master-secret** (cell 6's wall class, exercised): dev default refused.

## Honest ceilings propagated

Fixture fills are `unknown` and surface as `unknown` through `trustBase` — the outlet
adds no green. `listUnused` with no provenance answers "claim: none". Leads are never
followed, never edges. The outlet's system prompt instructs claims-from-tools-only, but
the enforcement is structural: every tool answers from the handed-in data.