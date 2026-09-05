"""hub/server_ws.py — the WS /lsp bridge (LspBridgeMixin, composed into
HubServer by the server.py facade).  Backend attachment, the
direction-agnostic frame loop, ledger audit."""
from __future__ import annotations

import json
from urllib.parse import urlparse

# hub is import-flat by design (no __init__.py) — flat imports only.
import pipeline as hub_pipeline
from server_lsp import LSP_RAW_RETENTION_BYTES, BridgeSession, _sha256

HubError = hub_pipeline.HubError

#: H7 pre-GitHub remediation (2026-08-16): soft cap on the retained
#: session/backend ledger — drop-oldest at insertion; `[-1]` still works.
LSP_SESSION_HISTORY_CAP = 256


def _cap_history(lst: list, cap: int) -> None:
    if len(lst) > cap:
        del lst[:len(lst) - cap]


class _BackendStartError(Exception):
    """H1: sentinel wrapping backend.start() failures so the outer handler
    tags them lsp-backend-dead rather than the generic lsp-bridge-error."""


class LspBridgeMixin:
    """HubServer's WS /lsp face (state lives on HubServerCore.__init__)."""

    def attach_lsp_backend(self, backend_or_factory):
        """The pluggable backend socket.  Pass a zero-arg factory (fresh
        backend per connection) or a live instance (single-session mode: a
        second concurrent connection is refused with lsp-backend-busy —
        matches the capability wall's one-run bound V2 will inherit)."""
        is_factory = isinstance(backend_or_factory, type) or (
            callable(backend_or_factory)
            and not hasattr(backend_or_factory, "client_frame"))
        with self._lsp_lock:
            if is_factory:
                self._lsp_backend_factory = backend_or_factory
                self._lsp_backend_instance = None
            else:
                self._lsp_backend_instance = backend_or_factory
                self._lsp_backend_factory = None
            self._lsp_instance_busy = False   # a fresh attachment is idle

    def _checkout_backend(self):
        with self._lsp_lock:
            if self._lsp_backend_instance is not None:
                if self._lsp_instance_busy:
                    raise HubError("lsp-backend-busy",
                                   "the attached backend instance is serving "
                                   "another connection (one-session bound)")
                self._lsp_instance_busy = True
                return self._lsp_backend_instance, True
            return self._lsp_backend_factory(), False

    def _release_instance(self) -> None:
        with self._lsp_lock:
            self._lsp_instance_busy = False

    def _run_bridge_loop(self, conn, session, backend):
        """Frame-pump loop.  Any exception here escapes with the failure
        class already recorded on the caller's mutable state box."""
        def send_to_client(frame: str):
            rec = session.record("s2c", frame)
            if not rec["rawRetained"]:
                self.log.emit("hub.lsp.frame.bound", {
                    "sessionId": session.session_id, "direction": "s2c",
                    "byteLen": rec["byteLen"], "bound": LSP_RAW_RETENTION_BYTES,
                    "note": "raw not retained in ledger (sha256 kept); "
                            "frame itself passed through UNTRUNCATED"})
            self.log.emit("hub.lsp.frame.s2c", {
                "sessionId": session.session_id, "sha256": rec["sha256"],
                "byteLen": rec["byteLen"]})
            conn.send(frame)

        if hasattr(backend, "bind_connection_close"):
            backend.bind_connection_close(
                lambda code=1011, reason="lsp-backend-dead":
                    conn.close(code, reason))
        try:
            backend.start(send_to_client)
        except Exception as exc:                       # noqa: BLE001
            raise _BackendStartError(
                f"{type(exc).__name__}: {exc}") from exc
        for frame in conn:
            if isinstance(frame, bytes):
                frame = frame.decode("utf-8")
            rec = session.record("c2s", frame)
            if not rec["rawRetained"]:
                self.log.emit("hub.lsp.frame.bound", {
                    "sessionId": session.session_id, "direction": "c2s",
                    "byteLen": rec["byteLen"], "bound": LSP_RAW_RETENTION_BYTES,
                    "note": "raw not retained in ledger (sha256 kept); "
                            "frame itself passed through UNTRUNCATED"})
            self.log.emit("hub.lsp.frame.c2s", {
                "sessionId": session.session_id, "sha256": rec["sha256"],
                "byteLen": rec["byteLen"]})
            backend.client_frame(frame)

    def _ws_handler(self, conn):
        path = conn.request.path
        if urlparse(path).path != "/lsp":
            self.log.emit("hub.lsp.close",
                          {"path": path, "reason": "unknown-endpoint"})
            conn.close(1008, "unknown-endpoint")
            return
        # S3: origin check — mirror the HTTP CORS policy (loopback only).
        # "null" is the serialized opaque origin from file:// pages
        # (RFC 6454); Electron production builds load via loadFile(),
        # so the renderer's Origin header is the literal string "null".
        origin = conn.request.headers.get("Origin", "")
        if origin and origin != "null":
            from urllib.parse import urlparse as _up
            o = _up(origin)
            if o.scheme not in ("http", "https") or \
               o.hostname not in ("localhost", "127.0.0.1", "::1"):
                self.log.emit("hub.lsp.close",
                              {"origin": origin, "reason": "foreign-origin"})
                conn.close(1008, "foreign-origin")
                return
        try:
            backend, is_instance = self._checkout_backend()
        except HubError as exc:
            self.log.emit("hub.lsp.busy", {"failureClass": exc.failure_class,
                                           "detail": str(exc)})
            conn.close(1013, "lsp-backend-busy")
            return

        # H10: every path from here MUST reach the finally that clears the
        # busy flag; setup/bridge loop all live INSIDE the try.
        # H1: exception classes (lsp-backend-dead / lsp-bridge-drop /
        # lsp-bridge-error) are named BEFORE hub.lsp.close, never silent.
        session = None
        failure_class = None
        error_detail = None
        try:
            session = BridgeSession(getattr(backend, "kind",
                                            type(backend).__name__), path)
            self.lsp_sessions.append(session)
            _cap_history(self.lsp_sessions, LSP_SESSION_HISTORY_CAP)
            self.lsp_backends.append(backend)
            _cap_history(self.lsp_backends, LSP_SESSION_HISTORY_CAP)
            self.log.emit("hub.lsp.connect", {
                "sessionId": session.session_id,
                "backend": session.backend_kind,
                "framing": "one complete JSON-RPC message per WS text frame"})
            try:
                self._run_bridge_loop(conn, session, backend)
            except json.JSONDecodeError as exc:
                failure_class = "lsp-bridge-drop"
                error_detail = f"malformed JSON in client frame: {exc}"
            except _BackendStartError as exc:
                failure_class = "lsp-backend-dead"
                error_detail = str(exc)
        except Exception as exc:                       # noqa: BLE001
            if failure_class is None:
                failure_class = "lsp-bridge-error"
                error_detail = f"{type(exc).__name__}: {exc}"
        finally:
            if session is not None:
                session.closed = True
            if is_instance:
                self._release_instance()
            else:
                try:
                    backend.close()
                except Exception:                      # noqa: BLE001
                    pass
            if failure_class is not None:
                self.log.emit("hub.lsp.error", {
                    "sessionId": (session.session_id
                                  if session is not None else None),
                    "failureClass": failure_class,
                    "detail": error_detail,
                    "note": "H1: named BEFORE hub.lsp.close, never silent"})
            if session is not None:
                self.log.emit("hub.lsp.close", {
                    "sessionId": session.session_id,
                    "c2sFrames": len(session.c2s),
                    "s2cFrames": len(session.s2c)})

    def audit_lsp_session(self, session: BridgeSession, backend) -> dict:
        """Echo-level bridge audit: what the bridge ledgered client->server
        must equal what the backend received; what the backend sent must
        equal what the bridge ledgered server->client.  Compared by sha256
        (raw retention is bounded).  Any mismatch is the named class
        lsp-bridge-drop — logged, returned, never silent."""
        c2s = session.shas("c2s")
        s2c = session.shas("s2c")
        backend_received = [_sha256(f) for f in getattr(backend, "received", [])]
        backend_sent = [_sha256(f) for f in getattr(backend, "sent", [])]
        ok = (c2s == backend_received) and (s2c == backend_sent)
        result = {"ok": ok, "sessionId": session.session_id,
                  "bridgeC2S": len(c2s), "backendReceived": len(backend_received),
                  "bridgeS2C": len(s2c), "backendSent": len(backend_sent)}
        if not ok:
            result["failureClass"] = "lsp-bridge-drop"
            self.log.emit("hub.lsp.drop", {
                "failureClass": "lsp-bridge-drop", **{k: v for k, v in
                                                      result.items() if k != "ok"},
                "detail": "frame ledger mismatch between bridge and backend — "
                          "a message was lost, reordered, or altered"})
        return result
