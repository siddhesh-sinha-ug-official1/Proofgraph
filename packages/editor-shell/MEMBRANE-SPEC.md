# MEMBRANE-SPEC — editor-shell (Tree 4) wall

`WALL_VERSION = "editor-shell-wall/1.0.0"` · face: `src/wall.ts` · conformance: `test/22-wall-conformance.test.ts` + `test/22b-wall-teardown.test.ts` (SUB200 split of the original single file)
Schema PIN carried by the wall: `schemaVersion v0`, `schemaHash 3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c` (`WALL_SCHEMA_PIN`).

## The face (typed signatures)

```ts
createEditorWall(cfg: EditorWallConfig): Promise<EditorWall>   // EditorWallConfig = CellConfig

interface EditorWall {
  wallVersion: "editor-shell-wall/1.0.0";
  bus: SelectionBus;                    // BusEvent {type:"node.select", nodeId, origin:"editor"|"graph", clock}
  update(nodes: SchemaNode[]): void;    // fresh schema nodes/verdicts → reindex + repaint, never a re-mount
  dispose(reason?): Promise<void>;      // didClose → shutdown → exit → transport/adapter teardown; idempotent
  pins: { probeCatalog(); dump(); history(); tap(id, fn) };    // the cell's diagnostic quartet, delegated 1:1
}
// + exported: WALL_VERSION, WALL_SCHEMA_PIN, and the BusEvent type re-export.
```

- **Mount lifecycle** is the factory: `createEditorWall` asserts the schema PIN, opens the cell (mount → connect → didOpen → first verdict paint), and returns the face. A failed `open()` disposes the partially built cell before the error propagates.
- **`bus`** is the cell's bus EXACTLY as it speaks today (SEAM-MAP V5). Shape adaptation to graph-view's `{type:'select', source}` is Phase-2 vessel work, not this wall.
- **`update(nodes)`** wraps the cell's node-refresh mechanism, `EditorShellCell.updateSchemaNodes` (added additively in Phase 1 — the cell previously had no path short of dispose+reopen): it reuses the exact machinery every buffer edit runs (`rebuildIndex → repaintVerdicts → emitViewport`), causally chained `editor.wall.update.nodes → editor.map.nodes.refresh → editor.map.build.* → editor.verdict.*`. No silent re-mount, no re-open, no re-didOpen.
- **Headless-first, same face both tiers:** `StubEditorAdapter` (conformance suite) and `MonacoEditorAdapter` (browser) plug into the identical `cfg.adapter` socket; `tsc -p tsconfig.monaco.json` typechecks the wall in the browser census.

## What stays a pin (reachable only through `pins`, never on the face)

The whole diagnostic surface: the 128-lead probe catalog, `dump()` snapshot (modelState, spanIndex, connState, pump, lastDiagnostics, decorations, verdicts, busLog, mountInfo, silentMutations), `history()` ordered stream, live `tap()`. Also cell-internal API that tests/demo drive directly (`hover/definition/completion/documentSymbol/…`, `buffer`, `verdict`, `index()`): neighbors get none of it through the face. The catalog can only grow (123 → 128 in Phase 1; nothing removed).

## Honest-ceiling surface

The wall adds no interpretation and fabricates no tier, verdict, or green:
- tier ≠ CT ⇒ a schema-green fill is BLOCKED (`editor.verdict.green.blocked`, renders unknown/blue);
- green additionally requires a non-empty `fill.source`, provenance present, `provenance.resolved === true` — a fabricated green delivered via `update()` renders `unknown`, loudly;
- `fill.status "unknown"` renders `unknown`; `outline === null` renders `not-yet-computed` (grey ring) — never up-shaded;
- live diagnostics may push a displayed status only DOWN (toward red).

## Failure classes

- `schema-pin-mismatch` — PIN drift at construction: `checkPin` (verified-in-sync copy `src/schema/pin.ts`) throws; probed as `editor.wall.pin.check {pass:false}` before the throw. The wall refuses to stand on a drifted schema.
- `wall-disposed` — `update()` after `dispose()`: probed as `editor.wall.update.nodes {accepted:false}` then thrown.
- Inherited loud classes stay pins: uncataloged-probe emit (bus throws), silent-mutation alarm, uri/version-guard drops, green-may-never-be-faked, stale-coordinate rebuilds.

## Versioning

`WALL_VERSION` bumps semver on any face change; additive face growth = minor, breaking = major (a new wall, negotiated at assembly level). The wall asserts its own recorded `WALL_SCHEMA_PIN` at construction against the cell's verified-in-sync copies (`src/schema/pin.ts`, `src/schema/schema.ts`) — deliberately literal so a re-synced copy under an un-re-pinned wall fails fast. The runtime loop to the REAL `packages/schema` (recomputed sha-256 of `schema.json`, canonical `gen/pin.ts` consts, behavior equality of the copies) is closed by the conformance test — the same pattern (b) as the Phase-0 swap, because tsconfig `rootDir` blocks a static cross-package import and the browser tier has no file I/O.

## Conformance contract (pins vs face — tests 22 + 22b: items 1–3 in 22, items 4–6 in 22b)

Drive the wall, then read the PINS; declared may never diverge from probed:
1. **Pin:** wall record == synced copies == canonical package (hash recomputed via node:crypto, both serializers).
2. **Bus:** an event driven through `wall.bus` deep-equals the pins' `busLog` entry and the `select.*` probe payloads, both directions, `nodeId` byte-identical.
3. **update():** the repainted `editor.verdict.gutter.paint` decisions + `dump().verdicts` equal exactly what `update()` delivered under the cell's published policy; index provably rebuilt; viewport re-emitted.
4. **Honest ceiling:** unknown→unknown, null outline→not-yet-computed, tier-G and fabricated greens never surface green through the wall.
5. **Failure classes + teardown:** `wall-disposed` named and probed; dispose idempotent, `didClose`/conn/mount teardown visible in pins.
6. **Pins delegation:** `probeCatalog()` verbatim, `tap()` live with working unsubscribe, `history()` the same stream; catalog growth additive with all `wall.*` leads cataloged.

Honest ceiling of the conformance itself: the construction-refusal branch (`pass:false` → throw) cannot be triggered without real drift, since the pins are module constants; the test proves the mechanism (`checkPin` throws the named class for both copies) rather than doctoring modules.
