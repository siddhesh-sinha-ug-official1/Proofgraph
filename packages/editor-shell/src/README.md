# editor-shell/src

The editor cell's source. `cell.ts` is the SUB200 facade at the historical public path, `index.ts` the export barrel, `wall.ts` the Phase-1 membrane; each stage lives in its own directory (S0 `mount/`, S1 `buffer/`, S2 `conn/`, S3 `lsp/`, S4 `diagnostics/`, S5 `verdict/`, S6 `selection/`, S7 `map/`, S8 `render/`, S8b `probe/`, S9 `gate/`), with the schema mirror in `schema/` and the Tree-2/Tree-5 seam types in `seams/`. Rows for the small directories without their own README (`diagnostics/`, `render/`, `seams/`, `selection/`, `util/`) are folded into the table below.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests. Paths are relative to this directory.

| File | Lines | Verified purpose |
|---|---:|---|
| `cell.ts` | 11 | SUB200 facade at the historical public path: re-exports EditorShellCell/createEditorShellCell from cell/cell.ts and CellConfig from cell/config.ts; imported by tests, demo and the wall. |
| `index.ts` | 29 | Barrel exporting the cell's deliberately wide public surface (every stage module) plus the Phase-1 additions schema/pin.ts and wall.ts; the package's import surface for external consumers. |
| `wall.ts` | 181 | ASSEMBLY Phase-1 membrane: createEditorWall asserts WALL_SCHEMA_PIN via checkPin + SCHEMA_VERSION before any mount work, opens the cell (disposing the partial cell on failed open), and returns {wallVersion, bus, update, dispose, pins}; update() after dispose() probes accepted:false then throws failure-class=wall-disposed; pins delegate 1:1 to the cell quartet. Pinned by tests 22/22b. |
| `seams/bus.ts` | 35 | Tree-5 seam types (BusEvent {node.select,nodeId,origin,clock}, SelectionBus) plus LocalSelectionBus: synchronous FIFO delivery with a public log array read by dump() and tests. |
| `seams/capability.ts` | 45 | Tree-2 seam types only (no runtime code): DepthTier, JsonRpcMessage, MessageTransports (send/onMessage/onClose/close/describe), LspHandle, Capability, CapabilityFn; the cell consumes, never constructs, a Capability. |
| `util/encoding.ts` | 141 | Pure encoding/EOL helpers for S1/S7: detectBom (utf-8/utf-16le/be), decodeBytes (BOM-declared utf-16 > strict utf-8 > true-ISO-8859-1 latin1 fallback that never remaps C1 bytes), detectEol (first-occurrence EOL + mixed flag), encodeUtf8, surrogate-aware utf8ByteLength, firstDivergence. |
| `util/sha256.ts` | 71 | Zero-dependency SHA-256 (hex) used by buffer-open/roundtrip/dump probes; correctness cross-checked indirectly because tests compare its output to fixture-meta sha256 values computed by node:crypto in the generator. |
| `diagnostics/diagnostics.ts` | 125 | S4 renderer: onPublish emits diag.input, applies the version guard (stale batches dropped loudly, returns null), clears before apply, maps each diagnostic via mapOneDiagnostic, paints the marker set; exposes current()/forNode() (S5's live input)/lastAppliedVersion()/snapshot(). |
| `diagnostics/map-diagnostic.ts` | 170 | Per-diagnostic mapping: LSP range -> byte span (reversed ranges normalized AND probed malformed) -> editor range, back-conversion self-check (map.mismatch), severity map with fill contribution, innermost node attach or orphan probe, related/tag/codeAction probes, marker.set, and the DiagnosticRecord + Decoration outputs. |
| `selection/selection.ts` | 191 | S6 SelectionBridge: cursor -> innermost node -> BusEvent with the byte-identical schema id (miss/multi/debounce-policy probed); bus recv -> lookup -> reveal+highlight (foreign ids logged recv.miss); echo guard suppresses re-emits both for recv-caused cursor moves and reflected editor-origin events; timing probed both directions. |
| `render/render.ts` | 158 | S8 RenderTracker: paint() computes add/remove/keep deltas per decoration kind, applies full sets to the adapter, logs z-order collisions per line, counts paints since open/edit, emits frame probes; frameOnly, emitViewport (sorted ids in view), emitKeystrokeLatency (logical-clock chain). |
