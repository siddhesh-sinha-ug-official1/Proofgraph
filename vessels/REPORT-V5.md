# REPORT — Vessel V5: editor bus <-> graph-view bus (the join adapter)

Status: **LANDED, green.** Vessel suite `proofgraph/app/test/v5.bus.test.tsx`: **9/9 pass** (vitest 2.1.9, jsdom).
Both cells re-run after the vessel, byte-untouched: editor-shell **96/96** (build + import gate + node --test), graph-view **133/133**.
Cell modifications: **NONE** — no ASSEMBLY-CHANGES entries needed anywhere. The vessel connects walls only.

## What was laid

```
proofgraph/app/                        (assembly code — outside all cells)
  package.json                         deps mirror packages/graph-view versions exactly; npm install run ONCE (193 packages, 20s)
  vitest.config.ts                     jsdom env + aliases @editor-shell/@graph-view -> the two cell roots
  tsconfig.json                        minimal, noEmit, paths matching the aliases
  src/busAdapter.ts                    createJoinedBus() -> { editorSide, graphSide, log, stats() }
  test/v5.bus.test.tsx                 the seam suite: both walls in one process, joined
```

- `editorSide` implements T4's `SelectionBus` VERBATIM (`emit`/`subscribe` + the `log`
  property `dump().busLog` reads — same contract as the cell's `LocalSelectionBus`).
  It is passed as `cfg.bus` to `createEditorWall`.
- `graphSide` implements T5's `GraphEventBusWithHover` VERBATIM (`emit`/`on` + inspectable
  `emitted`; `emitHover`/`onHover` deliberately ABSENT — see hover bound). It is passed as
  the bus argument to `createGraphViewWall`.
- Translation: `BusEvent{type:"node.select",nodeId,origin:"editor",clock}` ->
  `{nodeId, source:"editor"}` delivered to T5 subscribers; `{type:"select",nodeId,source:"graph"}` ->
  `editorSide.emit({type:"node.select",nodeId,origin:"graph",clock:adapterLocal})` so T4's
  busLog pin carries the received event. nodeIds cross byte-identical, never re-derived.

## Echo safety (both cells' own guards keep working)

- T4 guards by **origin**: the editor side loops emissions back to all subscribers
  (LocalSelectionBus semantics), so T4's `editor.select.echo.guard` ("own editor-origin
  event reflected back") fires on its own loopback exactly as in its home suite.
- T5 filters on the **literal source string "graph"**: graph-side emissions loop back to
  T5's own subscription where `link.echo.ignored` eats them; editor events are delivered
  with `source:"editor"`, which passes the filter (read from `src/link.ts` semantics).
