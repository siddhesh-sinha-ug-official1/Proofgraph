"""hub/server_analyze.py — the outer-wall session runner (serve_app's attach
pattern, factored) and POST /analyze's serialized re-run.

SUB200 restructure: split out of hub/server.py; run_outerwall_session is
re-exported by the facade (hub/server.py) and AnalyzeMixin is composed into
HubServer there.  Behavior unchanged.
"""
from __future__ import annotations

import hashlib
import sys
import threading
from pathlib import Path

# hub is import-flat by design (no __init__.py) — flat imports only.
import pipeline as hub_pipeline

HubError = hub_pipeline.HubError


def run_outerwall_session(source_root, roots=None, extractor_config=None):
    """serve_app's attach pattern, FACTORED (app-shell round) so both callers
    share it — the serve_app CLI startup and POST /analyze's re-attach:

        session = run_outerwall_session(root, roots, extractor_config)
        hub._pipeline = session["pipeline"]          # the SAME pipeline …
        hub.attach_analysis(session["analysis"])     # … carries the analysis

    The outer wall's analyze_session runs the pipeline ITSELF (REAL V1
    capability feed — measured tiers only, feed lifecycle owned in a finally)
    and re-ingests the outline-FILLED graph through the model wall, so a hub
    serving session["pipeline"] serves the filled envelope on /graph and the
    byte-canonical analysis on /analysis — one wall, no foreign-snapshot
    mismatch (Test07's proven pattern, previously inline in serve_app.py).

    Bound (logged by the caller on hub.analyze.reattach, never silent):
    analyze_session keeps its own hub log — the run's pipeline probes live on
    session["pipeline"]["log"] / session["hubLog"], NOT on the serving hub's
    stream (analyze-session-detached-log, ARCHITECTURE-PHASE2.md)."""
    root_dir = hub_pipeline.PROOFGRAPH_ROOT
    if str(root_dir) not in sys.path:
        sys.path.insert(0, str(root_dir))
    from outerwall.analyze import analyze_session   # lazy: outerwall imports hub
    return analyze_session(
        source_root, roots=list(roots) if roots else None,
        config={"extractor": dict(extractor_config) if extractor_config else {}})


class AnalyzeMixin:
    """HubServer's POST /analyze face (state lives on HubServerCore)."""

    def analyze(self, body: dict) -> dict:
        """Re-run THE pipeline — app-shell round: through the outer wall's
        analyze_session (run_outerwall_session, the factored serve_app attach
        pattern), so the outer-wall analysis is recomputed on the SAME
        pipeline the hub will serve and re-attached (hub.analyze.reattach) —
        /graph and /analysis stay one wall after every re-run.  The run also
        re-declares the workspace (root/package/pyrightMode/declaredRoots/
        analyzedAt) for the /fs jail.  Note: the outer wall owns the
        capability feed (REAL V1, measured tiers only); an fn injected via
        set_capability_fn is NOT consulted on this path — logged on
        hub.analyze.accepted (capabilityFnInjected), never silent."""
        root = body.get("root")
        if not root or not isinstance(root, str):
            raise HubError("hub-bad-request",
                           "POST /analyze requires a JSON body with a string 'root'")
        roots = body.get("roots")
        extractor_config = body.get("extractorConfig")
        if not self._pipeline_lock.acquire(blocking=False):
            self.log.emit("hub.analyze.rejected", {
                "failureClass": "pipeline-busy",
                "detail": "a pipeline run is already in flight (serialized; "
                          "capability one-run lock respected)"})
            raise HubError("pipeline-busy",
                           "a pipeline run is already in flight — retry when done")
        # H9 pre-GitHub remediation (2026-08-16): lazy-init a short-lived
        # state-swap lock (server_core.py owns __init__ and is outside this
        # cluster's partition, so the lock is materialized here on first
        # analyze — safe because we already hold _pipeline_lock).  Readers
        # (server_http_get._get_graph / _get_analysis / _get_workspace)
        # take the SAME lock, so a caller can never observe a new pipeline
        # paired with an old analysis payload or workspace root.
        if getattr(self, "_state_swap_lock", None) is None:
            self._state_swap_lock = threading.Lock()
        try:
            self.log.emit("hub.analyze.accepted", {
                "root": root, "roots": roots or [],
                "capabilityFnInjected": self._capability_fn is not None,
                "note": "outer-wall session path (app-shell round): the V1 "
                        "feed is owned by analyze_session; an injected "
                        "capability_fn is not consulted here"})
            session = run_outerwall_session(
                root, roots=roots, extractor_config=extractor_config)
            ws_root = Path(root)
            single_file = ws_root.is_file()
            # H9: the triple-swap happens atomically under _state_swap_lock
            # — the pipeline, analysis payload and workspace flip as one
            # unit.  attach_analysis / set_workspace also emit hub log
            # events (different lock), which stay observable — but no
            # reader can see a torn combination.
            with self._state_swap_lock:
                self._pipeline = session["pipeline"]
                payload = self.attach_analysis(
                    session["analysis"],
                    note="POST /analyze: outer-wall analysis recomputed on "
                         "the SAME pipeline (factored serve_app attach "
                         "pattern)")
                self.set_workspace(
                    ws_root.parent if single_file else ws_root,
                    package=(extractor_config or {}).get("python_package"),
                    pyright_mode=(extractor_config or {}).get("pyright_mode"),
                    declared_roots=session["declaredRoots"],
                    note=("POST /analyze re-declared the workspace"
                          + (" (single-file root — jail is its parent dir)"
                             if single_file else "")))
            session_log = session["pipeline"].get("log")
            self.log.emit("hub.analyze.reattach", {
                "analysisBytes": len(payload),
                "analysisSha256": hashlib.sha256(payload).hexdigest(),
                "declaredRoots": session["declaredRoots"],
                "sessionHubLogEvents": (len(session_log.history())
                                        if session_log is not None else None),
                "bound": "analyze-session-detached-log",
                "note": "the run's pipeline probes live on the session-local "
                        "hub log (pipeline['log']), not this serving stream — "
                        "bound logged, never silent (ARCHITECTURE-PHASE2.md)"})
        finally:
            self._pipeline_lock.release()
        env = session["pipeline"]["envelope"]
        return {"ok": True, "root": root,
                "nodes": len(env["nodes"]), "edges": len(env["edges"]),
                "leads": len(env["leads"]),
                "declaredRoots": session["declaredRoots"],
                "analysisBytes": len(payload)}
