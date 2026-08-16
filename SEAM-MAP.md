# Seam map — who consumes what from whom

Derived from the six Phase-0.1 inventories (verified against code, not READMEs).
This document drives the Phase-1 wall specs: a wall exposes exactly what a neighbor
consumes + the honest-ceiling surface, nothing more.

## The six vessels (wall-to-wall)

### V1 — capability wall → extractor wall
- **Consumer seam today:** `structure-extractor` `PipelineConfig.capability_fn`
  (stub: `extractor/capability.py::stub_capability` — python→CT, everything else→G).
- **Producer:** `capability-layer` `capability(lang, repo, config) → Capability{tier, handle, honestCeiling, paperTier, provenance, probeReport, probeStream}`.
- **Known friction (from inventory):** T3's `CapabilityHandle.handle` is NEVER consumed —
  `ExtractorCell._make_dock` builds its own pyright backend from `PipelineConfig`. Wiring the
  real negotiated handle requires an adapter touching `_make_dock`, not just `capability_fn`.
- **Invariant:** tier the extractor sees == tier cell 2 reports; reduced tier ⇒ reduced
  resolution (ruling 2: S-tier may NOT emit resolved edges), never a silent upgrade.
- **Also:** only 3 fixture languages exist in T2 (`fixtures.PROFILES` KeyErrors otherwise);
  `capability()` leaves the LSP server running inside the Handle — the vessel owns shutdown.

### V2 — capability wall → editor wall
- **Consumer seam today:** `editor-shell` `CellConfig` capability + its own JSON-RPC pump over
  minimal `MessageTransports {send, onMessage, onClose, close, describe}` (monaco-languageclient
  v10 was deliberately NOT used — zero lines of it exist).
- **Producer:** T2's LSP endpoint (Handle) via the backend hub; editor requests positionEncoding
  utf-8, sends didOpen/didChange(full text)/didClose, answers `workspace/configuration` with `{}`.
- **Invariant (acceptance):** inject the P2 type error end-to-end → squiggle lands on the right span.
- **Friction:** T2's handle is Python-side; the editor is browser-side → the hub must bridge
  LSP stdio↔websocket. T4's `didChange` is full-text only.

### V3 — extractor wall → graph-model wall
- **Consumer seam today:** T1's S1 ingest reads MANIFEST shapes `{module, decls, trivia, refs}`
  (span records), NOT `{nodes, edges}`. The master contract's wall spec (`ingest(nodes, edges)`)
  therefore requires a new ingest face on T1's wall: accept schema-conformant
  `{nodes, edges, leads}`, VERIFY ids via the canonical mint (recompute preimages — never trust),
  then run S4 fill → S5 T3 → S6 projections. This is wall work, not a cell change.
- **Producer:** T3 `ExtractorCell.run(root) → {nodes, edges, t3, honestCeilings, summary}`
  (its `edges` output splits resolved vs leads at probe level; envelope rule applies).
- **Invariants:** every `Node.id`/`Edge.id` byte-identical across the seam; `resolved=false`
  stays a lead, never an edge (canonical envelope: leads[] separate).

### V4 — graph-model wall → graph-view wall (THE Python↔TS vessel)
- **Consumer seam today:** `graph-view` `runGraphView(schemaJson: unknown, bus)` re-validating
  at S0; stub was `fixtures/skeleton.schema.json`.
- **Producer:** T1's graph + verdict API, serialized over HTTP/JSON by the backend hub.
- **Invariants:** rendered node/edge set == served set EXACTLY (the cheap serializer is the
  edge-dropper — connector test asserts on both cells' pins, e.g. T5's `dump().rfEdges` vs the
  hub's served payload vs T1's `dump()`); IDs byte-preserved across the language boundary;
  `unknown` renders `unknown`; canonical envelope with `leads[]` (T5 adopts it in the swap).
- **Friction:** T5 has no package entry point (deep imports or add a barrel — barrel changes
  its boundary-gate file census); its gate forbids new runtime deps and imports matching
  /tree1|tree3|tree4|monaco/ from within src/ — wire from OUTSIDE the cell.

### V5 — editor wall ⇄ graph-view wall (bus join)
- **Shapes differ today:** T4 `BusEvent{type:"node.select", nodeId, origin:"editor"|"graph", clock}`
  vs T5 `{type:'select', nodeId, source:'graph'|...}` (+ optional hover extension T4 lacks).
- **The vessel is an adapter bus** satisfying both interfaces, mapping type/origin/source/clock,
  preserving shared byte-identical nodeIds. Echo-guards exist on BOTH sides (T4 echo-guarded,
  T5 filters on literal source string 'graph') — the adapter must not create echo loops.
- **Invariant:** brushing works BOTH ways by identical ID.

### V6 — byok wall ⇄ system
- **Producer:** `byok-arena` `createCell({fetchImpl, masterSecret}).adapters` —
  `validateKey/chat/submitToolResults/estimateCost` + vault + `runArena()`.
- **Consumer:** the outer wall's AI narration face; it hands the composed graph + provenance
  + leads as conversation content/tools. `ArenaConfig.executeTool` is the tool-execution seam.
- **Invariants:** keys never cross into the frontend or any non-redacted pin; masterSecret
  injected (never the dev default); demo `--live` stays out of CI.
- **By-design absence:** T6 imports NOTHING from the graph schema (test-enforced) — the vessel
  passes the graph as DATA, never as imported types.

## Cross-cutting facts the walls must respect
- Every cell's diagnostic surface stays reachable post-wall:
  probe leads catalog counts — T1: 104, T2: 88, T3: 131, T4: 123, T5: 87, T6: 163.
- Two ORTHOGONAL tier vocabularies: depth CT/S/G/P vs provenance T1/T2/T3 — never conflate.
- T2 `dump()/history()` are module-global last-run state — not safe for concurrent
  `capability()` calls; the hub must serialize or isolate.
- T4 spans: absolute byte offsets, BOM INCLUDED, byteEnd exclusive, in the file's own encoding.
- T5's elkjs mutates layout input in place ($H counters) — golden-stream diffs must normalize.
- T6 `SECRET_REGISTRY` is module-global and unbounded across createCell() instances.
- T1's S0 writes generated artifacts if absent and gates on codegen drift — hand-editing
  generated files bricks runs.
- T2 config `now` is hardcoded "2026-07-19" — staleness math changes if wired to real dates.

## License gate (workspace-level re-check, Operating Contract 10)
Embedded (permissive): rustworkx Apache-2.0 · networkx BSD-3 · grimp BSD-2 · tree-sitter MIT ·
tree-sitter-language-pack MIT · monaco-editor MIT · react MIT · @xyflow/react MIT ·
@dagrejs/dagre MIT · vite/vitest MIT · typescript Apache-2.0.
**elkjs EPL-2.0 — weak copyleft, LOGGED:** used unmodified as an npm library by graph-view
(layout engine), dagre (MIT) present as fallback. Retained with this note; EPL-2.0 as an
unmodified library dependency does not impose copyleft on the larger work. Not silent.
Subprocess-only (any license OK): pyright (MIT anyway, via npx) · typst (Apache-2.0 CLI) ·
lake/lean (Apache-2.0) · LaTeXML (Perl artistic; NOT wired this round).
Never embedded: CodeQL engine, Sourcegraph, Understand — confirmed absent from all six cells
(T2/T5 import gates + inventory sweep).
