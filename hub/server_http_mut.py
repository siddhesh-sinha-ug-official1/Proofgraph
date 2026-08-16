"""hub/server_http_mut.py — the hub handler's mutating routes:
PUT /fs/file (jailed save) and POST /analyze (serialized re-run).

SUB200 restructure: split out of hub/server.py's _make_handler closure.
`self.hub` / `self.log` are stamped by server_http._make_handler; `_send_*`
come from server_http.HandlerPlumbing.  Behavior unchanged.
"""
from __future__ import annotations

import json
from urllib.parse import urlparse

# hub is import-flat by design (no __init__.py) — flat imports only.
import pipeline as hub_pipeline
from server_http_get import _failure_class_of

HubError = hub_pipeline.HubError


class MutRoutesMixin:

    def _read_json_body(self, what: str) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
            if not isinstance(body, dict):
                raise ValueError("body must be a JSON object")
        except (ValueError, UnicodeDecodeError) as exc:
            raise HubError("hub-bad-request",
                           f"unparseable {what} body: {exc}") from exc
        return body

    def do_PUT(self):
        if self._reject_cross_origin():   # S1: foreign browser origin refused
            return
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/")
        if route != "/fs/file":
            self.log.emit("hub.http.refused",
                          {"method": "PUT", "path": self.path,
                           "failureClass": "unknown-endpoint"})
            self._send_json(404, {"failureClass": "unknown-endpoint",
                                  "detail": f"no PUT route {route!r}"})
            return
        rel = None
        try:
            body = self._read_json_body("PUT /fs/file")
            rel = body.get("path")
            if not rel or not isinstance(rel, str):
                raise HubError("hub-bad-request",
                               "PUT /fs/file requires a JSON body "
                               "{path:str, content:str}")
            result = self.hub.fs_write(rel, body.get("content"))
            self._send_json(200, result)
        except Exception as exc:  # noqa: BLE001 — typed refusals surface
            self._send_failure(exc, "hub.fs.rejected",
                               {"op": "write", "path": rel})

    def do_POST(self):
        if self._reject_cross_origin():   # S1: foreign browser origin refused
            return
        parsed = urlparse(self.path)
        route = parsed.path.rstrip("/")
        if route != "/analyze":
            self.log.emit("hub.http.refused",
                          {"method": "POST", "path": self.path,
                           "failureClass": "unknown-endpoint"})
            self._send_json(404, {"failureClass": "unknown-endpoint",
                                  "detail": f"no route {route!r}"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                body = json.loads(raw.decode("utf-8")) if raw else {}
                if not isinstance(body, dict):
                    raise ValueError("body must be a JSON object")
            except (ValueError, UnicodeDecodeError) as exc:
                raise HubError("hub-bad-request",
                               f"unparseable /analyze body: {exc}") from exc
            result = self.hub.analyze(body)
            self._send_json(200, result)
        except HubError as exc:
            if exc.failure_class == "hub-bad-request":
                self.log.emit("hub.analyze.rejected",
                              {"failureClass": exc.failure_class,
                               "detail": str(exc)})
            self._send_failure(exc)
        except Exception as exc:  # noqa: BLE001 — wall refusals surface typed
            self.log.emit("hub.analyze.rejected",
                          {"failureClass": _failure_class_of(exc),
                           "detail": str(exc)})
            self._send_failure(exc)
