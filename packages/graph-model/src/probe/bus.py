"""The uniform probe bus (Probe Density Contract 3.1).

Every event carries the full ProbeEvent shape:
  {probeId, cellId, stage, kind, payload, logicalClock, causeId, wallNanos}

- logicalClock is a monotonic per-run counter — the ONLY ordering key.
- wallNanos is real time in a SEPARATE field, never used for ordering.
- causeId chains each event to the "probeId@clock" ref that caused it.
- Emitting a probeId absent from the catalog, or with a kind that mismatches
  the catalog, is a hard error (CatalogHoleError) — Contract 3.3.
- Secrets are the ONE redaction (Contract 3.9): presence + last-4 only.
"""
import re
import time
from copy import deepcopy

from .catalog import CATALOG, CATALOG_BY_ID, CELL_ID


class CatalogHoleError(Exception):
    """A lead fired that is not in the catalog (or with the wrong kind)."""


_SECRET_KEY_RE = re.compile(r"(?i)(api[_-]?key|token|secret|password|authorization|credential)")


def redact_secrets(payload):
    """Recursively mask secret-shaped values: presence + last-4 only (Contract 3.9)."""
    if isinstance(payload, dict):
        out = {}
        for k, v in payload.items():
            if isinstance(k, str) and _SECRET_KEY_RE.search(k) and isinstance(v, str):
                out[k] = f"<redacted:present:last4={v[-4:]}>"
            else:
                out[k] = redact_secrets(v)
        return out
    if isinstance(payload, list):
        return [redact_secrets(v) for v in payload]
    return payload


class ProbeBus:
    def __init__(self):
        self._history = []
        self._clock = 0
        self._taps = {}  # probeId -> {handle: callback}
        self._tap_seq = 0

    # ---- emission ----
    def emit(self, probe_id, stage, kind, payload, cause=None):
        """Emit one probe event; returns its "probeId@clock" ref for causal chaining."""
        entry = CATALOG_BY_ID.get(probe_id)
        if entry is None:
            raise CatalogHoleError(
                f"failure-class=catalog-hole: probe '{probe_id}' fired but is not in probeCatalog()")
        if entry["kind"] != kind:
            raise CatalogHoleError(
                f"failure-class=catalog-hole: probe '{probe_id}' fired with kind '{kind}' "
                f"but the catalog declares '{entry['kind']}'")
        event = {
            "probeId": probe_id,
            "cellId": CELL_ID,
            "stage": stage,
            "kind": kind,
            "payload": redact_secrets(deepcopy(payload)),
            "logicalClock": self._clock,
            "causeId": cause,
            "wallNanos": time.time_ns(),
        }
        ref = f"{probe_id}@{self._clock}"
        self._clock += 1
        self._history.append(event)
        for cb in list(self._taps.get(probe_id, {}).values()):
            cb(event)
        return ref

    # ---- introspection (Contract 3.4) ----
    def history(self):
        """The ordered probe stream for the last run (deterministic by logicalClock)."""
        return list(self._history)

    def catalog(self):
        return deepcopy(CATALOG)

    def tap(self, probe_id, callback):
        """Subscribe to one live lead; returns an unsubscribe callable."""
        if probe_id not in CATALOG_BY_ID:
            raise CatalogHoleError(
                f"failure-class=catalog-hole: cannot tap unknown probe '{probe_id}'")
        handle = self._tap_seq
        self._tap_seq += 1
        self._taps.setdefault(probe_id, {})[handle] = callback

        def unsubscribe():
            self._taps.get(probe_id, {}).pop(handle, None)
        return unsubscribe

    @property
    def clock(self):
        return self._clock

    def reset_run(self):
        """New run: history and clock reset (history() is per-run); taps survive."""
        self._history = []
        self._clock = 0
