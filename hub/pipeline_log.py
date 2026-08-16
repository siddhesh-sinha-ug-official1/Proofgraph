"""hub/pipeline_log.py — hub constants, named failure classes, and HubLog.

SUB200 restructure: split out of hub/pipeline.py (which remains the facade
and re-exports every name here — external importers keep `import pipeline`).
Behavior unchanged; the catalog dict is THE shared object (lsp_backend's
additive registrations mutate it in place, visible to every importer).
"""
from __future__ import annotations

import threading
import time
from collections import deque
from pathlib import Path

HUB_VERSION = "hub/1.0.0"

HUB_DIR = Path(__file__).resolve().parent
PROOFGRAPH_ROOT = HUB_DIR.parent
PACKAGES = PROOFGRAPH_ROOT / "packages"
VESSELS_DIR = PROOFGRAPH_ROOT / "vessels"

# The canonical assembly PIN — hard-coded on purpose (WALL-CONVENTIONS rule 4:
# pinned to the constitution, fails fast, does not re-read consent).
SCHEMA_PIN_VERSION = "v0"
SCHEMA_PIN_HASH = "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c"


# ---------------------------------------------------------------------------
# Named failure classes (hub vocabulary; extends the seam catalog in
# ARCHITECTURE-PHASE2.md — every hub refusal carries one of these)
# ---------------------------------------------------------------------------

class HubError(Exception):
    """A hub-level refusal.  failure_class is one of:
    schema-pin-mismatch, pipeline-busy, serializer-edge-drop,
    envelope-version-mismatch, no-graph-ingested, unknown-root,
    lsp-bridge-drop, lsp-bridge-error, lsp-backend-dead,
    lsp-backend-busy, hub-bad-request, unknown-endpoint,
    cross-origin-denied (S1: a state-changing PUT/POST from a browser Origin
    that is not an allowlisted loopback app origin — refused 403, nothing
    mutated, probed hub.http.refused; see hub/cors.py),
    no-analysis-computed (Phase 3: GET /analysis before any analyze()),
    plus the app-shell workspace-fs vocabulary (APP-SHELL-CONTRACT.md):
    path-escape       an /fs/* path resolving outside the workspace root
                      (absolute, drive-qualified, ..\\ traversal, or symlink
                      escape) — refused, probed hub.fs.rejected
    workspace-not-open  /workspace or /fs/* before any workspace root was
                      declared (set_workspace / POST /analyze)
    fs-io-error       unreadable/missing/non-directory/unwritable targets,
                      and binary (non-utf-8) reads this round — refused with
                      the reason, never a fabricated listing or body."""

    def __init__(self, failure_class: str, message: str):
        self.failure_class = failure_class
        super().__init__(f"failure-class={failure_class}: {message}")


# ---------------------------------------------------------------------------
# HubLog — the hub's own probe stream (assembly-level diagnostics)
# ---------------------------------------------------------------------------

