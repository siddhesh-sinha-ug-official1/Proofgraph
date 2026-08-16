"""hub/lsp_backend_capability.py — CapabilityLspBackend implementation.

SUB200 restructure: split out of hub/lsp_backend.py (which remains the
facade, keeps the V2 design rationale docstring, and re-exports the class).
Behavior unchanged; see hub/lsp_backend.py for the full seam documentation
(measured-child-respawn, one-child bound, capability.probe.msg bridge pins,
lsp-backend-dead, EOF-closes-connection).
"""
from __future__ import annotations

import json
import threading

# hub is import-flat by design (no __init__.py) — flat imports only.
import pipeline as hub_pipeline

# Additive hub-catalog extension (assembly-owned catalog; uncatalogued emits
# raise — these registrations are what make the backend's leads legal).
for _pid, _kind in {
    "hub.lsp.backend.attach": "state",
    "hub.lsp.backend.spawn": "state",
    "hub.lsp.backend.eof": "state",
    "hub.lsp.backend.kill": "state",
    "hub.lsp.backend.write.failed": "error",
}.items():
    hub_pipeline.HUB_PROBE_CATALOG.setdefault(_pid, _kind)


def _write_framed(stream, obj) -> None:
    """Content-Length framed stdio write (LSP standard framing).  Local copy
    of the 4-line wire codec — protocol, not cell cytoplasm."""
    data = json.dumps(dict(obj, jsonrpc="2.0")).encode("utf-8")
    stream.write(b"Content-Length: %d\r\n\r\n" % len(data))
    stream.write(data)
    stream.flush()


