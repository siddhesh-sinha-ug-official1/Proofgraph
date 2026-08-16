"""The uniform probe bus (Probe Density Contract, reproduced in spec §3).

Every internal event of the cell flows through one ProbeBus as a typed
ProbeEvent.  Ordering is deterministic via a per-cell logicalClock; real time
lives ONLY in wallNanos and is never used for ordering or assertions.

Rules enforced here:
  * A probe that fires but is not in the catalog is a bug -> UncataloguedProbeError.
  * A probe whose kind disagrees with its catalog entry is a bug.
  * No sampling, no log-level gating, no silent drop.
  * Secrets are the one redaction (presence + last-4 only).

SUB200 restructure: the typed records (ProbeEvent, CatalogEntry), the probe
kinds, the catalog errors and the redaction moved to events.py; this module
keeps the bus itself and re-exports the datatypes (same import surface).
"""
from __future__ import annotations

import json
import time
from typing import Any, Callable, Iterable

from .events import (CELL_ID, PROBE_KINDS, CatalogEntry, ProbeEvent,
                     ProbeKindMismatchError, UncataloguedProbeError, _redact)

__all__ = [
    "CELL_ID", "PROBE_KINDS", "CatalogEntry", "ProbeEvent",
    "ProbeKindMismatchError", "UncataloguedProbeError", "ProbeBus", "StageTimer",
]


class ProbeBus:
    """One bus per cell run.  emit() is the only way events enter the stream."""

    def __init__(self, cell_id: str = CELL_ID):
        self.cell_id = cell_id
        self._catalog: dict[str, CatalogEntry] = {}
        self._events: list[ProbeEvent] = []
        self._taps: dict[str, list[Callable[[ProbeEvent], None]]] = {}
        self._clock = 0

    # ---- catalog -----------------------------------------------------------
    def register(self, probeId: str, kind: str, payloadType: str, description: str) -> None:
        if kind not in PROBE_KINDS:
            raise ValueError(f"unknown probe kind {kind!r} for {probeId}")
        if probeId in self._catalog:
            raise ValueError(f"duplicate catalog entry {probeId}")
        self._catalog[probeId] = CatalogEntry(probeId, kind, payloadType, description)

    def register_all(self, entries: Iterable[tuple[str, str, str, str]]) -> None:
        for e in entries:
            self.register(*e)

    def probe_catalog(self) -> list[dict]:
        """Every available lead, enumerable (Probe Density §3)."""
        return [self._catalog[k].to_dict() for k in sorted(self._catalog)]

    def is_catalogued(self, probeId: str) -> bool:
        return probeId in self._catalog

    # ---- emission ----------------------------------------------------------
    def emit(self, probeId: str, stage: str, kind: str, payload: Any,
             cause: "ProbeEvent | str | None" = None) -> ProbeEvent:
        entry = self._catalog.get(probeId)
        if entry is None:
            raise UncataloguedProbeError(
                f"probe {probeId!r} fired but is not in probeCatalog() — a lead that "
                f"exists but isn't in the catalog is a bug (Probe Density Contract §3)")
        if entry.kind != kind:
            raise ProbeKindMismatchError(
                f"probe {probeId!r} fired with kind {kind!r} but is catalogued as {entry.kind!r}")
        self._clock += 1
        cause_id = cause.ref() if isinstance(cause, ProbeEvent) else cause
        ev = ProbeEvent(
            probeId=probeId,
            cellId=self.cell_id,
            stage=stage,
            kind=kind,
            payload=_redact(payload),
            logicalClock=self._clock,
            causeId=cause_id,
            wallNanos=time.time_ns(),
        )
        self._events.append(ev)
        for fn in self._taps.get(probeId, ()):  # live subscriptions
            fn(ev)
        return ev

    # ---- introspection (Probe Density §4) ----------------------------------
    def tap(self, probeId: str, fn: Callable[[ProbeEvent], None]) -> None:
        """Subscribe to one live lead."""
        if probeId not in self._catalog:
            raise UncataloguedProbeError(f"cannot tap uncatalogued probe {probeId!r}")
        self._taps.setdefault(probeId, []).append(fn)

    def history(self, strip_wall: bool = False) -> list[dict]:
        """The ordered probe stream for the run (by logicalClock — deterministic)."""
        return [e.to_dict(strip_wall=strip_wall) for e in self._events]

    def events(self, probeId: str | None = None, prefix: str | None = None,
               kind: str | None = None, stage: str | None = None) -> list[ProbeEvent]:
        """Typed + queryable filtering (Probe Density §8)."""
        out = self._events
        if probeId is not None:
            out = [e for e in out if e.probeId == probeId]
        if prefix is not None:
            out = [e for e in out if e.probeId.startswith(prefix)]
        if kind is not None:
            out = [e for e in out if e.kind == kind]
        if stage is not None:
            out = [e for e in out if e.stage == stage]
        return list(out)

    def fired_probe_ids(self) -> list[str]:
        return sorted({e.probeId for e in self._events})

    def history_jsonl(self, strip_wall: bool = False) -> str:
        return "\n".join(json.dumps(d, sort_keys=True, default=str)
                         for d in self.history(strip_wall=strip_wall))


class StageTimer:
    """Context manager emitting extractor.stage.timing on exit (wallNanos only)."""

    def __init__(self, bus: ProbeBus, stage: str, cause: ProbeEvent | None = None):
        self.bus, self.stage, self.cause = bus, stage, cause

    def __enter__(self):
        self._t0 = time.time_ns()
        return self

    def __exit__(self, *exc):
        self.bus.emit("extractor.stage.timing", self.stage, "timing",
                      {"stage": self.stage, "wallNanos": time.time_ns() - self._t0},
                      cause=self.cause)
        return False