#: probeId -> kind.  Fixed catalog; emit() hard-rejects anything else.
HUB_PROBE_CATALOG: dict[str, str] = {
    "hub.version": "state",
    "hub.pathing": "state",
    "hub.schema.pin": "decision",
    "hub.pipeline.run": "call",
    "hub.pipeline.roots": "decision",
    "hub.pipeline.return": "output",
    "hub.pipeline.rejected": "error",
    "hub.capability.attach": "state",
    "hub.serve.graph": "value",
    "hub.serve.graph.refused": "error",
    "hub.serve.truth": "value",
    "hub.serve.truth.refused": "error",
    "hub.serve.query": "value",
    "hub.serve.query.refused": "error",
    "hub.serve.verdict": "value",
    "hub.serve.verdict.refused": "error",
    "hub.pins.catalog": "value",
    "hub.pins.history": "value",
    "hub.pins.history.truncated": "decision",
    "hub.analyze.accepted": "call",
    "hub.analyze.rejected": "error",
    # Phase 3 additive (outer wall): the /analysis surface
    "hub.analysis.attach": "state",
    "hub.serve.analysis": "value",
    "hub.serve.analysis.refused": "error",
    "hub.http.refused": "error",
    # App-shell round additive (APP-SHELL-CONTRACT.md): workspace-fs surface
    "hub.workspace.set": "state",
    "hub.serve.workspace": "value",
    "hub.fs.list": "value",
    "hub.fs.read": "value",
    "hub.fs.write": "value",
    "hub.fs.rejected": "error",
    "hub.serve.rootsCandidates": "value",
    "hub.analyze.reattach": "state",
    "hub.lsp.connect": "state",
    "hub.lsp.busy": "error",
    "hub.lsp.frame.c2s": "value",
    "hub.lsp.frame.s2c": "value",
    "hub.lsp.frame.bound": "decision",
    "hub.lsp.drop": "error",
    # H1 pre-GitHub remediation (2026-08-16): named-class emission for a
    # bridge-loop exception (json parse in backend.client_frame,
    # backend.start() failure, or an unclassified failure) — the class is
    # LOGGED before hub.lsp.close so the probe stream carries the reason.
    "hub.lsp.error": "error",
    "hub.lsp.close": "state",
}

#: H7 pre-GitHub remediation (2026-08-16): storage-side cap on HubLog._events
#: — enforced at insertion (deque(maxlen=…)), matching the /pins/history
#: tail-bound surface so a long-running hub never grows an unbounded log.
HUB_LOG_MAX_EVENTS = 5000


class HubLog:
    """Append-only, thread-safe, catalogued probe log for the hub itself.

    H7 pre-GitHub remediation (2026-08-16): storage-side ring buffer.
    _events is a bounded deque(maxlen=HUB_LOG_MAX_EVENTS); once full the
    oldest event is dropped at insertion — the /pins/history tail-bound
    is now enforced at STORAGE, not only at serve time.  The clock and
    tap surface are unchanged."""

    def __init__(self):
        self._events: deque[dict] = deque(maxlen=HUB_LOG_MAX_EVENTS)
        self._clock = 0
        self._lock = threading.Lock()
        self._taps: dict[str, list] = {}   # Phase 3 additive: tap() support

    def emit(self, probe_id: str, payload) -> dict:
        kind = HUB_PROBE_CATALOG.get(probe_id)
        if kind is None:
            raise HubError("hub-bad-request",
                           f"probe {probe_id!r} fired but is not in the hub "
                           f"catalog — an uncatalogued lead is a bug")
        with self._lock:
            self._clock += 1
            event = {"probeId": probe_id, "source": "hub", "kind": kind,
                     "payload": payload, "logicalClock": self._clock,
                     "wallNanos": time.time_ns()}
            self._events.append(event)
            taps = list(self._taps.get(probe_id, ()))
        for fn in taps:                    # outside the lock: a tap may emit
            fn(event)
        return event

    def tap(self, probe_id: str, fn):
        """Phase 3 ADDITIVE: subscribe to a catalogued hub probe (the cells'
        quartet idiom, brought to the hub so the system surface can route
        taps).  Uncatalogued probe -> typed refusal.  Returns untap()."""
        if probe_id not in HUB_PROBE_CATALOG:
            raise HubError("hub-bad-request",
                           f"tap on uncatalogued hub probe {probe_id!r}")
        with self._lock:
            self._taps.setdefault(probe_id, []).append(fn)

        def untap():
            with self._lock:
                try:
                    self._taps.get(probe_id, []).remove(fn)
                except ValueError:
                    pass
        return untap

    def history(self) -> list[dict]:
        with self._lock:
            return list(self._events)

    def catalog(self) -> list[dict]:
        return [{"probeId": pid, "kind": kind}
                for pid, kind in sorted(HUB_PROBE_CATALOG.items())]

    def events(self, probe_id: str) -> list[dict]:
        return [e for e in self.history() if e["probeId"] == probe_id]


#: module-level default log (standalone run_pipeline callers); the server
#: passes its own so pipeline + serve events share one stream.
DEFAULT_LOG = HubLog()
