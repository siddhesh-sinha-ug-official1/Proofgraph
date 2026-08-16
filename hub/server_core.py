"""hub/server_core.py — HubServer's state + lifecycle core: construction,
capability sockets, and the HTTP/WS listener start/stop.

SUB200 restructure: split out of hub/server.py; the facade (hub/server.py)
composes HubServerCore with the face mixins into the public HubServer class.
Behavior unchanged.
"""
from __future__ import annotations

import threading

# hub is import-flat by design (no __init__.py) — flat imports only.
import pipeline as hub_pipeline
from server_http import _make_handler
from server_lsp import BridgeSession, EchoLspBackend

from http.server import ThreadingHTTPServer

from websockets.sync.server import serve as ws_serve

HubLog = hub_pipeline.HubLog
HUB_VERSION = hub_pipeline.HUB_VERSION
SCHEMA_PIN_VERSION = hub_pipeline.SCHEMA_PIN_VERSION
SCHEMA_PIN_HASH = hub_pipeline.SCHEMA_PIN_HASH

#: default per-stream tail bound for /pins/history (override with ?limit=N).
PINS_STREAM_LIMIT_DEFAULT = 2000


class HubServerCore:
    """One HTTP listener (stdlib) + one WS listener (websockets), both on
    ephemeral ports by default.  All state honest: the served graph is always
    re-projected from the graph-model WALL at request time and re-verified
    (id-set equality) after serialization — a cheap serializer that drops rows
    is caught, named, and refused (serializer-edge-drop)."""

    def __init__(self, pipeline_result: dict | None = None,
                 host: str = "127.0.0.1", log: HubLog | None = None,
                 pins_stream_limit: int = PINS_STREAM_LIMIT_DEFAULT):
        self.host = host
        self.log = log or (pipeline_result or {}).get("log") or hub_pipeline.DEFAULT_LOG
        self._pipeline = pipeline_result
        self._pipeline_lock = threading.Lock()   # serializes /analyze — and by
        # doing so respects the capability wall's one-run-at-a-time lock: at
        # most one capability() run can ever be in flight through the hub.
        self._capability_fn = None               # V1 plugs the real fn here
        self._capability_pins = None              # V1/V2 may attach T2's quartet
        self._analysis_payload = None             # Phase 3: canonical /analysis bytes
        self._workspace = None                    # app-shell: the declared fs jail
        self._pins_stream_limit = pins_stream_limit
        self._graph_serializer = hub_pipeline.canonical_json_bytes  # test seam
        self._http_server = None
        self._ws_server = None
        self._http_thread = None
        self._ws_thread = None
        self.http_port = None
        self.ws_port = None
        # LSP bridge state
        self._lsp_backend_factory = EchoLspBackend   # default: fresh echo per conn
        self._lsp_backend_instance = None            # instance mode (V2 real handle)
        self._lsp_instance_busy = False
        self._lsp_lock = threading.Lock()
        self.lsp_backends: list = []                  # every backend that served a conn
        self.lsp_sessions: list[BridgeSession] = []

    # ---- pipeline access -------------------------------------------------
    @property
    def pipeline(self) -> dict | None:
        return self._pipeline

    def set_capability_fn(self, fn):
        """V1 socket passthrough: used by the NEXT /analyze run."""
        self._capability_fn = fn

    def attach_capability_pins(self, pins, note: str = ""):
        """Aggregate a capability-layer pins quartet under /pins/*.  The T2
        quartet is module-global last-run state (SEAM-MAP) — the attach is
        explicit and logged; the hub never fabricates a capability stream."""
        self._capability_pins = pins
        self.log.emit("hub.capability.attach",
                      {"attached": pins is not None, "note": note})

    # ---- lifecycle ---------------------------------------------------------
    def start(self, http_port: int = 0, ws_port: int = 0):
        # P3 (additive): fixed dev ports for the human face (app/README.md
        # documents hub HTTP 8477; WS is discovered via /health.lsp.url).
        # Defaults stay ephemeral (0) — every existing caller is unchanged.
        handler_cls = _make_handler(self)
        self._http_server = ThreadingHTTPServer((self.host, http_port), handler_cls)
        self.http_port = self._http_server.server_address[1]
        self._http_thread = threading.Thread(
            target=self._http_server.serve_forever, name="hub-http", daemon=True)
        self._http_thread.start()

        self._ws_server = ws_serve(self._ws_handler, self.host, ws_port)
        self.ws_port = self._ws_server.socket.getsockname()[1]
        self._ws_thread = threading.Thread(
            target=self._ws_server.serve_forever, name="hub-ws", daemon=True)
        self._ws_thread.start()

        self.log.emit("hub.version", {
            "hubVersion": HUB_VERSION, "httpPort": self.http_port,
            "wsPort": self.ws_port,
            "schemaPin": {"schemaVersion": SCHEMA_PIN_VERSION,
                          "schemaHash": SCHEMA_PIN_HASH}})
        return self

    def stop(self):
        if self._http_server is not None:
            self._http_server.shutdown()
            self._http_server.server_close()
        if self._ws_server is not None:
            self._ws_server.shutdown()
        if self._http_thread is not None:
            self._http_thread.join(timeout=5)
        if self._ws_thread is not None:
            self._ws_thread.join(timeout=5)
