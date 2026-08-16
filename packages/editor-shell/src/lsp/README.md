# editor-shell/src/lsp

S3 JSON-RPC pump: `pump.ts` (request/notify with the raw-frame firehose and settled disconnected paths), `incoming.ts` (inbound frame handling), `feature-payloads.ts` (per-feature probe payload builders), `lsp-types.ts` (types plus the method-to-probeId tables).

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `pump.ts` | 181 | S3 JSON-RPC pump: request()/notify() with raw-frame firehose + method-specific probes, id correlation via the pending map, sendWhileDisconnected settled-error paths (request resolves an error response, notify never throws), inFlightCauseRef chaining synchronous inbound frames to the outbound send, detachAll failing all pending loudly. |
| `incoming.ts` | 181 | Inbound frame handling over a closure context: malformed frames probed, responses correlated (orphans probed), server-initiated workspace/configuration answered (others get MethodNotFound), notifications dispatched (publishDiagnostics -> diagnostics handler, $/progress, log/showMessage, generic); failAllPending settles orphaned requests with error -32001. |
| `feature-payloads.ts` | 121 | Per-feature probe payload builders: emitFeatureRequestProbe (hover/definition/documentSymbol/completion request probes), emitNotifySpecificProbe (didOpen/didChange/didClose/initialized), featureResponsePayload shaping response probes per method. |
| `lsp-types.ts` | 51 | Pump types (PendingRequest, LspDiagnostic, PublishDiagnosticsParams) and the REQUEST_PROBE/RESPONSE_PROBE method->probeId tables. |