- The adapter never re-forwards its own graph->editor injection (`injecting` flag), and
  cross-delivery goes editor->graph directly to subscribers (never via `graphSide.emit`,
  which is T5's *outgoing* port) — the loop has no fixed point that crosses the seam twice.

## Invariants proven (every test asserts BOTH cells' pins across the boundary)

1. **Join stands on one pin**: `WALL_SCHEMA_PIN` (T4) == `WALL_SCHEMA_VERSION/HASH` (T5)
   == v0 / 3f312369...; `editor.wall.pin.check pass:true` x `wall.pin.assert ok:true`;
   `wall.face.result` declares the served census; both pins quartets reachable
   (catalogs >=128 / >=93, additive).
2. **(a) editor->graph**: caret in `add` -> T4 `editor.select.emit.bus` nodeId ===
   T5 `link.select.in` nodeId === fixture id (byte-equal, independent JSON parses);
   `link.select.resolve present:true`; **honest headless centering** — `link.select.center`
   reports `centered:false` + "no DOM centering hook bound" (the pin read, not assumed);
   `link.select.state`/`dump().selection` landed; T4's echo guard suppressed its own loopback.
3. **(b) graph->editor**: `clickNode(unused_helper)` -> T5 `link.select.out`/`link.bus.emit`
   pins x T4 `dump().busLog` carries `{type:"node.select",origin:"graph"}` with the SAME
   nodeId; `recv.lookup found:true`, `recv.reveal highlightApplied:true`, zero `recv.miss`;
   stub editor really scrolled (adapter.revealed).
4. **(c) NO ECHO STORM — exact counts, not >=**: one select each way produces exactly
   editorSide.log=2 (origins ["editor","graph"]), graphSide.emitted=1,
   forwarded 1x1, dropped 0; T4: emit.bus=1, recv.bus=1, echo.guard=2 (1 suppressed);
   T5: select.in=1, select.out=1, bus.emit=1, echo.ignored=1, select.state=2, unknownId=0.
   A loop would runaway every one of these.
5. **(d) unknown id no-crash**: editor selects `double` (not served to T5) ->
   `link.select.in` byte-equal -> `resolve present:false` -> `link.select.unknownId`
   ("no-op, not a crash"), zero centers, selection stays null — then a valid select still
   crosses (liveness after the branch).
6. **(d2) skeleton fixture, brief-literal, both directions**: editor id unknown to the
   skeleton universe (unknownId fires); skeleton "A" unknown to clean.py (T4
   `recv.miss idNotInThisFile`, busLog still carries "A", zero reveals); leads stayed
   leads through the join (`wall.face.result` 3 nodes / 2 rendered edges / 1 lead).
7. **Hover degradation probed**: `hoverNode` -> T5 `link.hover.out` + `link.hover.unsupported`
   ("select-only"); `link.bus.subscribe eventTypes:["select"]`; nothing reaches T4
   (recv count + editor bus log unchanged); adapter log carries the `hover-unbridged`
   config entry.
8. **Origin-spoof guard**: graph-origin injected at the editor port and editor-source
   injected at the graph port both stay LOCAL — the victim cell's own guard probes them
   (T4 `recv.miss`, T5 `unknownId`), absence proven on the far cell's pins, both drops
   logged `bus-origin-spoof`, `stats().dropped === 2`.
9. **Teardown**: after `editorWall.dispose()` + `controller.dispose()` a click neither
   crashes nor crosses (recv/select.in counts frozen); second dispose idempotent.

## Failure classes (seam catalog extended in ARCHITECTURE-PHASE2.md)

- **bus-origin-spoof** (NEW): an event claiming the far side's identity injected at the
  wrong bus port is never cross-forwarded — dropped + logged; each cell's own guard
  probes the local delivery. Prevents fabricated identity AND a family of echo storms
  (a spoofed "editor" event forwarded to T5 would fabricate an editor selection).
- **hover-unbridged** (NEW, degradation): T4's `BusEvent` union has no hover type, so
  hover cannot pass through this round. Degrade path: graph side exposes no
  `emitHover`/`onHover` -> T5 itself probes `link.bus.subscribe ["select"]` and
  `link.hover.unsupported` per soft-brush; adapter log declares it at join time.
- **bus-shape-mismatch** (exercised in adapter guards): a non-`node.select`/non-`select`
  event at either port is dropped + logged, never forwarded.
- **bus-echo-storm** (tested-against): bounded-exact event counts in test (c).

## Bounds logged (no silent caps)

- **One editor + one graph view** is this round's assembly shape: T5 echo-filters on the
  literal source `"graph"`, so two graph views on one joined bus would ignore each other
  (T5's own known limitation, noted in its link.ts; a per-view origin token is a future
  membrane round). Logged in the adapter header + a `config` log entry.
- **Hover unbridged** (above) — select-only linking through the join.
- **Injected clock is adapter-local**: graph->editor BusEvents carry the adapter's own
  monotonic `clock`, not T4's probe clock (T4 treats it as payload; its own emissions
  keep using their resolve-probe clock).
- **Shared-universe envelope for the shared-ID cases**: skeleton ids (A/B/C, lean) cannot
  exist in the editor's clean.py, so byte-identical brushing cases (a)-(c) serve T5 a
  canonical envelope built from the editor fixture's OWN canonically-minted nodes
  (minus `double` -> the natural unknown). The brief's skeleton fixture is still mounted
  verbatim for case (d2) both directions. This is a fixture-topology decision, not a cap.
- **npm install run ONCE** in `proofgraph/app` (193 packages; dep versions mirror
  packages/graph-view exactly: react 18.3.1, react-dom, @xyflow/react ^12.3.0, elkjs
  ^0.9.3, @dagrejs/dagre ^1.1.4, vitest ^2.1.8, jsdom ^25.0.1, @testing-library/react
  ^16.1.0, typescript ^5.5.4, vite ^5.4.8, @vitejs/plugin-react ^4.3.1). No installs in
  any cell.

## Sanctioned patterns used

- Editor wall mounted headless on the cell's OWN stubs imported from OUTSIDE the cell
  (`packages/editor-shell/test/stub/{stub-adapter,stub-server,stub-capability}`) — the
  same `cfg.adapter` socket both tiers share; fixture bytes/meta/nodes read from the
  cell's `test/fixtures` byte-for-byte.
- Cross-package imports via vitest aliases (`@editor-shell`, `@graph-view`) + relative
  type imports in `busAdapter.ts`. graph-view's boundary gate scans only its own src;
  editor-shell's import gate likewise — both gates re-ran green after the vessel.
- Cells reached ONLY through `createEditorWall(...)` / `createGraphViewWall(...)`; every
  assertion reads `wall.pins.{history,dump,probeCatalog}` — pins vs pins across the seam,
  never a return value alone.
