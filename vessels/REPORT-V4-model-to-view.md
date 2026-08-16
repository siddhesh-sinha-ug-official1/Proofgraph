# REPORT — Vessel V4: graph-model wall → graph-view wall (THE Python↔TS vessel)

Phase-2 vasculature. The seam: `GraphModelWall.project('graph')` canonical envelope,
serialized by the hub (`GET /graph`, bytes == `canonical_json(...)`), fetched across
the Python↔TS language boundary by `app/src/graphSource.ts`, and mounted through
`createGraphViewWall(served, bus)` — walls only, never cytoplasm. Every connector
assertion reads BOTH sides' pins: the model wall's + extractor wall's streams via
`GET /pins/history`, the hub's own log, and the graph-view wall's pins quartet.

## What was laid

| Artifact | What it is |
|---|---|
| `app/src/graphSource.ts` | The app's feeding tube: fetches `/graph` as EXACT BYTES, pin-checks `schemaVersion` (carried pin v0/3f312369…), passes hub typed refusals through VERBATIM, and runs the serializer-edge-drop gate (`verifyIdSets` + per-id byte-presence scan) against `/graph/truth`. Typed `GraphSourceError{failureClass, detail}` for every refusal: `envelope-rejected`, `envelope-version-mismatch`, `serializer-edge-drop`, `hub-unreachable`, `hub-bad-response`, plus verbatim hub classes. |
| `app/test/v4.serve.test.tsx` | The connector test (8 tests, vitest jsdom). Spawns the REAL hub python process on ephemeral ports, waits `/health`, fetches, mounts the view wall. |
| `vessels/serve_hub_v4.py` | Hub launcher: `run_pipeline(fixtures/pyrich, roots=["richpkg.core.alpha"], RICH_CFG)` (V3's exact rich config: recorded pyright, stub capability — the real capability wall is V1's seam). Prints one JSON info line; blocks on stdin; exits 0 when the parent closes the pipe. |
| `vessels/TRACE-node.json` | The SYSTEM TRACE SEED (written by the test on every run — see below). |
| Hub (assembly) change | `GET /graph/truth` + 2 new catalogued hub probes (`hub.serve.truth`, `hub.serve.truth.refused`): the envelope rebuilt from `modelWall.pins.dump()["wall"]["ingested"]` (the model wall's PIN surface — the same surface V3 asserted on in-process) serialized DIRECTLY via `canonical_json_bytes`, deliberately **bypassing the `/graph` serializer test seam**. This is the brief's "dedicated endpoint carrying project('graph') canonical json". Hub is assembly code, not a cell — no labelled cell change request needed; hub suite extended (+2 tests) and re-run green. README updated. |

No cell was modified. Zero new dependencies (transport is node:http / the hub's stdlib server).

## THE THREE-WAY EQUALITY TEST (invariant proven)

1. **(1) hub-served `/graph` bytes** parsed → node/edge/lead id sets (13/8/3, richpkg)
2. **== (2) the graph-model wall's truth**: `/graph/truth` (pin surface). Asserted id-set
   equality AND full-payload sha256 byte-equality on the healthy path, AND per-id
   byte-presence: every truth id located as the exact UTF-8 sequence `"id":"…"` inside
   the served payload bytes (a byte scan, not a string search over a re-decode).
3. **== (3) the graph-view wall's `dump()`**: `rfNodes` (placeholder ghosts excluded —
   see bounds), `rfEdges` type `resolvedEdge` ids, type `leadEdge` ids — set-equal and
   utf8-byte-identical to the truth ids across the language boundary.

Cross-boundary pin×pin (never a return value alone):
- model wall (via `/pins/history`): `ingest.accepted {13,8,3}`, `verify.nodeIds
  pass:true checked:13`, `verify.edgeIds pass:true checked:11`, `verify.leads
  pass:true checked:3`;
- extractor wall (same aggregate — the ids at their BIRTH): `extractor.t1.node.id`
  pinned ids byte-identical to the truth node set; every served edge/lead id has an
  `extractor.assemble.edge.id` mint pin;
- hub log: `hub.serve.graph` / `hub.serve.truth` byte lengths + counts equal;
- view wall pins: `ingest.node.count {accepted:13,rejected:0}`, `ingest.edge.count
  {accepted:11, resolvedTrue:8, resolvedFalse:3}` == model `ingest.accepted` counts,
  `render.edge.equality {equal:true, eaten:[], phantom:[]}`, `wall.face.result
  {nodes:16, edges:11, leads:3}` (16 = 13 schema + 3 probed ghosts).

## Other invariants proven

- **Unknown renders unknown through THREE membranes — never green.** Every truth node
  `fill.status="unknown"`, `outline:null` (no compiler anywhere on this path);
  `/verdict/<entry>` passes it through uninvented (`graph-model.wall.verdict` pin +
  `hub.serve.verdict` pin agree); view `dump().paints` per node: `fillStatus:"unknown"`,
  `fillHatched:true`, fill never `#2E7D32`, null outline → `outlineStatus:"unknown"`;
  `verdict.fill.unknownGuard` fired 13×.
- **Leads render as `leadEdge` (dashed), never `resolvedEdge`.** Type partition exact;
  `render.edge.leadGuard` fired for exactly the 3 lead ids with `style:"lead-dashed"`;
  `render.edge` styles for leads all `lead-dashed`; model wall `verify.leads` pass with
  0 violations; every lead `resolved:false` + `unresolved:` placeholder on both sides.
- **hover-unbridged surfaced honestly**: the assembly bus is select-only;
  `controller.hoverNode(...)` lands on `link.hover.unsupported` — declared, not silent.
- **Schema pin agreement across THREE carriers**: hub `/health.schemaPin` ==
  graphSource carried pin == graph-view wall carried pin (v0 / 3f312369…).
- **Clean teardown**: the launcher exits 0 on stdin close (asserted in `afterAll`; a
  hang would hard-kill AND fail the suite); recorded pyright ⇒ no LSP subprocess ever
  spawned; `tasklist` after the run shows zero python processes.

## NEGATIVE CONTROL — serializer-edge-drop (V4's raison d'être)

A doctored copy of the served payload drops one edge and one lead. Caught loudly at
TWO independent stations:
1. `graphSource.verifyIdSets(doctored, truth)` throws
   `GraphSourceError(failureClass="serializer-edge-drop")` whose `detail.divergences`
   names EXACTLY the two vanished ids (`edges.missing==[droppedEdge]`,
   `leads.missing==[droppedLead]`, `extra==[]`) — and the message carries both ids.
2. The view mounted on the doctored payload STANDS (it cannot know the truth alone —
   that is exactly why the three-way gate exists): the equality leg identifies the
   vanished ids precisely (truth − viewDump == the two dropped ids), and the pin×pin
   count mismatch is visible across the boundary (view `ingest.edge.count
   accepted==9` vs model `ingest.accepted` 8+3==11).
Pins prove which ids vanished: both are byte-present in the truth payload (pin
surface) and both carry extractor mint pins. Recovery asserted: the real hub path
re-verifies clean afterwards. (Hub-side note: `/graph`'s own guard catches a cheap
serializer BEFORE the send — hub suite test; post-send tampering is exactly what the
client-side gate exists for, and `/graph/truth` bypasses the tamperable seam.)

## Failure-class negatives (both membranes refuse independently)

- `envelope-version-mismatch` (graphSource) × `schema-pin-mismatch` (view wall) for a
  drifted `schemaVersion:"v999"` — the wall rejection carries pins
  (`wall.face.reject`, `ingest.envelope.version {present:true, ok:false}`).
- `envelope-rejected` (BOTH graphSource and the view wall) for a missing
  `schemaVersion` — pins attached, `ingest.envelope.version {present:false}`.
- `unknown-endpoint` passthrough: `GET /graphx` → typed `GraphSourceError` with the
  hub's verbatim class × the hub's own `hub.http.refused` pin.

## SYSTEM TRACE SEED — `vessels/TRACE-node.json`

`n_ccb26550281c06b8` (`richpkg.core.alpha`, the moat entry decl; also the declared
model root — `INFO.declaredRoots == [id]` cross-checked). The id proven utf8-byte-
identical at all four hops, with pin refs:
- `extractorPin`: `extractor.t1.node.id#113` (+ full minted preimage), via /pins/history;
- `modelPin`: `graph-model.wall.ingest.accepted#4` — the id is LITERALLY in the pin's
  `rootIds`; pin-surface endpoint + truth payload sha256 recorded;
- `servedEnvelope`: `/graph` byte offset 3715, payload sha256 + length;
- `viewDump`: view `ingest.node#8` + `rfNodes` presence.
Phase 3 appends the editor-selection hop.

## Bounds logged (no silent caps)

1. **`/pins/history` tail bound** (hub, 2000/stream default): fetched with explicit
   `?limit=100000` and `truncated:false` ASSERTED for every stream — the bound is
   honored out loud, never assumed away.
2. **Ghost placeholders in `rfNodes`**: the view synthesizes 3 placeholder nodes
   (`data.placeholder:true`, one per distinct unresolved lead target). They are
   EXCLUDED from the node-set equality legs and separately asserted set-equal to the
   distinct lead `dstId`s — declared render artifacts, exactly accounted, never
   conflated with served nodes (`wall.face.result nodes:16` = 13 + 3, asserted).
3. **Recorded pyright, stub capability**: no live LSP subprocess, no capability wall
   this run — `/pins/catalog` reports `capability-layer available:false` with the
   reason (asserted); wiring the real capability wall is V1's seam, not V4's.
4. **Raw-payload retention in graphSource**: the exact served bytes are kept on the
   `FetchedEnvelope` for byte-level assertions — no re-serialization ever substitutes
   for the wire bytes.
5. **`/graph/truth` deliberately bypasses the `/graph` serializer seam**
   (`HubServer._graph_serializer`): documented on the endpoint + hub README; the hub
   suite proves the truth leg stays honest while a cheap serializer corrupts `/graph`.
6. **Hub pins JSON coercion** (`default=str`, pre-existing README bound) applies to
   `/pins/history` reads; `/graph` and `/graph/truth` use the strict canonical
   serializer.

## New seam-catalog note

No NEW failure class was needed: V4 exercises the pre-catalogued
`serializer-edge-drop`, `envelope-version-mismatch`, `schema-pin-mismatch`,
`envelope-rejected` (graph-view wall vocabulary), `unknown-endpoint`,
`hover-unbridged` (probed as `link.hover.unsupported`), and the orphan guard mirrors
`orphaned-subprocess-tree`. Two client-side TRANSPORT classes were added to
graphSource's own vocabulary (`hub-unreachable`, `hub-bad-response`) — assembly-level,
documented here; they name transport failure, not seam semantics.

## Suites

- Vessel: `cd app && npx vitest run` → **17/17 OK** (v4.serve 8 + v5.bus 9 — V5
  undisturbed); `npx tsc --noEmit` clean.
- Hub (assembly, modified): `python hub/test_hub.py` → **34/34 OK** (32 + 2 new
  `/graph/truth` tests).
- Cell suites re-run after vessel work (no cell modified; proven undisturbed):
  graph-model `python -m unittest discover -s tests` → **113/113 OK**;
  graph-view `npx vitest run` → **133/133 OK**.