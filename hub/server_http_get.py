"""hub/server_http_get.py — the GET route bodies of the hub's HTTP handler.

SUB200 restructure: split out of hub/server.py's _make_handler closure.
`self.hub` is the HubServer and `self.log` its HubLog (class attributes
stamped by server_http._make_handler); `self._send_*` come from
server_http.HandlerPlumbing.  Behavior unchanged.
"""
from __future__ import annotations

import sys

# hub is import-flat by design (no __init__.py) — flat imports only.
import pipeline as hub_pipeline

HubError = hub_pipeline.HubError
HUB_VERSION = hub_pipeline.HUB_VERSION
SCHEMA_PIN_VERSION = hub_pipeline.SCHEMA_PIN_VERSION
SCHEMA_PIN_HASH = hub_pipeline.SCHEMA_PIN_HASH

#: /query kinds the hub forwards; `unreferenced` is a documented alias.  The
#: wall is the sole validator — QUERY_KIND_ALIASES resolves aliases first and
#: the wall refuses unknown kinds with a typed failure class.
QUERY_KIND_ALIASES = {"unreferenced": "unused"}


def _failure_class_of(exc: Exception) -> str:
    return getattr(exc, "failure_class",
                   getattr(exc, "failureClass", type(exc).__name__))


def _acquire_state_lock(hub):
    """H9 pre-GitHub remediation (2026-08-16): return a context manager that
    briefly serializes reads of the hub's swappable state (pipeline +
    analysis payload + workspace) against the /analyze triple-swap.  A hub
    whose analyze() has never run has no lock yet — a null CM is returned so
    the fast path is a no-op."""
    lock = getattr(hub, "_state_swap_lock", None)
    if lock is None:
        class _Null:
            def __enter__(self): return self
            def __exit__(self, *_): return False
        return _Null()
    return lock