class CapabilityLspBackend:
    """The capability wall's live LSP child bridged to the hub WS endpoint.

    Instance-mode backend: attach with `hub.attach_lsp_backend(backend)` —
    one session at a time (a second concurrent WS connection is refused by
    the bridge with lsp-backend-busy, matching the capability wall's
    one-run-at-a-time bound).  Each SEQUENTIAL session gets a fresh child
    (see measured-child-respawn in hub/lsp_backend.py)."""

    kind = "capability-lsp"

    def __init__(self, wall, log: hub_pipeline.HubLog | None = None):
        client = getattr(wall.handle, "_client", None)
        if client is None:
            raise hub_pipeline.HubError(
                "hub-bad-request",
                f"capability wall handle for {wall.lang!r} (tier {wall.tier}, "
                f"kind {wall.handle.kind}) carries no live LSP child — a "
                f"tier this low has no LSP surface to bridge; V2 refuses "
                f"rather than fabricating one")
        self.wall = wall
        self.client = client                     # the handle's LSP child owner
        self.log = log or hub_pipeline.DEFAULT_LOG
        self.received: list[str] = []            # frames delivered to the child
        self.sent: list[str] = []                # frames pushed to the WS client
        self.session_no = 0
        self._send = None
        self._close_conn = None
        self._child_alive = (client.proc is not None
                             and client.proc.poll() is None)
        self._lock = threading.Lock()
        self.log.emit("hub.lsp.backend.attach", {
            "lang": wall.lang, "tier": wall.tier,
            "handleKind": wall.handle.kind, "argv": list(client.argv),
            "batteryChildPid": client.proc.pid if client.proc else None,
            "batteryChildAlive": self._child_alive})

    # -- bridge hooks --------------------------------------------------------
    def bind_connection_close(self, closer) -> None:
        """Bridge-provided (additive server.py hook): close the CURRENT WS
        connection.  Called from the pump thread on child EOF."""
        self._close_conn = closer

    def start(self, send_to_client) -> None:
        """Per-connection setup: fresh child, fresh ledgers, pump thread."""
        self.session_no += 1
        session_no = self.session_no
        with self._lock:
            self.received = []
            self.sent = []
        self._send = send_to_client
        client = self.client

        # measured-child-respawn (LOGGED bound — see hub/lsp_backend.py).
        prev_pid = client.proc.pid if client.proc else None
        prev_alive = client.proc is not None and client.proc.poll() is None
        if prev_alive:
            client.kill()                        # taskkill /T — whole npx tree
        if client.proc is not None:
            type(client)._close_pipes(client.proc)
        client.docs = {}
        client.root_uri = None
        client.start()   # cell-owned spawn; emits capability.wire.spawn pins
        with self._lock:
            self._child_alive = True
        self.log.emit("hub.lsp.backend.spawn", {
            "session": session_no, "pid": client.proc.pid,
            "argv": list(client.argv),
            "replacedPid": prev_pid, "replacedAlive": prev_alive,
            "bound": "measured-child-respawn",
            "note": "fresh child from the SAME measured spawn form — the "
                    "editor owns the raw initialize; a second initialize on "
                    "the battery child would not be raw LSP"})

        threading.Thread(target=self._pump, args=(client._queue, session_no),
                         name=f"v2-lsp-pump-{session_no}", daemon=True).start()

    def _pump(self, q, session_no: int) -> None:
        """Child -> WS: consume the cell reader thread's queue (the cell owns
        proc.stdout), serialize one JSON-RPC message per WS text frame."""
        while True:
            msg = q.get()
            if session_no != self.session_no:
                return                            # stale generation, stand down
            if "__eof__" in msg:
                with self._lock:
                    self._child_alive = False
                self.log.emit("hub.lsp.backend.eof", {
                    "session": session_no,
                    "note": "LSP child stdout EOF — closing the WS connection "
                            "LOUDLY so the editor's disconnect probes fire "
                            "instead of hanging"})
                closer = self._close_conn
                if closer is not None:
                    try:
                        closer()
                    except Exception:  # noqa: BLE001 — already closing
                        pass
                return
            frame = json.dumps(msg)
            # capability-side pin: the same frame, on the CELL's own bus.
            self.client.bus.emit("capability.probe.msg", "call",
                                 {"direction": "recv", "message": msg},
                                 stage="bridge")
            with self._lock:
                self.sent.append(frame)
            try:
                self._send(frame)
            except Exception:  # noqa: BLE001 — WS already closed underneath us
                return

    def client_frame(self, frame: str) -> None:
        """WS -> child: parse, re-frame onto the child's stdin.  Content is
        never rewritten; server->client answers pass back the same way."""
        with self._lock:
            alive = (self._child_alive and self.client.proc is not None
                     and self.client.proc.poll() is None)
        if not alive:
            self.log.emit("hub.lsp.backend.write.failed", {
                "failureClass": "lsp-backend-dead",
                "byteLen": len(frame.encode("utf-8")),
                "note": "frame arrived for a dead LSP child — dropped LOUDLY "
                        "and NOT ledgered as received, so the session audit "
                        "names the loss lsp-bridge-drop"})
            return
        obj = json.loads(frame)
        try:
            _write_framed(self.client.proc.stdin, obj)
        except (OSError, ValueError) as exc:
            self.log.emit("hub.lsp.backend.write.failed", {
                "failureClass": "lsp-backend-dead",
                "byteLen": len(frame.encode("utf-8")),
                "detail": repr(exc)})
            return
        with self._lock:
            self.received.append(frame)
        self.client.bus.emit("capability.probe.msg", "call",
                             {"direction": "send", "message": obj},
                             stage="bridge")

    def close(self) -> None:
        """Connection ended (factory mode only calls this; in instance mode
        the bridge just releases the busy flag).  The child is deliberately
        left to the NEXT start() or to wall.shutdown() — teardown ownership
        stays with the vessel runner."""

    # -- drop-test helper ------------------------------------------------------
    def kill_child(self) -> dict:
        """Tree-kill the live child mid-session (failure-class rehearsal:
        lsp-bridge-drop / editor silent-give-up probes)."""
        pid = self.client.proc.pid if self.client.proc else None
        self.log.emit("hub.lsp.backend.kill", {
            "pid": pid,
            "note": "V2 drop test: tree-kill the live LSP child mid-session"})
        self.client.kill()                        # cell's own taskkill /T
        return {"pid": pid}
