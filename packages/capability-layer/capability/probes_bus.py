"""Probe-bus machinery of the Capability Layer cell (see probes.py, the
facade, for the full Probe Density Contract summary).  Split out SUB200:
the bus/catalog/tap mechanics live here; the catalog REGISTRATIONS live in
probes_catalog_ae.py / probes_catalog_fj.py."""

from __future__ import annotations

import threading

CELL_ID = "tree-2-capability"

VALID_KINDS = {
    "input", "output", "value", "decision", "branch", "edge", "node",
    "state", "call", "timing", "error",
}

# Keys whose string values are redacted at the probe boundary (presence + last-4 only).
SECRET_KEYS = {
    "token", "apikey", "api_key", "secret", "password", "authorization", "credential",
}


class ProbeError(Exception):
    """A violation of the probe density contract (uncatalogued lead, bad kind, ...)."""


# ---------------------------------------------------------------------------
# Catalog — self-describing enumeration of every lead this cell can emit.
# ---------------------------------------------------------------------------

_CATALOG: dict[str, dict] = {}


def register(probe_id: str, kind: str, payload_type: str, description: str) -> None:
    if kind not in VALID_KINDS:
        raise ProbeError(f"invalid probe kind {kind!r} for {probe_id}")
    _CATALOG[probe_id] = {
        "probeId": probe_id,
        "kind": kind,
        "payloadType": payload_type,
        "description": description,
    }


def probeCatalog() -> list[dict]:
    """The full list of every available lead — {probeId, kind, payloadType, description}."""
    return [dict(_CATALOG[k]) for k in sorted(_CATALOG)]


def catalog_entry(probe_id: str) -> dict | None:
    e = _CATALOG.get(probe_id)
    return dict(e) if e else None


# ---------------------------------------------------------------------------
# Redaction (contract §9: secrets are the ONE redaction; everything else full).
# ---------------------------------------------------------------------------

def _redact(value):
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if isinstance(k, str) and k.lower() in SECRET_KEYS and isinstance(v, str):
                tail = v[-4:] if len(v) >= 4 else ""
                out[k] = f"<redacted:present:…{tail}>"
            else:
                out[k] = _redact(v)
        return out
    if isinstance(value, list):
        return [_redact(v) for v in value]
    if isinstance(value, tuple):
        return [_redact(v) for v in value]
    return value


# ---------------------------------------------------------------------------
# Taps — module-level so a tap registered before a run attaches to the run's bus.
# ---------------------------------------------------------------------------

_TAPS: dict[str, list] = {}
_TAPS_LOCK = threading.Lock()


def tap(probe_id: str, callback):
    """Subscribe to one live lead. Returns an unsubscribe function."""
    if probe_id not in _CATALOG:
        raise ProbeError(f"cannot tap uncatalogued lead {probe_id!r}")
    with _TAPS_LOCK:
        _TAPS.setdefault(probe_id, []).append(callback)

    def untap():
        with _TAPS_LOCK:
            try:
                _TAPS[probe_id].remove(callback)
            except (KeyError, ValueError):
                pass

    return untap


# ---------------------------------------------------------------------------
# The bus.
# ---------------------------------------------------------------------------

class ProbeBus:
    """One per capability(lang) run. logicalClock starts at 0 → runs are comparable."""

    def __init__(self):
        self._clock = 0
        self._lock = threading.Lock()
        self.events: list[dict] = []

    def emit(self, probe_id: str, kind: str, payload, stage: str,
             cause_id: str | None = None, wall_nanos: int | None = None) -> str:
        """Emit one ProbeEvent. Returns a cause token 'probeId#clock' for causal chaining.

        No sampling, no log-level gating, no silent drop (contract §5).
        """
        entry = _CATALOG.get(probe_id)
        if entry is None:
            raise ProbeError(f"uncatalogued probe lead fired: {probe_id!r} — "
                             f"register it in the catalog (a firing-but-uncatalogued "
                             f"lead is a bug)")
        if entry["kind"] != kind:
            raise ProbeError(f"probe {probe_id!r} fired with kind {kind!r} but is "
                             f"catalogued as {entry['kind']!r}")
        with self._lock:
            clock = self._clock
            self._clock += 1
            event = {
                "probeId": probe_id,
                "cellId": CELL_ID,
                "stage": stage,
                "kind": kind,
                "payload": _redact(payload),
                "logicalClock": clock,
                "causeId": cause_id,
                "wallNanos": wall_nanos,
            }
            self.events.append(event)
        with _TAPS_LOCK:
            listeners = list(_TAPS.get(probe_id, ()))
        for fn in listeners:
            fn(event)
        return f"{probe_id}#{clock}"

    def history(self) -> list[dict]:
        """The ordered probe stream (by logicalClock)."""
        return list(self.events)