class GetBodiesMixin:

    # ---- GET bodies ----
    def _get_health(self):
        pl = self.hub.pipeline
        wall_versions = {}
        if pl:
            gm_module = sys.modules.get(type(pl["modelWall"]).__module__)
            wall_versions = {
                "structure-extractor": getattr(pl["extractorWall"],
                                               "WALL_VERSION", None),
                "graph-model": getattr(gm_module, "WALL_VERSION", None),
            }
        self._send_json(200, {
            "ok": True, "hubVersion": HUB_VERSION,
            "schemaPin": {"schemaVersion": SCHEMA_PIN_VERSION,
                          "schemaHash": SCHEMA_PIN_HASH},
            "pipelineLoaded": pl is not None,
            "wallVersions": wall_versions,
            "lsp": {"url": f"ws://{self.hub.host}:{self.hub.ws_port}/lsp",
                    "framing": "one complete JSON-RPC message per WS text "
                               "frame (no Content-Length envelope)"}})

    def _get_analysis(self):
        try:
            with _acquire_state_lock(self.hub):
                payload = self.hub.render_analysis_payload()
        except HubError as exc:
            self._send_failure(exc, "hub.serve.analysis.refused")
            return
        self.log.emit("hub.serve.analysis", {"bytes": len(payload)})
        self._send_bytes(200, payload)

    # ---- app-shell round: workspace + jailed fs bodies ----
    def _get_workspace(self):
        try:
            with _acquire_state_lock(self.hub):
                payload = self.hub.workspace_payload()
        except HubError as exc:
            self._send_failure(exc, "hub.fs.rejected",
                               {"op": "workspace"})
            return
        self.log.emit("hub.serve.workspace", {"root": payload["root"]})
        self._send_json(200, payload)

    def _get_fs_list(self, qs: dict):
        rel = qs.get("path", [""])[0]
        try:
            self._send_json(200, self.hub.fs_list(rel))
        except Exception as exc:  # noqa: BLE001 — typed refusals surface
            self._send_failure(exc, "hub.fs.rejected",
                               {"op": "list", "path": rel})

    def _get_fs_file(self, qs: dict):
        rel = qs.get("path", [None])[0]
        try:
            if rel is None:
                raise HubError("hub-bad-request",
                               "GET /fs/file requires ?path=…")
            self._send_json(200, self.hub.fs_read(rel))
        except Exception as exc:  # noqa: BLE001 — typed refusals surface
            self._send_failure(exc, "hub.fs.rejected",
                               {"op": "read", "path": rel})

    def _get_roots_candidates(self):
        try:
            self._send_json(200, self.hub.roots_candidates())
        except HubError as exc:
            self._send_failure(exc, "hub.fs.rejected",
                               {"op": "roots-candidates"})

    def _get_graph(self):
        try:
            with _acquire_state_lock(self.hub):
                payload, counts = self.hub.render_graph_payload()
        except HubError as exc:
            self._send_failure(exc, "hub.serve.graph.refused")
            return
        self.log.emit("hub.serve.graph", {"bytes": len(payload), **counts})
        self._send_bytes(200, payload)

    def _get_graph_truth(self):
        try:
            payload, counts = self.hub.render_truth_payload()
        except HubError as exc:
            self._send_failure(exc, "hub.serve.truth.refused")
            return
        self.log.emit("hub.serve.truth", {
            "bytes": len(payload), **counts,
            "source": "modelWall.pins.dump()['wall']['ingested'] (pin "
                      "surface); canonical_json direct — bypasses the "
                      "/graph serializer seam"})
        self._send_bytes(200, payload)

    def _get_query(self, qs: dict):
        kind_raw = (qs.get("kind", [None])[0] or "").strip()
        roots_raw = qs.get("roots", [None])[0]
        kind = QUERY_KIND_ALIASES.get(kind_raw, kind_raw)
        pl = self.hub.pipeline
        try:
            if pl is None:
                raise HubError("no-graph-ingested",
                               "no pipeline run has produced a graph yet")
            if not kind_raw:
                raise HubError("hub-bad-request",
                               "GET /query requires ?kind=…")
            kwargs = {}
            if roots_raw:
                kwargs["roots"] = [r for r in roots_raw.split(",") if r]
            result = pl["modelWall"].query(kind, **kwargs)
        except Exception as exc:  # noqa: BLE001 — wall refusals surface typed
            self._send_failure(exc, "hub.serve.query.refused",
                               {"kind": kind_raw})
            return
        self.log.emit("hub.serve.query", {"kind": kind_raw, "aliasedTo": kind,
                                          "roots": kwargs.get("roots", [])})
        self._send_json(200, result)

    def _get_pins_history(self, qs: dict):
        """H2 pre-GitHub remediation (2026-08-16): a typed 400 refusal for a
        non-integer ?limit=, so a bare int() ValueError no longer escapes
        do_GET (dropping the connection with a traceback).  A missing
        ?limit= keeps the server-side default."""
        try:
            limit_raw = qs.get("limit", [None])[0]
            if limit_raw is None:
                limit = None
            else:
                try:
                    limit = int(limit_raw)
                except (TypeError, ValueError):
                    raise HubError("hub-bad-request",
                                   f"GET /pins/history?limit expected an "
                                   f"integer, got {limit_raw!r}")
            self._send_json(200, self.hub.pins_history(limit))
        except HubError as exc:
            self._send_failure(exc, "hub.http.refused",
                               {"method": "GET", "path": "/pins/history"})

    def _get_verdict(self, node_id: str):
        pl = self.hub.pipeline
        try:
            if pl is None:
                raise HubError("no-graph-ingested",
                               "no pipeline run has produced a graph yet")
            verdict = pl["modelWall"].verdictOf(node_id)
        except Exception as exc:  # noqa: BLE001
            self._send_failure(exc, "hub.serve.verdict.refused",
                               {"nodeId": node_id})
            return
        self.log.emit("hub.serve.verdict", {"nodeId": node_id,
                                            "fillStatus": verdict["fill"]["status"]})
        self._send_json(200, verdict)
