# Test-agent guide — editor-shell cell (Tree 4)

> [Adversarial-claim-audit note, 2026-08: HISTORICAL build-round document, kept
> as the harness/fixture reference. Paths below name the original build home
> `A:/24lean-push/editor-shell`; the cell now lives at
> `proofgraph/packages/editor-shell` (run `npm test` there). The catalog has
> since grown 121 → 128 leads (ASSEMBLY Phase 1 wall) and the suite is 96
> tests across 31 files (SUB200 split). Harness/fixture facts below remain
> accurate.]

You are writing merge-gating tests for one cell of ProofGraph. Read this whole file;
it contains everything you need. **Do not edit anything under `src/` or another
agent's test files.** If you find a src bug, put it in your structured output
(`srcIssues`) and keep your test written to the SPEC (it may stay red — say so).

## Build & run (use your OWN outDir — six agents run concurrently)

```
cd A:/24lean-push/editor-shell
npx tsc -p tsconfig.json --outDir dist-<yourname>
node --test dist-<yourname>/test/<your-file>.test.js
```

`npm run build` / `scripts/run-tests.mjs` use the shared `dist/` — do NOT use them
(you would race the other agents). Re-run tsc after every edit.

## Non-negotiable conventions

1. **Every assertion reads PROBE OUTPUT** (Probe Density Contract rule 7). Return
   values may be asserted additionally, never instead.
2. **Test titles name the failure class first**, e.g.
   `test("silent rewrite: buffer never mutates without a user/API cause", ...)`.
3. Tests must be deterministic — the harness already injects `wallClock: () => null`.
   Never assert on `wallNanos`.
4. Use `node:test` + `node:assert/strict` (no other frameworks exist here).

## Harness API (`./stub/harness.js` — import with .js extension)

```ts
const h = await openTestCell("type-error.py", opts?);  // build + open
const h = createTestCell("clean.py", opts?);           // build only (then await h.cell.open())
// h: { cell, adapter, bus, graph, server, capInfo, meta, nodes }
```

