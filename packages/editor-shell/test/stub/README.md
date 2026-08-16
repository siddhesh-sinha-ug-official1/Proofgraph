# editor-shell/test/stub

The deterministic in-memory test substrate: the stub EditorAdapter with simulation hooks, stub capability, the synchronous transport pair, the scripted stub language server (with independent position math on purpose), probe assertion helpers, and the cell harness that wires them together.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `assert-probes.ts` | 68 | Probe assertion helpers: eventsOf/payloadsOf/lastPayload/assertFired/assertNeverFired/assertOrdered and normalizeHistory (drops wallNanos only). |
| `harness.ts` | 134 | createTestCell/openTestCell: loads fixture bytes+meta+nodes, wires StubLanguageServer + stub capability + StubEditorAdapter + LocalSelectionBus + StubGraphPane into a cell with wallClock -> null (deterministic); loadFixture/loadOutlineFixture/nodeByName. |
| `stub-adapter.ts` | 194 | Full in-memory EditorAdapter with simulation hooks: user/programmatic/silent edits, find/replace as a user batch, undo/redo as forced user changes, cursor moves, viewport, recorded decorations/reveals/selections; readOnly rejects user+programmatic edits (silent rewrites deliberately pass through - the forbidden case stays testable). |
| `stub-adapter-defaults.ts` | 24 | DEFAULT_MOUNT_INFO reported by the stub adapter (JetBrains Mono resolved, proofgraph-darcula, all features on). |
| `stub-capability.ts` | 48 | Tree-2 stand-in: capability(lang) -> {tier, handle} whose connect() attaches the stub server over an in-memory transport pair; failConnectTimes rejects the first N connects; connectCalls counted. |
| `stub-graph-pane.ts` | 36 | Tree-5 stand-in: records every bus event (heard/heardFromEditor), select() emits a graph-origin event, reflect() re-broadcasts a heard event for the echo scenario. |
| `stub-transport.ts` | 86 | Synchronous in-memory MessageTransports pair: FIFO delivery, JSON deep-copy over the wire, close() on either side fires onClose on both, sent/received recorded. |
| `stub-server.ts` | 197 | The scripted JSON-RPC stub language server facade: dispatches initialize/features to sibling modules, tracks one document, recomputes pattern-rule diagnostics on didOpen/didChange (stale replay switch), answers shutdown, logs every sent frame, byteSpanToRange/wordAtParams in the negotiated encoding, dropTransport for reconnect tests. |
| `stub-server-config.ts` | 94 | Stub-server config surface: DocState/DiagnosticRule/SymbolMeta/fixture-meta types, capability-advertising and misbehavior switches, DEFAULT config (stub-pyright, accept-utf8, callHierarchy/typeHierarchy deliberately absent). |
| `stub-server-init.ts` | 57 | Initialize handling: scripted failures, positionEncoding modes (accept-utf8/force-utf16/omit), capability advertising from switches, optional orphan response after init. |
| `stub-server-text.ts` | 186 | The server's INDEPENDENT position math (a second implementation on purpose): textOffsetToPosition, byteSpanToLspRange, wordAt, utf16IndexToPosition, buildDiagnostics from pattern rules (severity/tags/quickfix/relatedInformation), collectNames. |
| `stub-server-features.ts` | 71 | Feature-request handlers: hover (word-based), definition (fixture map), documentSymbol (nested tree from meta), completion (symbol names), foldingRange, semanticTokens (empty data); returns whether the method was handled. |
