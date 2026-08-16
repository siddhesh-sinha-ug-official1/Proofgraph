# ASSEMBLY-CHANGES — editor-shell (Tree 4) · Phase 0 canonical-schema swap

Cell: `packages/editor-shell` · Canonical source of truth: `packages/schema` (READ-ONLY to this cell)
Suite after swap: **90/90 pass** (86 baseline + 4 new sync/pin tests) · import gate PASS · catalog 123 (unchanged)
Pinned canonical identity asserted by the suite: `schemaVersion v0`, `schemaHash 3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c`.

## Swap pattern per artifact

| Artifact | Pattern | Why |
| --- | --- | --- |
| `src/schema/schema.ts` | **(b) verified-in-sync** | tsconfig `rootDir: "."` + the `dist/src`/`dist/test` layout the runner and gate depend on make a direct cross-package `.ts` import un-compilable without restructuring the whole cell. The local file is now a copy of the canonical surface, and `test/21-schema-sync.test.ts` imports the REAL `packages/schema/gen/graph-schema.ts` at runtime (Node 24 type stripping; dynamic import, so tsc rootDir never binds) and asserts constant-for-constant + behavior-for-behavior equality. Drift explodes loudly — still "one schema". |
| `src/verdict/verdict.ts` tables | **(b) via the schema seam** | `WORST_TO_STATUS` deleted locally; re-exported from `src/schema/schema.ts` (the verified-in-sync copy). `decideOutline` now computes via the shared `worstOfVerdict`. |
| `scripts/gen-fixture-nodes.mjs` mint | **(a) direct import** | The generator is a plain `.mjs` run by Node — no tsconfig in the way. It statically imports `../../schema/gen/ids.ts` (Node 24 type stripping, verified working) and mints with `computeNodeIdentity`. Fixtures therefore carry REAL canonical ids; no port, no byte-sync test needed for the mint itself (test 21 re-mints every fixture node against the canonical package as a belt-and-braces gate). |
| Schema PIN | **checkPin assertion** | Test 21 imports `gen/pin.ts`, recomputes the canonical hash of `schema.json` via `canonicalJson` + `node:crypto`, and runs `checkPin`; the cell records its own copy of the PIN pair and fails fast on any drift (`failure-class=schema-pin-mismatch`). |

## Files touched

### `src/schema/schema.ts` — rewritten as verified-in-sync canonical copy
- Was: hand transcription of Tree 1's schema ("LOCAL STUB … real wiring later is an import swap"). This IS that swap.
- Now mirrors `packages/schema/gen/graph-schema.ts`: enum const arrays (`NODE_KINDS`, `EDGE_KINDS`, `LANGS`, `FILL_STATUSES`, `ORIGINS`, `TIERS`) with types derived from them (identical unions to the old hand-written ones — zero type-surface change for consumers), `SCHEMA_VERSION`/`SCHEMA_REVISION`, id patterns, `OUTLINE_WORST_ORDER` (canonical SPLIT spelling — ruling 4), `WORST_TO_STATUS` (ruling 1: `definition→blue`), `UNRESOLVED_PLACEHOLDER_PREFIX`/`isUnresolvedPlaceholder` (ruling 6), `rankWorstToken`/`worstOfVerdict` (ruling 4 shared policy).
- Cell-local names `SchemaNode`/`SchemaEdge` kept (structurally identical to canonical `Node`/`Edge`) so the cell's public surface and every consumer/test stays untouched.
- `provenance.resolved` doc comment updated to the canonical definition (ruling 7: "the extractor successfully bound this element's identity"). Behavior unchanged — the green-honesty guard still requires `resolved === true`, which is exactly "an unresolved identity never backs green".

