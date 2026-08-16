# REPORT — Vessel V2: capability wall → editor wall (the LSP squiggle, end-to-end)

Laid 2026-07-20 · assembly code only — **zero cell change requests** (neither
capability-layer nor editor-shell was touched; both suites re-run green).
Files: `hub/lsp_backend.py` (the real backend on the hub's V2 socket),
`hub/server.py` (ONE additive hook, see below), `vessels/v2_hub_runner.py`
(the spawned hub process), `vessels/test_v2_squiggle.mjs` (node --test
connector suite, 4 tests), `vessels/fixtures_v2/v2_demo.py` (the demo file
with the real type error `result = "str" + 1`).

## What was laid

```
pyright 1.1.411 (cell 2's measured spawn form: cmd /c npx --yes -p pyright pyright-langserver --stdio)
   ⇄ stdio Content-Length framing                 (the child's wire)
 CapabilityLspBackend(wall)                        hub/lsp_backend.py
   ⇄ hub WS /lsp bridge (content-opaque, sha256-ledgered both directions)
   ⇄ MessageTransports over Node 24 built-in WebSocket (no new deps)
 createEditorWall({adapter: StubEditorAdapter, ...})   HEADLESS, real cell
```

- `capability_wall('python')` runs cell 2's REAL battery; the runner refuses
  to come up unless the face tier byte-equals the cell's own
  `capability.probe.measuredTier` pin (V1's `silent-tier-upgrade` guard,
  re-applied at this seam).
- The backend bridges **the handle's LSP child** (the brief's sanctioned
  alternative to `handle.request(...)`): the editor drives its OWN JSON-RPC
  session, so re-multiplexing through `request()` would swallow
  server→client requests — exactly the "definitions never arrive" failure
  cell 3's transcript warns about.  The only transformation is framing
  (stdio ⇄ one message per WS text frame); content crosses as parsed JSON,
  never rewritten, both directions, including server→client requests and
  their answers.
