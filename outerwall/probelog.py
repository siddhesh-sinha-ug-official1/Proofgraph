"""probelog.py — the outer wall's own probe log (append-only, catalogued).

SUB200 restructure: split out of outerwall/__init__.py (which stays the
facade re-exporting OUTERWALL_PROBE_CATALOG + OuterLog — importers see no
change).  Behavior identical.
"""
from __future__ import annotations

import threading
import time

from .errors import OuterwallError
from .wallconst import CELL_ID

#: probeId -> kind.  Fixed catalog; emit() hard-rejects anything else
#: (uncatalogued lead = a bug — the cells' discipline, kept).
OUTERWALL_PROBE_CATALOG: dict[str, str] = {
    "outerwall.version": "state",
    "outerwall.analyze.call": "call",
    "outerwall.analyze.return": "output",
    "outerwall.analyze.rejected": "error",
    "outerwall.root.staged": "decision",
    "outerwall.roots.resolve": "decision",
    "outerwall.capability.mode": "decision",
    "outerwall.capability.provenance": "state",
    "outerwall.capability.shutdown": "state",
    "outerwall.outline.closure": "value",
    "outerwall.outline.filled": "output",
    "outerwall.outline.vocabulary.violation": "error",
    "outerwall.outline.reingest": "decision",
    "outerwall.gap.query": "value",
    "outerwall.gap.refusal": "decision",
    "outerwall.gap.declUniverse.bound": "decision",
    "outerwall.provenance.record": "output",
    "outerwall.provenance.hole": "error",
    "outerwall.provenance.refusal": "decision",
    "outerwall.bound.logged": "decision",
    "outerwall.system.catalog": "value",
    "outerwall.system.dump": "value",
    "outerwall.system.history": "value",
    "outerwall.system.trace": "value",
    "outerwall.system.tap": "state",
}


class OuterLog:
    """Append-only, thread-safe, catalogued probe log for the outer wall
    itself — the same discipline as hub/pipeline.HubLog (append-only,
    fixed catalog, tap() returning an untap callable)."""

    def __init__(self):
        self._events: list[dict] = []
        self._clock = 0
        self._lock = threading.Lock()
        self._taps: dict[str, list] = {}

    def emit(self, probe_id: str, payload) -> dict:
        kind = OUTERWALL_PROBE_CATALOG.get(probe_id)
        if kind is None:
            raise OuterwallError(
                f"probe {probe_id!r} fired but is not in the outerwall "
                f"catalog — an uncatalogued lead is a bug")
        with self._lock:
            self._clock += 1
            event = {"probeId": probe_id, "source": CELL_ID, "kind": kind,
                     "payload": payload, "logicalClock": self._clock,
                     "wallNanos": time.time_ns()}
            self._events.append(event)
            taps = list(self._taps.get(probe_id, ()))
        for fn in taps:                # outside the lock: a tap may emit
            fn(event)
        return event

    def history(self) -> list[dict]:
        with self._lock:
            return list(self._events)

    def catalog(self) -> list[dict]:
        return [{"probeId": pid, "kind": kind}
                for pid, kind in sorted(OUTERWALL_PROBE_CATALOG.items())]

    def events(self, probe_id: str) -> list[dict]:
        return [e for e in self.history() if e["probeId"] == probe_id]

    def tap(self, probe_id: str, fn):
        if probe_id not in OUTERWALL_PROBE_CATALOG:
            raise OuterwallError(f"tap on uncatalogued probe {probe_id!r}")
        with self._lock:
            self._taps.setdefault(probe_id, []).append(fn)

        def untap():
            with self._lock:
                try:
                    self._taps.get(probe_id, []).remove(fn)
                except ValueError:
                    pass
        return untap
