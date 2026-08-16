# MEMBRANE-SPEC — byok-arena (Tree 6, the AI outlet)

**Wall:** `src/wall.ts` · `WALL_VERSION = "byok-arena-wall/1.0.0"` · consumed by SEAM-MAP V6 only.

## The face (typed, same normalized shapes as `src/interface.ts`)

```ts
createByokWall(config: {
  masterSecret: string | Buffer;      // REQUIRED — dev default refused (see failure classes)
  fetchImpl?: typeof fetch;           // injectable transport: golden/fake for tests, live = one argument
  retry?; now?; nanoClock?;           // determinism injection, unchanged from the cell
}): ByokWall

ByokWall.validateKey(provider, apiKey)        → Promise<{valid, models, error?: AdapterError}>
ByokWall.chat(provider, req)                  → Promise<ChatResult>   // req: {apiKey, model, messages, tools?, maxTokens?, stream?, signal?}
ByokWall.submitToolResults(provider, req)     → Promise<ChatResult>   // req: {apiKey, model, messages, results[], tools?}
ByokWall.estimateCost(provider, model, usage) → number
ByokWall.pins → { probeCatalog(), dump(), history(), tap(id, fn), runSecretLeakScan() }
```

All four methods delegate to the cell's own adapters/cost machinery (`createCell()` is
wrapped, never reimplemented). Keys travel per request as arguments; no key is ever
returned, stored by the wall, or visible in any pin except as `{present,last4,provider,keyLen}`.

## What stays a pin (reachable through `pins`, not on the face)

Vault store/retrieve/revoke, `runArena()`, the ProbeBus object, the three adapter
instances, the price table, the testkit, redaction internals. Neighbors consume the
face; diagnostics go through the quartet. The pre-wall catalog (163 leads) is intact;
the wall added 5 `wall.*` leads (168 total) — a wall never deletes a pin.

## Honest-ceiling surface

- `validateKey`: **valid ≠ spendable.** List-models proves auth, not balance; the
  `adapter.*.validateKey.honestCeiling` pin says `spendable:"unknown"` and the wall's
  return shape carries no extra spendability/green claim (conformance-asserted).
- `estimateCost`: unpriced models return **0 explicitly** via `cost.estimate.unpricedModel`
  — never a fabricated number; the table is a snapshot (`snapshotWarn` on every estimate).
- Arena verdict (a pin, not a face method) stays task-scoped (`arena.honestCeiling`).
- Streaming is deferred and logged (`*.chat.streamDeferred`) — a cap, never silent.

## Failure classes

Raised by the wall as `WallRefusal{failureClass}`:
- `insecure-master-secret` — construction with the cell's dev default (`…CHANGE-ME`),
  empty, or missing `masterSecret`. The CELL keeps its default for standalone runs;
  the assembled face refuses it. Thrown before any cell exists (so not probeable);
  the accept branch is probed on `wall.masterSecret.gate`.
- `unknown-provider` — dispatch to a provider outside `anthropic|openai|gemini`
  (probed on `wall.reject`, recorded on the error surface).
- `schema-absence-violated` — the by-design schema absence stopped holding (below).

Passed through UNCHANGED from the cell: `AdapterFailure` with kind
`invalid_key | rate_limited | quota_exhausted | overloaded | bad_request | unknown`,
and the vault's scope-violation throws. The wall never remaps or softens them.

## Versioning + schema stance (deviation from the generic wall rule, by design)

`WALL_VERSION` exported and probed on `wall.construct`. **NO schema PIN assert:** this
cell is schema-absent BY DESIGN — it imports nothing from `packages/schema` and mints
no graph elements (the vessel passes the graph as DATA, never as imported types).
The absence is itself the pin, enforced statically by the import-boundary gate
(src imports = `node:crypto` + in-cell relative only; `wall.ts` is inside that census)
and dynamically at wall construction: `wall.schemaAbsence.gate` asserts no node/edge
probe kinds and no `schema.*` leads exist, refusing with `schema-absence-violated`.

## Conformance contract (`tests/wall-conformance.test.ts` — gates + pins/catalog · `tests/wall-conformance-face.test.ts` — pins vs face)

Declared may never diverge from probed: chat + submitToolResults rounds on the fake
transport must deep-equal `adapter.*.normalize.output` / `adapter.*.submit.output`
(+ id/args trap pins and `submit.idEcho`); `estimateCost` must equal
`cost.estimate.output`; `validateKey` models must equal `adapter.*.validateKey.response`;
`runSecretLeakScan()` via `pins` must report `rawKeyFound:false` on a clean 3-provider
round AND `true` on a plant driven through the face (live-scanner negative control);
`pins.dump()` must never contain a plaintext key or the master secret; the dev-default
refusal and both construction gates must hold; catalog 163 → 168 additive-only.