- `hub/server.py` additive hook `bind_connection_close`: a backend whose
  upstream child dies can close THIS WS connection loudly from its pump
  thread (websockets' `close()` is thread-safe).  Echo backend untouched;
  hub suite re-run green (34/34).

## MEASURED tier (no asserted tiers)

**CT again, live, this run** (paper CT, P2 pass, greenAllowed true — printed
by the suite from the ready line).  The test does NOT hard-require CT: it
targets diagnostics (P2-level), so an honestly-reduced tier would still
squiggle — the tier is carried verbatim into the editor's
`editor.conn.tier.guard` and asserted byte-equal at every membrane.

## Decisions recorded (the two judgment calls)

1. **measured-child-respawn (bound, logged).** `capability()` leaves the
   battery's child RUNNING and already initialized against the probe repo;
   LSP forbids a second `initialize` on one server instance, and the editor
   must own a RAW handshake.  So each bridge session tree-kills the previous
   child (taskkill /T — never orphans the npx tree) and respawns the SAME
   measured argv via the cell's own `LspClient.start()` (spawn visible as
   `capability.wire.spawn` pins).  Consequence: at most ONE pyright tree per
   session (contrast V1's duplicated-subprocess bound).  Logged:
   `hub.lsp.backend.spawn {bound: "measured-child-respawn", replacedPid, ...}`.
2. **Declared initialize enrichment (logged, never silent).** The frozen
   editor cell advertises minimal client capabilities and pyright only sends
   `workspace/configuration` when `capabilities.workspace.configuration` is
   advertised (spike-verified: without it, NO request ever arrives; with it,
   pyright sends two — sections `python`, `pyright` — and GATES analysis on
   the answers).  The assembly-side WS transport therefore enriches exactly
   one frame — the editor's `initialize` — with
   `capabilities.workspace.configuration = true`.  This states a true fact
   about the composed client: the editor pump genuinely answers
   workspace/configuration (`pump.ts` → `editor.lsp.in.configuration`).  The
   enrichment is pushed to an in-test log and asserted to have fired exactly
   once; everything else passes through untouched.

## Connector test — pins × pins (test_v2_squiggle.mjs, 4/4 OK, run twice)

| Proven | editor-shell pin | capability/hub side | result |
|---|---|---|---|
| tier honesty | `editor.conn.capability.input.tier`, `editor.conn.tier.guard` | `capability.probe.measuredTier` + `capability.wall.construct` (runner + hub `/pins/history` aggregation) | CT byte-equal at every membrane; `liveGreenAllowed` ⇔ tier==CT |
| squiggle at the RIGHT span | `editor.diag.map.span` byteStart/byteEnd computed vs the FILE BYTES (`"str" + 1` located by indexOf — never from pyright) · `editor.diag.marker.set` severity error, real pyright message | bridge ledger + `capability.probe.msg` (stage=bridge) carry the same publishDiagnostics frame | byteStart/byteEnd exact; message `Operator "+" not supported…` |
| uri+version across the seam | `editor.lsp.out.didOpen {uri,version}` · `editor.lsp.in.diagnostics {uri,version}` | `capability.probe.msg` didOpen/publish (cell 2's OWN bus) AND `session-info` from the bridge raw ledger | uri byte-identical (pyright-canonical `file:///a%3A/...` lowercase drive — REQUIRED, else the editor's uri guard drops the batch), version 1 == 1, three witnesses |
| uri/version guards | `editor.diag.uri.guard action:apply`, `editor.diag.version.guard action:apply` | — | applied, not dropped |
| gutter decision | `editor.diag.node.attach → broken node` · `editor.verdict.gutter.paint` broken=red (source lsp-live, DOWN from unknown), shout stays unknown | — | absence of diagnostics is not a verdict; live error pushes down only |
| workspace/configuration round-trip | `editor.lsp.in.configuration` (sections incl. `python`) | bridge ledger: every s2c config request id has a matching c2s response; `capability.probe.msg` counts ≥1; behavioral: pyright gates diagnostics on the answers | server→client requests reach the editor AND answers return |
| graceful teardown crossed | dispose → didClose/shutdown/exit | `session-info` `c2sMethodCounts` didClose=1, shutdown=1, exit=1; `audit 0` ok:true | no lsp-bridge-drop on the happy path |
| lsp-bridge-drop scenario | kill child mid-session → `editor.conn.reconnect` attempts [1,2], `editor.conn.handshake.fail` phase transport-open ×2, `editor.conn.transport.state` "reconnect cap reached … giving up LOUDLY, not silently" — NO hang (bounded waits) | `hub.lsp.backend.kill` + `hub.lsp.backend.eof` on the hub stream; session-2 audit ledger-consistent (a lost frame would be NAMED lsp-bridge-drop — firing path owned by hub/test_hub.py's LossyEchoBackend gate) | silent-give-up probes fire; test completes |
| no orphans | — | `capability.wall.shutdown {terminated:true}`, runner exit 0, node.exe sweep vs pre-run baseline empty (20s window) | orphaned-subprocess-tree stays closed |

## Bounds logged (no silent caps)

1. **measured-child-respawn** — above; `hub.lsp.backend.spawn` per session.
2. **initialize enrichment** — above; in-test enrichLog, asserted length 1.
3. **single-file analysis** — the frozen editor sends `rootUri: null`, so
   pyright runs in its "No source files found" default-workspace mode and
   analyzes ONLY opened documents.  Diagnostics for the open demo file are
   unaffected (spike + suite); workspace-wide analysis is out of this seam's
   scope.
4. **one session at a time** — instance-mode backend; a second concurrent WS
   connection is refused `lsp-backend-busy` (inherits the capability wall's
   one-run bound).  Sequential sessions each get a fresh child.
5. **pyright-canonical uri required** — the editor MUST didOpen with
   `file:///<lowercase-drive>%3A/...`; pyright normalizes every uri it
   publishes to that form and the editor's uri guard (rightly) drops
   non-matching batches.  Spike-verified; encoded in the test's uri builder.
6. Pre-existing hub bounds apply unchanged and stay logged: 64 KiB raw-frame
   ledger retention (`hub.lsp.frame.bound`), `/pins/history` tail bound
   (the suite overrides with `?limit=100000`).

## Failure classes (seam catalog extended in ARCHITECTURE-PHASE2.md)

- **NEW `lsp-backend-dead`** — a client frame for a dead child: dropped
  LOUDLY (`hub.lsp.backend.write.failed`), never ledgered as delivered, so
  the audit names the loss `lsp-bridge-drop`.
- `lsp-bridge-drop` — scenario exercised (kill mid-session); audit mechanism
  firing path owned by the hub suite; V2 asserts ledger consistency and that
  any mismatch would carry the class.
- `lsp-backend-busy` — inherited (instance mode), untouched.
- `silent-tier-upgrade` — guard re-applied at the runner (face vs pin).
- `orphaned-subprocess-tree` — swept (baseline node.exe diff, shutdown pin).

## Suites (all green, end state)

- Vessel: `node --test vessels/test_v2_squiggle.mjs` → **4/4 OK** (~12s warm;
  run twice back-to-back).
- Hub (server.py hook added): `python hub/test_hub.py` → **34/34 OK**.
- Cell 2 (unmodified): `python -m pytest capability/tests -q` → **124 passed**.
- Cell 4 (unmodified): `npm run test:only` in packages/editor-shell →
  **96 passed**.
