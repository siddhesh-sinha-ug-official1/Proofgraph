"""hub/server_http.py — the stdlib HTTP handler: plumbing, GET routing, and
CORS preflight; _make_handler stamps the per-server subclass.

SUB200 restructure: split out of hub/server.py's _make_handler closure.  The
closure variables became class attributes (`hub` = the HubServer, `log` = its
HubLog), stamped by _make_handler on a per-server subclass — same objects,
same behavior.  GET route bodies live in server_http_get.GetBodiesMixin and
the mutating routes (PUT /fs/file, POST /analyze) in
server_http_mut.MutRoutesMixin.
"""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# hub is import-flat by design (no __init__.py) — flat imports only.
import cors
import pipeline as hub_pipeline
from server_http_get import (GetBodiesMixin, QUERY_KIND_ALIASES,
                             _failure_class_of)
from server_http_mut import MutRoutesMixin

HubError = hub_pipeline.HubError
HUB_VERSION = hub_pipeline.HUB_VERSION

_HTTP_STATUS_BY_CLASS = {
    "no-graph-ingested": 503,
    "no-analysis-computed": 503,
    "workspace-not-open": 503,
    "path-escape": 403,
    "fs-io-error": 400,
    "bad-source-root": 400,
    "pipeline-busy": 409,
    "roots-undeclared": 409,
    "concurrent-run-unsupported": 409,
    "unknown-query": 400,
    "unknown-node": 404,
    "unknown-root": 404,
    "unknown-endpoint": 404,
    "hub-bad-request": 400,
    "cross-origin-denied": 403,
    "serializer-edge-drop": 500,
    "envelope-version-mismatch": 500,
    "schema-pin-mismatch": 500,
}


class HandlerPlumbing(BaseHTTPRequestHandler):
    server_version = f"proofgraph-{HUB_VERSION}"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quiet; the HubLog is the record
        pass

    # ---- plumbing ----
    def _send_bytes(self, status: int, payload: bytes,
                    content_type="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        # S1 fix: the human face (vite app, loopback) reads this HTTP surface
        # cross-origin. Echo Access-Control-Allow-Origin ONLY for an
        # allowlisted loopback origin (cors.acao_for); a foreign origin gets
        # NO ACAO (the browser blocks the read) and no-Origin callers (curl,
        # the acceptance runners) get no header and are unaffected. The old
        # wildcard let any website read this surface — dropped.
        acao = cors.acao_for(self.headers.get("Origin"))
        if acao is not None:
            self.send_header("Access-Control-Allow-Origin", acao)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(payload)

    def _reject_cross_origin(self) -> bool:
        """State-changing guard (S1): a PRESENT, non-allowlisted browser
        Origin may not drive PUT/POST. Refuses 403 cross-origin-denied
        (nothing mutated, probed hub.http.refused) and returns True; else
        False to proceed. No-Origin (curl, runners) is never denied."""
        origin = self.headers.get("Origin")
        if not cors.cross_origin_denied(origin):
            return False
        self.log.emit("hub.http.refused",
                      {"method": self.command, "path": self.path,
                       "failureClass": "cross-origin-denied", "origin": origin})
        self._send_json(403, {"failureClass": "cross-origin-denied",
                              "detail": f"origin {origin!r} is not an allowed "
                                        f"localhost app origin — state-changing "
                                        f"requests are refused"})
        return True

    def _send_json(self, status: int, obj):
        # default=str: the pins streams may carry non-JSON diagnostic
        # values (Paths, etc.) — textualized, never dropped (README bound).
        self._send_bytes(status, json.dumps(obj, default=str).encode("utf-8"))

    def _send_failure(self, exc: Exception, refusal_probe: str | None = None,
                      extra: dict | None = None):
        failure_class = _failure_class_of(exc)
        status = _HTTP_STATUS_BY_CLASS.get(failure_class, 400)
        body = {"failureClass": failure_class, "detail": str(exc)}
        if refusal_probe:
            self.log.emit(refusal_probe, {**(extra or {}),
                                          "failureClass": failure_class,
                                          "detail": str(exc), "status": status})
        self._send_json(status, body)

    # ---- routes ----
    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/") or "/"
        try:
            if route == "/health":
                self._get_health()
            elif route == "/graph":
                self._get_graph()
            elif route == "/analysis":
                self._get_analysis()
            elif route == "/graph/truth":
                self._get_graph_truth()
            elif route == "/workspace":
                self._get_workspace()
            elif route == "/fs/list":
                self._get_fs_list(parse_qs(parsed.query))
            elif route == "/fs/file":
                self._get_fs_file(parse_qs(parsed.query))
            elif route == "/fs/roots-candidates":
                self._get_roots_candidates()
            elif route == "/query":
                self._get_query(parse_qs(parsed.query))
            elif route.startswith("/verdict/") or route.startswith("/verdicts/"):
                self._get_verdict(route.split("/", 2)[2])
            elif route == "/pins/catalog":
                self._send_json(200, self.hub.pins_catalog())
            elif route == "/pins/history":
                # H2 pre-GitHub remediation (2026-08-16): delegated to
                # server_http_get._get_pins_history so a non-integer ?limit
                # is refused as a typed 400 hub-bad-request instead of a
                # bare int() ValueError escaping do_GET.
                self._get_pins_history(parse_qs(parsed.query))
            else:
                self.log.emit("hub.http.refused",
                              {"method": "GET", "path": self.path,
                               "failureClass": "unknown-endpoint"})
                self._send_json(404, {"failureClass": "unknown-endpoint",
                                      "detail": f"no route {route!r}"})
        except BrokenPipeError:
            pass

    def do_OPTIONS(self):
        """CORS preflight for the browser face (vite app): PUT /fs/file and
        POST /analyze carry a JSON content-type, which preflights. S1 fix:
        the CORS-allow headers are emitted ONLY for an allowlisted loopback
        origin; a foreign origin gets a bare 204 with NO ACAO, so the browser
        fails the preflight and never sends the state-changing request."""
        self.send_response(204)
        acao = cors.acao_for(self.headers.get("Origin"))
        if acao is not None:
            self.send_header("Access-Control-Allow-Origin", acao)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods",
                             "GET, POST, PUT, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()


def _make_handler(server):
    class HubHTTPHandler(GetBodiesMixin, MutRoutesMixin, HandlerPlumbing):
        hub = server
        log = server.log

    return HubHTTPHandler
