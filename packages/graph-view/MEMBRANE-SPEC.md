# MEMBRANE-SPEC — graph-view (Tree 5) — `graph-view-wall/1.0.0`

The wall is the cell's minimal, clean, versioned, typed face (`src/wall.ts`),
promoted OVER the diagnostic pins, never replacing them. It exposes exactly what
the seam map says neighbors consume — V4: a served canonical envelope in, a
render handle out; V5: the shared-ID event bus — plus the honest-ceiling surface.
Nothing else crosses. No cross-cell imports, no bus-shape adaptation, no HTTP:
Phase-2 vessels do that OUTSIDE this cell.

## The face (typed signatures)

```ts
createGraphViewWall(schemaJson: unknown, bus: GraphEventBusWithHover, opts?: WallOptions)
  : Promise<{ cell: GraphViewCell; pins: WallPins }>   // the whole face
WALL_VERSION = "graph-view-wall/1.0.0"
WALL_SCHEMA_VERSION = "v0"; WALL_SCHEMA_HASH = "3f312369…6043d9c"  // the carried pin
WallOptions = { capConfig?: Partial<CapConfig> }       // cap passthrough ONLY — every cap stays probed + bannered
WallPins    = { probeCatalog(); dump(); history(); tap(id, fn) }   // delegates to the cell's existing quartet
GraphViewWallError = Error & { failureClass; pins: WallPins | null }
```

- `schemaJson` must be the canonical envelope `{schemaVersion:"v0", nodes, edges, leads}`
  (assembly ruling 3); ingest validates + pin-checks it, unchanged by the wall.
- `cell` is the cell's existing `GraphViewCell` handle (rfNodes/rfEdges/cap/banner/
  controller/engine/bus + quartet) — promoted as-is, additive-only.

## The bus shape, verbatim (src/eventBus.ts — V5 adapts to this, the wall does not adapt)

```ts
interface GraphEventBus {
  emit(evt: { type: "select"; nodeId: string; source: "graph" | "editor" | string }): void;
  on(type: "select", cb: (evt: { nodeId: string; source: string }) => void): () => void; // returns unsubscribe
}
interface GraphEventBusWithHover extends GraphEventBus {  // optional extension
  emitHover?(evt: { type: "hover"; nodeId: string; source: string }): void;
  onHover?(cb: (evt: { nodeId: string; source: string }) => void): () => void;
}
```

A hover-less bus degrades to select-only linking OUT LOUD (`link.hover.unsupported`).
Echo filter: incoming events with `source === "graph"` are ignored, probed
(`link.echo.ignored`) — the Phase-2 adapter must not create echo loops.

## What stays a pin (reachable through `pins`, never on the face)

The full probe stream (93 cataloged leads incl. the 4 wall leads `wall.construct`,
`wall.pin.assert`, `wall.face.result`, `wall.face.reject` — stage "W"), the
CellDump internals (model, paints, elkIn/elkOut, rejects, selection), causal
chains, golden-stream determinism. Diagnostic truth, not neighbor API.

## Honest-ceiling surface

- `fill:"unknown"` renders hatched grey, `outline:null` renders a grey ring — NEVER
  green, at pin level, on the declared face, and in the DOM (conformance-gated).
- Caps are never silent through the wall: `wall.face.result` declares
  `capMode`+`bannerShown` equal to the `cap.log` pin; light-only keeps all nodes.
- `resolved:false` stays a dashed LEAD through the wall (`render.edge.leadGuard`);
  promotion throws. The wall verifies verdicts (`verdict.outline.worstOfCheck`),
  it never recomputes or upgrades them.

## Failure classes

| class | raised by | meaning |
| --- | --- | --- |
| `schema-pin-mismatch` | wall (`GraphViewWallError`) | construction pin assert failed, or served `schemaVersion` fails the pin |
| `envelope-rejected` | wall (`GraphViewWallError`) | served envelope missing `schemaVersion` (ruling 3); payload was refused whole |
| `EdgeSetViolation` / `NodeSetViolation` / `LeadPromotionViolation` | cell, through the wall UNCHANGED | eaten/phantom edge, vanished node, promoted lead |

Wall rejections carry `pins` (post-ingest: the full quartet; pre-cell: catalog +
history/tap, `dump()` honestly refuses). Every refusal is probed (`wall.face.reject`).

## Versioning + pin

`WALL_VERSION = "graph-view-wall/1.0.0"` (semver; face changes bump it). The wall
CARRIES the schema pin (v0 / 3f312369…) as literal copies and asserts them against
canonical `gen/pin.ts` at construction (plus the `SCHEMA_VERSION` cross-check) —
it refuses to stand on a drifted or partially regenerated schema package.

## Conformance contract (`src/wall.conformance.test.tsx` gates E/A/B, jsdom + `src/wall.conformance.bus.test.ts` gates C/D/F, node; runs in the cell suite)

Pins vs face — declared may never diverge from probed: (A) `dump().rfNodes/rfEdges/
leads` set-equal the SERVED envelope, declared arrays identical (by reference) to the
pinned arrays, `render.edge.equality` agrees; (B) served-unknown renders unknown in
pins, paint, and mounted DOM; (C) select IN/OUT through the wall's bus equals the
`link.*` pins and `dump().selection`; (D) rejections are the named classes above with
pins attached and `wall.face.result` absent; (E) carried pin == canonical pin
(extracted-constant equality); (F) caps bannered, stream fully cataloged (no dark leads).
