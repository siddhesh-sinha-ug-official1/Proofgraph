"""hub/lsp_backend.py — V2: the REAL capability handle behind the WS /lsp bridge.

Vessel V2 (capability wall -> editor wall) attaches `capability_wall('python')`
to the hub's pluggable LSP backend socket (`HubServer.attach_lsp_backend`).
This module is ASSEMBLY code (Phase-2 vasculature): it consumes the capability
CELL only through its wall face — the face hands over the live `Handle`
UNWRAPPED (MEMBRANE-SPEC: "handle is the live cell Handle passed through
UNWRAPPED"), and the V2 brief sanctions bridging over "handle.request(...) /
the handle's LSP child".  This backend bridges the CHILD (the raw wire),
because the editor drives its OWN JSON-RPC session (initialize / didOpen /
publishDiagnostics / server->client requests) — `handle.request()` would
re-multiplex ids and swallow server-initiated requests, which is exactly what
cell 3's transcript warns about ("definitions never arrive otherwise").

Framing conversion (the ONLY transformation; content passes through as parsed
JSON, never rewritten):

    WS side   : one complete JSON-RPC message per WS text frame (hub contract)
    child side: Content-Length framed stdio (LSP standard)

Direction-agnostic pass-through: client frames are parsed and re-framed onto
the child's stdin; child messages are read by the CELL's own reader thread
(the cell owns proc.stdout after client.start()) and consumed here from the
client's queue, then serialized one-per-frame to the WS side.  Server->client
REQUESTS (workspace/configuration and friends) are NOT answered here — they
cross to the editor and the editor's answers cross back.  (The cell's own
`_consume()` auto-answer never runs: this backend deliberately does not call
`request()/wait_notification()`.)

Honest bounds / decisions (all LOGGED, never silent):

  * measured-child-respawn — `capability()` leaves the battery's LSP child
    RUNNING inside the Handle, already initialized against the probe repo.
    A raw editor session must own its own `initialize`, and LSP forbids a
    second initialize on one server instance.  So `start()` tree-kills the
    battery child (taskkill /T — never orphans the npx tree) and respawns the
    SAME measured argv via the cell's own `LspClient.start()` (which emits
    `capability.wire.spawn` / lifecycle pins on the cell bus).  The bridged
    server is therefore a fresh process of exactly the spawn form the battery
    measured; the measured tier is untouched.  Logged: hub.lsp.backend.spawn.
  * one child at a time — unlike V1's duplicated-subprocess bound, at most
    ONE pyright tree exists per bridge session (the battery child is replaced,
    not duplicated).
  * every frame both directions is ALSO emitted on the capability cell's own
    probe bus as `capability.probe.msg` (catalogued lead, stage="bridge"), so
    the capability-layer pins carry the same uri+version the editor pins show
    — the V2 connector test asserts across both.
  * lsp-backend-dead — a client frame arriving after the child died is
    dropped LOUDLY (hub.lsp.backend.write.failed, failureClass
    lsp-backend-dead) and deliberately NOT ledgered as received, so
    `HubServer.audit_lsp_session` names the loss `lsp-bridge-drop` instead of
    pretending delivery.
  * child EOF closes the WS connection (via the bridge's additive
    `bind_connection_close` hook) so the editor's disconnect probes fire
    instead of hanging — the V2 drop test kills the child mid-session and
    watches the editor give up LOUDLY.

Backend protocol (hub/server.py socket):  start(send_to_client) ·
client_frame(frame) · close()  — plus the optional bind_connection_close(fn)
hook and the drop-test helper kill_child().

SUB200 restructure: this module is now the FACADE; the implementation (and
the additive hub-catalog registrations, which run on import) lives in
hub/lsp_backend_capability.py.  Behavior and import surface unchanged.
"""
from __future__ import annotations

# hub is import-flat by design (no __init__.py) — flat imports only.
from lsp_backend_capability import CapabilityLspBackend  # noqa: F401

__all__ = ["CapabilityLspBackend"]