### `src/verdict/verdict.ts` — tables now come from the schema seam
- `WORST_TO_STATUS` local literal deleted; re-exported from `../schema/schema.js` (historical export path preserved — it was public API via `index.ts`). Ruling 1 (`definition→blue`) was already this cell's recorded decision; it is now the canonical table itself.
- `decideOutline` unrecognized-token ranking (this cell's review finding, now assembly ruling 4) computed by the shared canonical `worstOfVerdict` instead of a local `indexOf` closure. Probe payload shape (`chosen`, `displayedStatus`, `unrecognizedVocab`, `statusMapping`, …) unchanged; behavior verified identical by the untouched tests 05 + 20.
- `FILL_RANK` **kept, deliberately — CELL-LOCAL extension.** It ranks FILL statuses for the live-diagnostics-may-only-push-DOWN conflict rule (red→amber upshade guard). The canonical package has no fill-severity table; this is a pin-adjacent local invariant of the editor cell, now labelled as such in a comment.
- `ORDER_STRING` (`"red>amber>blue>definition>lemma>none/green"`) kept as the human-readable label in probe payloads, pinned by test 05. The fused `none/green` spelling is banned from **data** (worstOf tokens) by ruling 4; per `gen/schema.md` it "survives only as historical prose", which is what this label is. Comment added saying exactly that.

### `demo/main.tsx` — contradictory demo-only mirror DELETED
- The old `outlineDisplay` ranked an unrecognized token **BEST** (`indexOf === -1 → OUTLINE_WORST_ORDER.length`), the exact inversion of ruling 4 and of the core's `decideOutline`. Deleted; the demo now calls the shared `worstOfVerdict` from the schema seam, so demo chips and S5 agree: unrecognized ranks WORST and renders `unknown`, never green. (Demo-only: no test asserted the old inverted behavior.)

### `scripts/gen-fixture-nodes.mjs` — canonical mint (ruling 5)
- Ad-hoc `mintId` (pipe-joined preimage including byte offsets) replaced by `computeNodeIdentity` imported directly from `packages/schema/gen/ids.ts`. Preimage is now the canonical span-free form: `"node:v0" ␟ lang ␟ kind ␟ canonicalName ␟ file ␟ path`, with `canonicalName`/`path` per `gen/schema.md` (module → moduleName; member → `module.raw` / `module::raw`); moduleName derived from the fixture file basename.
- `Node.name` intentionally stays the RAW name (`add`, `Shape.area`, …), not the qualified `canonicalName`: the LSP symbol-reconcile seam matches names against stub-server document symbols, and renaming fixture nodes is out of scope for the id-mint swap. The qualified name goes into the id preimage, which is what ruling 5 pins.
- Fixtures regenerated (`npm run gen:fixtures`): fixture SOURCE bytes are byte-identical (ids never appeared in them), so every `fixture-meta.json` sha256 is unchanged; `schema-nodes.json` ids re-minted (see semantic changes).

### `test/21-schema-sync.test.ts` — NEW (the membrane that makes pattern (b) legal)
1. Local schema constants deep-equal the canonical `gen/graph-schema.ts` exports (enums, patterns, order, worst-token table; ruling 1 + 4 asserted by value).
2. `rankWorstToken`/`worstOfVerdict`/`isUnresolvedPlaceholder` behaviorally equal the canonical implementations across a case table including the banned fused `"none/green"` token and garbage tokens.
3. `checkPin` (canonical `gen/pin.ts`) passes against the recomputed canonical hash of `schema.json` and the recorded PIN pair; drift throws `schema-pin-mismatch`.
4. Every fixture node id re-mints byte-identically via the canonical `gen/ids.ts` (catches stale fixtures as well as mint drift).

### Explicitly NOT changed
- `scripts/import-gate.mjs` / `src/gate/import-gate.ts` allow-list: **no extension needed.** The gate scans `src/**` externals only; the canonical package is reached via relative import from `scripts/` (not scanned) and dynamic runtime import from `test/` (not scanned). `src/` gained zero external imports. Gate output unchanged: externals = `monaco-editor` only, PASS.
- `src/probe/catalog.ts`: catalog stays exactly **123** entries — no pins removed, no new probe decisions introduced (the swap re-routes pure computation; every existing probe still fires with the same payload shape).
- `packages/schema`: untouched (read-only to this cell).

## Semantic changes (behavior whose meaning moved, with the forcing ruling)
- **Fixture re-mint (ruling 5):** every id in `test/fixtures/schema-nodes.json` changed to the canonical mint. No test asserted literal id strings (all lookups are `nodeByName`), so no assertion edits were needed — but the fixture data itself is semantically different (ids are now span-free canonical identities, stable across reformatting).
- **Demo outline ranking (ruling 4):** for a `worstOf` mixing recognized + unrecognized tokens, demo chips previously showed the best-ranked *recognized* token's color; they now show `unknown` (unrecognized wins as WORST), matching the core.

---

# ASSEMBLY-CHANGES — editor-shell (Tree 4) · Phase 1 wall carve

Suite after wall: **96/96 pass** (90 Phase-0 baseline unchanged + 6 wall-conformance tests) · import gate PASS (externals still `monaco-editor` only) · `typecheck:monaco` PASS · catalog **123 → 128** (additive only).
Wall identity: `WALL_VERSION = "editor-shell-wall/1.0.0"`, `WALL_SCHEMA_PIN = { v0, 3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c }`.

## Files added
- `src/wall.ts` — the wall: `createEditorWall(cfg) → { wallVersion, bus, update(nodes), dispose(), pins }` + `WALL_VERSION` + `WALL_SCHEMA_PIN` + `BusEvent` re-export. Asserts the schema PIN at construction BEFORE any mount work (probed `editor.wall.pin.check`; refuses with `failure-class=schema-pin-mismatch`); mounts via `cell.open()` (disposing the partial cell if open fails); `pins` delegates 1:1 to the cell's probeCatalog/dump/history/tap quartet. `update()` after `dispose()` throws named `failure-class=wall-disposed` (probed `accepted:false` first). Bus is exposed in the cell's OWN shape (`BusEvent{type:"node.select",nodeId,origin,clock}`) — V5 shape adaptation is Phase-2 vessel work, deliberately not done here.
- `src/schema/pin.ts` — verified-in-sync copy of canonical `packages/schema/gen/pin.ts` (same pattern (b) as `src/schema/schema.ts` and for the same reasons: tsconfig `rootDir "."` blocks a static cross-package import; the browser tier has no file I/O for a runtime hash). Sync is enforced by test 22: constants + `canonicalJson` behavior vs the REAL canonical module (dynamic import), plus an independent sha-256 recompute of `schema.json` through BOTH serializers.
- `MEMBRANE-SPEC.md` — the one-page membrane spec (face, pins, honest ceiling, failure classes, versioning, conformance contract).
- `test/22-wall-conformance.test.ts` — pins-vs-face conformance (6 tests): pin loop to canonical; bus event == busLog pin both directions with byte-identical ids; `update(nodes)` gutter decisions in pins == delivered nodes (including a fabricated green delivered through the wall being blocked to `unknown`); honest ceiling (unknown/null-outline/tier-G never green through the wall); named failure classes + idempotent teardown; pins-delegation + additive catalog.

## Files touched (all additive)
- `src/probe/catalog.ts` — +5 leads, nothing removed/renamed: new `wall` stage (`editor.wall.pin.check`, `editor.wall.mount`, `editor.wall.update.nodes`, `editor.wall.dispose`) and `editor.map.nodes.refresh` (the real node-refresh path's root probe). ProbeBus hard-rejects uncataloged emits, so the catalog was extended rather than emitting around it. 123 → 128.
- `src/cell.ts` — new public method `EditorShellCell.updateSchemaNodes(nodes, causeId?)`: the node-refresh path the wall's `update()` wraps. The cell previously had NO way to receive fresh schema nodes short of dispose+reopen; this reuses the exact machinery every buffer edit already runs (`rebuildIndex → repaintVerdicts → emitViewport`) chained to `editor.map.nodes.refresh` — never a silent re-mount, no re-open, no re-didOpen. Called pre-open it just replaces the set `open()` will index. No existing member changed.
- `src/index.ts` — `export * from "./schema/pin.js"` + `export * from "./wall.js"` (additive; `BusEvent` star-export collision is the SAME binding via re-export, legal).

## Explicitly NOT changed
- No existing test touched; all 90 Phase-0 tests pass byte-unchanged (catalog assertions were already `>=`-style).
- `scripts/import-gate.mjs` / allow-list: wall imports are all relative; externals unchanged (`monaco-editor` only). `tsconfig.json`/`tsconfig.monaco.json`: no census edit needed — `src/**/*.ts` already includes `wall.ts` in both.
- `demo/main.tsx` stays on `createEditorShellCell` — the demo is a pins consumer (drives `cell.verdict.decisions()`, `cell.probe`, etc.), which remains legal: the wall is promoted OVER the pins, not a replacement. Monaco-tier face parity is proven by `typecheck:monaco` (wall in the browser census) + the adapter-agnostic `cfg.adapter` socket.
- `packages/schema` untouched (read-only to this cell). No cross-cell imports, no bus-shape adaptation, no HTTP — Phase-2 vessels not built here.

## Wall decisions worth recording
- `createEditorWall` is async and IS the mount lifecycle (seam map face `mount(cfg) → {bus, update, dispose}`); there is no half-constructed wall state.
- `WALL_SCHEMA_PIN` is deliberately literal in `wall.ts` (not derived from the pin copy) so a re-synced copy under an un-re-pinned wall fails at construction instead of being silently absorbed.
- Honest ceiling propagates untouched: test 22 delivers a fabricated green (`source:""`) through `update()` at tier CT and a schema green at tier G — both surface as non-green with `editor.verdict.green.blocked` in the pins.

---

# ASSEMBLY-CHANGES — editor-shell · SUB200 restructure

Adversarial-round prep: every non-exempt source file in this cell now lands
under the 200-line hard ceiling. Behavior-preserving splits ONLY — no renames
of public surfaces, no semantic changes, no assertions weakened. Every original
module path REMAINS and re-exports its full historical surface (facade
pattern), so external importers (other areas, cells, hub) needed ZERO changes.
Suite after restructure: **96/96 pass** (unchanged count) · import gate PASS
(54 files scanned, externals `monaco-editor` only) · `typecheck:monaco` green ·
fixture generator outputs verified BYTE-IDENTICAL against committed fixtures
(regenerated to a temp dir + byte-compared; committed fixtures untouched) ·
`packages/schema` `schemagen --check` still exit 0.

## SUB200 restructure — old file → new modules

- `src/cell.ts` (513) → `src/cell.ts` facade (11) + `src/cell/cell.ts` (181) + `src/cell/open.ts` (189) + `src/cell/features.ts` (124) + `src/cell/diag-flow.ts` (64) + `src/cell/introspection.ts` (48) + `src/cell/config.ts` (41)
- `test/stub/stub-server.ts` (478) → `stub-server.ts` (197, keeps class + public path) + `stub-server-config.ts` (94) + `stub-server-text.ts` (186) + `stub-server-features.ts` (71) + `stub-server-init.ts` (57)
- `src/map/span-index.ts` (458) → `span-index.ts` (195, class + public path, re-exports `PositionEncoding`/`IndexedNode`) + `src/map/geometry.ts` (194, pure byte/line math + the D4 conventions block) + `src/map/build-nodes.ts` (198, node binding + innermost lookup)
- `src/verdict/verdict.ts` (452) → `verdict.ts` (199, engine + public path) + `fill-decision.ts` (196) + `tooltip.ts` (74) + `verdict-types.ts` (48)
- `src/lsp/pump.ts` (452) → `pump.ts` (181, pump + public path) + `incoming.ts` (181) + `feature-payloads.ts` (121) + `lsp-types.ts` (48)
- `scripts/gen-fixture-nodes.mjs` (430) → entry (67, same command + output order) + `scripts/fixture-gen/helpers.mjs` (63) + `fixtures-basic.mjs` (164) + `fixtures-edge.mjs` (175) + `outline-cases.mjs` (15) — outputs byte-identical (verified)
- `src/buffer/buffer-manager.ts` (420) → `buffer-manager.ts` (177, class + public path, re-exports `applyChanges`/`SIZE_CAP_BYTES`) + `buffer-state.ts` (80) + `open-probes.ts` (89) + `change-handler.ts` (99) + `roundtrip.ts` (65)
- `src/probe/catalog.ts` (396) → `catalog.ts` aggregator (46) + `src/probe/catalog/{spec,mount-buffer,conn-lsp,diag-verdict,select-map,render-gate-wall}.ts` — assembled `PROBE_CATALOG` element-for-element identical, SAME order, 128 entries; `FIREHOSE_IDS` unchanged (pinned by tests 19/19b/22b)
- `src/conn/connector.ts` (380) → `connector.ts` (184, class + public path) + `conn-types.ts` (41) + `handshake.ts` (176) + `reconnect.ts` (55)
- `test/22-wall-conformance.test.ts` (375) → `22-wall-conformance.test.ts` (191, 3 tests) + `22b-wall-teardown.test.ts` (129, 3 tests) + `test/helpers/wall-harness.ts` (90)
- `test/20-review-regressions.test.ts` (344) → `20-review-regressions.test.ts` (122, 5 tests) + `20b-review-spanmath.test.ts` (128, 5 tests) + `20c-review-protocol.test.ts` (90, 4 tests) + `test/helpers/synthetic-node.ts` (21)
- `test/03-brushing.test.ts` (306) → `03-brushing.test.ts` (164, 4 tests) + `03b-brushing-edges.test.ts` (137, 4 tests) + `test/helpers/select-payloads.ts` (32)
- `test/02-diagnostics-span.test.ts` (276) → `02-diagnostics-span.test.ts` (133, 1 test) + `02b-diagnostics-multibyte.test.ts` (124, 3 tests) + `test/helpers/diag-payloads.ts` (31)
- `src/mount/monaco/monaco-adapter.ts` (268) → `monaco-adapter.ts` (192, class + public path, re-exports `PROOFGRAPH_DARCULA`) + `darcula-theme.ts` (39) + `decorations.ts` (37) + `monaco-events.ts` (51) — all inside `src/mount/monaco/` (S9 gate)
- `test/08-lsp-messages.test.ts` (262) → `08-lsp-messages.test.ts` (142, 5 tests) + `08b-lsp-inbound.test.ts` (115, 5 tests) + `test/helpers/server-behaviors.ts` (18)
- `src/diagnostics/diagnostics.ts` (259) → `diagnostics.ts` (125, renderer + public path) + `map-diagnostic.ts` (170)
- `test/19-catalog.test.ts` (258) → `19-catalog.test.ts` (197, the WIDE scenario, unsplit — a single test) + `19b-catalog-invariants.test.ts` (54, 2 tests) + `test/helpers/catalog-consts.ts` (25)
- `test/01-buffer.test.ts` (253) → `01-buffer.test.ts` (136, 3 tests) + `01b-buffer-mutations.test.ts` (111, 3 tests) + `test/helpers/buffer-payloads.ts` (20)
- `demo/main.tsx` (213) → `main.tsx` (157, React shell) + `demo/demo-cell.ts` (84, cell wiring + display helpers)
- `test/04-green-guard.test.ts` (212) → `04-green-guard.test.ts` (116, 3 tests) + `04b-green-guard-tiers.test.ts` (74, 4 tests) + `test/helpers/green-guard.ts` (46)
- `test/stub/stub-adapter.ts` (211) → `stub-adapter.ts` (194) + `stub-adapter-defaults.ts` (24)

## Guarantees

- Facades: `src/cell.ts`, `src/map/span-index.ts`, `src/verdict/verdict.ts`,
  `src/lsp/pump.ts`, `src/buffer/buffer-manager.ts`, `src/probe/catalog.ts`,
  `src/conn/connector.ts`, `src/diagnostics/diagnostics.ts`,
  `src/mount/monaco/monaco-adapter.ts`, `test/stub/stub-server.ts` all remain
  at their original paths exporting the exact historical names. `src/index.ts`
  untouched.
- Catalog never shrinks: 128 entries, identical ids AND order (sections spliced
  in the original order by the aggregator); `assert.deepEqual(pins.probeCatalog(),
  PROBE_CATALOG)` and the firehose-set equality still pass unmodified.
- Test count 96 → 96 (splits only moved tests across files; helpers extracted
  verbatim; no assertion touched).
- Import gate: additive census only (54 files scanned, was 41 pre-split);
  `DECLARED_DEPS` / `MONACO_ONLY_PACKAGES` allow-lists byte-unchanged; all new
  monaco-touching modules live inside `src/mount/monaco/`.
- Internal-only visibility widenings (documented `@internal`): cell fields
  `cfg`/`cap`/`index_`/`pendingLatency` + `handleDiagnostics`/`repaintVerdicts`
  (consumed by the `src/cell/*` sibling modules); stub-server `doc`/`encoding`/
  `respond`/`send`/`initializeFailuresLeft`/`wordAtParams` (consumed by the
  stub-server handler modules). No pre-existing public name changed.
- No bug fixes smuggled in; none found that required flagging beyond notes in
  vessels/REPORT-SUB200-editor-shell.md.

## 2026-08-16 — Wave D pre-GitHub cluster L+E (finding L3)

- `src/util/sha256.ts`: deleted the dead export `sha256HexOfString`.  Zero
  importers under `src/` or `test/` (only the compiled `dist/` mirror
  matched, which is regenerated by the build).  `sha256Hex(Uint8Array)`
  is the only live entry point.  Pure dead-surface removal; no behavior
  change; goldens byte-stable.  File 71 → 68 lines.