`opts`: `tier` ("CT" default; "G" for the grammar-floor tests), `schemaNodes`
(override node list), `mountInfo` (override StubEditorAdapter's reported font/theme),
`mount` (cell mount config), `connector` ({maxReconnectAttempts, backoffMs}),
`failConnectTimes` (reject first N handle.connect calls),
`serverCfg` (Partial<StubServerConfig>):
- `positionEncodingMode`: `"accept-utf8"` (default) | `"force-utf16"` | `"omit"` (⇒ utf-16)
- `advertise`: `{ hover, definition, documentSymbol, completion, foldingRange, semanticTokens, callHierarchy, typeHierarchy }` (booleans; callHierarchy/typeHierarchy default false)
- `behaviors`: `{ staleOnNextChange, orphanResponseAfterInit, progressOnOpen, requestConfiguration, failInitializeTimes }`

Other harness exports: `loadFixture(name)`, `loadOutlineFixture()`, `nodeByName(h.nodes, "add")`.

`h.cell` (class `EditorShellCell`): `open()`, `dispose()`, `probeCatalog()`, `dump()`,
`history()`, `tap(probeId, cb)`, `hover(pos)`, `definition(pos)`, `documentSymbol()`,
`completion(pos)`, `foldingRange()`, `semanticTokens()`, `index()` (SpanIndex),
`probe` (the ProbeBus), `buffer` (BufferManager: `roundtripCheck()`, `noteUndoRedo(op, before, after)`,
`silentMutationCount()`, `state()`), `verdict` (VerdictEngine: `decideOutline(node, null)`,
`hoverTooltip(node)`), `pump`, `connector`, `render`.

`h.adapter` (StubEditorAdapter): `simulateUserEdit(changes)`, `simulateSilentRewrite(changes)`,
`simulateFindReplace(find, replace)`, `simulateUndo()`, `simulateRedo()`,
`moveCursor(pos, extraSelections?)`, `setViewport(a, b)`, `decorationsByKind` (Map),
`revealed` (TextRange[]), `getText()`, `getVersionId()`.
`ContentChange = { rangeOffset, rangeLength, text }` — **utf-16 offsets** into model text.
`Pos = { line, column }` — 1-based, utf-16 columns.

`h.graph` (StubGraphPane, the Tree 5 stand-in): `select(nodeId)` (graph-origin bus event),
`reflect(busEvent)`, `heard`, `heardFromEditor()`.
`h.server` (StubLanguageServer): `dropTransport()`, `currentDocVersion()`, `log`.
`h.capInfo.connectCalls`. `h.bus.log` — every BusEvent.

## Probe assertions (`./stub/assert-probes.js`)

`eventsOf(bus, id)`, `payloadsOf(bus, id)`, `lastPayload(bus, id)`,
`assertFired(bus, id, atLeast?)`, `assertNeverFired(bus, id)`, `assertOrdered(bus, [ids])`,
`normalizeHistory(events)` (strips wallNanos for determinism comparison).
`bus = h.cell.probe`; `bus.firedProbeIds()`, `bus.byKind(k)`, `bus.causeChain(event)`.

## Fixtures (test/fixtures/, regenerable via `npm run gen:fixtures` — do NOT edit by hand)

| fixture | nodes (name → fill/origin/outline) | server script | expected |
|---|---|---|---|
| `clean.py` | module `clean` blue/given/null; `add` green/checked/{green:[green]}; `double` green/**assumed**/{red:[green,amber,red]}; `unused_helper` **unknown**/checked/null; `foreign_fn` (span in OTHER file) | no diagnostics | — |
| `type-error.py` | `add` green/checked; `double` green/checked/null; `broken` **stale green**/checked (live must win red) | error on `undefined_name` (severity 1, quickfix, relatedInformation on `def broken`); warning on `unused_var` (severity 2, tags:[unnecessary]) | `meta.expected.errorByteStart=121`, `errorByteEnd=135`, `warnByteStart/End` |
| `multibyte.py` | `rocket` green(stale)/checked | error on `undefined_name` (after `🚀→é` on the same line; multibyte comment line above) | `errorByteStart=57`, `errorByteEnd=71`, `errorLine0=2`, `errorCharUtf16` |
| `whitespace.py` | `spaced` unknown/checked (span offsets INCLUDE the 3 BOM bytes) | none | `meta.sha256`, BOM+CRLF+trailing-ws+tab |
| `nested.py` | class `Shape` green/{amber:[green,amber]}; `Shape.area` green/{green}; `Shape.name` unknown/null — **nested spans** | symbols incl. extra child `__str__` with NO matching node | — |
| `tier-g.tex` | one section node whose schema fill CLAIMS green (source "schema-claims-green-without-compiler") | none | use `tier:"G"` |
| `outline-fixture.json` | `[{caseName, worstOf|null, expectedChosen, expectedStatus}]` — drive `h.cell.verdict.decideOutline(node, null)` with synthetic nodes | | |

`meta` fields: `uri, languageId, lang, bomBytes, eol, byteLength, sha256, expected`.
Node ids are opaque strings minted by the Tree 1 stub generator — always compare
string-identical, never re-derive.

## Behavioral facts you need (so you don't rediscover them)

- The in-memory transport delivers **synchronously**; diagnostics for `didOpen`
  arrive during `open()`. After `simulateUserEdit`, the server re-checks the new
  text and publishes synchronously (removing the error text ⇒ empty batch ⇒
  `editor.diag.clear` + a marker paint with 0 decorations).
- The cell sends **full-text** didChange (`incremental:false`).
- `LocalSelectionBus` reflects an editor emission back to the cell's own
  subscription, so `editor.select.echo.guard` with
  `{suppressedReEmit:true, reason:"own editor-origin event reflected back"}` fires
  on EVERY editor-origin emit — that's the designed guard, assert on it.
- `graph.select(id)` drives the recv path (`recv.bus → recv.lookup → recv.reveal`),
  and a final `echo.guard {suppressedReEmit:false}` fires after a clean recv.
- Verdict repaints happen at open AND after every diagnostics batch; use the LAST
  `editor.verdict.gutter.paint` per nodeId.
- Declared keystroke→diagnostic feel budget: `endToEndClockDelta ≤ 400` logical
  ticks (assert ≤ 400 and also record the observed value in an assertion message
  or comment).
- Reconnect: `h.server.dropTransport()` → `editor.conn.reconnect` (attempt 1..N,
  maxAttempts logged) → on success the cell re-sends didOpen. `failConnectTimes`
  makes attempts fail. Cap exhaustion emits a final
  `editor.conn.transport.state {phase:"closed", detail:"reconnect cap reached…"}`.
- `cell.dispose()` sends didClose + shutdown + exit; `editor.lsp.out.didClose` must fire.
- Malformed-frame / orphan-response paths: `serverCfg.behaviors.orphanResponseAfterInit`
  fires `editor.lsp.correlate.orphanResponse`. For a malformed frame, build a
  `MessagePump` directly with `createTransportPair()` from `./stub/stub-transport.js`
  and send garbage from the server side.
- Import gate: `runImportGate(probe, files)` + `extractImports(src)` from
  `../src/gate/import-gate.js` are pure — feed synthetic `ScannedFile`s for the
  violation/leak cases, and walk the real `src/` with node:fs for the clean case.
- `PROBE_CATALOG` is exported from `../src/probe/catalog.js` (121+ specs, `firehose` flags).

## Structured output you must return

```json
{
  "testFiles": ["test/NN-name.test.ts", ...],
  "allGreen": true,
  "testCount": 12,
  "srcIssues": [{"file": "src/...", "description": "...", "suggestedFix": "..."}],
  "notes": "anything the integrator must know"
}
```
