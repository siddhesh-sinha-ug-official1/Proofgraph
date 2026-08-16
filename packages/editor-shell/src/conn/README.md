# editor-shell/src/conn

S2 connector: `connector.ts` honors (never decides) the capability tier and tracks one transport with a single bounded reconnect loop (`reconnect.ts`); `handshake.ts` negotiates initialize/positionEncoding and emits the tier guard; `conn-types.ts` the state/option types.

## Files (verified)

Line counts and verified-purpose lines below are copied verbatim from the adversarial claim audit (`proofgraph/audit/AUDIT-editor-shell.json`); each purpose line was written from the code itself and checked against the file's tests.

| File | Lines | Verified purpose |
|---|---:|---|
| `connector.ts` | 184 | S2 connector class: honors (never decides) the capability tier, opens the transport with scrubbed-URL/redacted-secret probes, runs the handshake, tracks ONE current transport (stale wires ignored; a close during a handshake belongs to its attempt), and triggers a single bounded reconnect loop; dispose closes the transport and detaches the pump. |
| `conn-types.ts` | 41 | Connector state/option types: ServerCapabilitySummary (8 boolean providers), ConnState (phase/positionEncoding/serverInfo/reconnectAttempts), ConnectorOptions with DEFAULT (3 attempts, zero backoff, request utf-8). |
| `handshake.ts` | 176 | The initialize handshake: sends initializeParams (utf-8 positionEncodings request), negotiates positionEncoding (absent = LSP-default utf-16), summarizes advertised capabilities, logs missing optional capabilities as a degrade, records serverInfo, sends initialized; plus emitConnectProbes (capability.input + tier.guard - liveGreenAllowed only at CT) and scrubUrl/describeSafely. |
| `reconnect.ts` | 55 | Bounded reconnect attempts: per attempt emits editor.conn.reconnect {attempt, maxAttempts, backoffMs}, waits the backoff, stops cold if disposed, reopens via the host; on success calls notifyReopened (re-didOpen); cap exhaustion emits a final transport.state closed naming the cap. |
