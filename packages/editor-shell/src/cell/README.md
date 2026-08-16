# editor-shell/src/cell

The composition root: `cell.ts` wires every stage at construction and open; `open.ts` runs the walking-skeleton open sequence and the wall's node-refresh path; `features.ts` the per-feature LSP helpers; `diag-flow.ts` the publishDiagnostics flow; `introspection.ts` the probeCatalog/dump/history cores; `config.ts` the CellConfig type and defaults.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `cell.ts` | 182 | Composition root wiring ProbeBus, adapter, bus, mount/buffer/pump/render/diagnostics at construction and connector/verdict/selection/index at open; delegates open/features/diagnostics/introspection to sibling modules; dispose() sends didClose+shutdown+exit only if the connector is open, then tears down selection/connector/buffer/mount/adapter. |
| `config.ts` | 41 | CellConfig type (adapter, capability, bus, schemaNodes, file identity, optional mount/connector/wallClock), DEFAULT_MOUNT (JetBrains Mono / proofgraph-darcula / utf-8 request), and clockOfRef parsing '<probeId>@<clock>' refs. |
| `open.ts` | 189 | The walking-skeleton open sequence (mount begin -> buffer.open -> index build -> capability -> connector+verdict -> connect -> didOpen -> onChange wiring -> selection bridge -> initial paint + viewport) and updateSchemaNodesCore, the wall's node-refresh path (refresh probe -> rebuildIndex -> repaintVerdicts -> emitViewport; pre-open it only replaces the node set). Buffer edits rebuild the index and arm pendingLatency BEFORE pump.notify(didChange) so synchronous diagnostics close the latency chain. |
| `features.ts` | 124 | Per-feature LSP helpers (hover/definition/completion/foldingRange/semanticTokens/documentSymbol): capabilityGuard suppresses unadvertised methods with editor.lsp.capability.unsupported; documentSymbolCore flattens the symbol tree and emits the reconcile probe (matched / symbolsWithoutNode / nodesWithoutSymbol). |
| `diag-flow.ts` | 64 | publishDiagnostics flow: uri guard (foreign batches dropped loudly), renderer onPublish (version guard inside), verdict repaint, and the keystroke-latency chain assembled from pendingLatency + didChange probe clocks. |
| `introspection.ts` | 48 | The introspection cores: probeCatalogCore/dumpCore/historyCore return real data AND emit their own cataloged probes (editor.probe.catalog/dump/history); dump aggregates modelState/spanIndex/connState/pump/lastDiagnostics/decorations/verdicts/busLog/mountInfo/silentMutations. |
