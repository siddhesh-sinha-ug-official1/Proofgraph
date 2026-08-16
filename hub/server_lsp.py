"""hub/server_lsp.py — LSP bridge primitives: backend socket protocol,
the shipped echo backend, and per-connection frame ledgers.

SUB200 restructure: split out of hub/server.py (which remains the facade
and re-exports EchoLspBackend / BridgeSession / LSP_RAW_RETENTION_BYTES).
Behavior unchanged.
"""
from __future__ import annotations

import hashlib
import threading

#: raw-frame retention bound for bridge session records (sha256 always kept;
#: the raw text is retained only up to this many utf-8 bytes — bound LOGGED
#: via hub.lsp.frame.bound, never silent).
LSP_RAW_RETENTION_BYTES = 65536


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class EchoLspBackend:
    """The shipped loopback backend: every client frame is echoed back
    byte-exactly.  `inject(frame)` simulates a SERVER->CLIENT request
    (e.g. workspace/configuration) so the reverse direction is testable
    before V2 attaches the real capability handle.

    Backend protocol (what V2's real-handle adapter must implement):
        start(send_to_client)   called once; keep the callable, it is the
                                only way frames reach the editor side
        client_frame(frame:str) one complete JSON-RPC message, editor->backend
        close()                 connection ended; release resources
    """

    kind = "echo-loopback"

    def __init__(self):
        self.received: list[str] = []   # frames that reached the backend
        self.sent: list[str] = []       # frames the backend pushed to the client
        self.closed = False
        self._send = None
        self._lock = threading.Lock()

    def start(self, send_to_client):
        self._send = send_to_client

    def client_frame(self, frame: str):
        with self._lock:
            self.received.append(frame)
            self.sent.append(frame)
        self._send(frame)

    def inject(self, frame: str):
        """Push a backend-originated frame (server->client request)."""
        with self._lock:
            self.sent.append(frame)
        self._send(frame)

    def close(self):
        self.closed = True


class BridgeSession:
    """Per-connection frame ledger, both directions.  sha256 + byte length are
    always recorded; raw text is retained up to LSP_RAW_RETENTION_BYTES."""

    _seq = 0
    _seq_lock = threading.Lock()

    def __init__(self, backend_kind: str, path: str):
        with BridgeSession._seq_lock:
            BridgeSession._seq += 1
            self.session_id = BridgeSession._seq
        self.backend_kind = backend_kind
        self.path = path
        self.c2s: list[dict] = []
        self.s2c: list[dict] = []
        self.closed = False
        self._lock = threading.Lock()

    def record(self, direction: str, frame: str) -> dict:
        raw_bytes = frame.encode("utf-8")
        retained = len(raw_bytes) <= LSP_RAW_RETENTION_BYTES
        rec = {"sha256": hashlib.sha256(raw_bytes).hexdigest(),
               "byteLen": len(raw_bytes),
               "raw": frame if retained else None,
               "rawRetained": retained}
        with self._lock:
            rec["seq"] = len(self.c2s) + len(self.s2c) + 1
            (self.c2s if direction == "c2s" else self.s2c).append(rec)
        return rec

    def shas(self, direction: str) -> list[str]:
        with self._lock:
            rows = self.c2s if direction == "c2s" else self.s2c
            return [r["sha256"] for r in rows]
