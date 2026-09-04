"""The Capability result type + the module-global last-run diagnostic state
(dump() / history() — Probe Density Contract §4/§6).  Split out SUB200 from
capability.py; the facade re-exports this whole surface, and the wall keeps
reaching it through the `capability.capability` module attributes."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field

from .handle import Handle

_LAST_LOCK = threading.Lock()
_LAST = {"bus": None, "state": {}}


@dataclass
class Capability:
    lang: str
    tier: str                    # the MEASURED depth tier (never the paper guess)
    handle: Handle
    honestCeiling: str
    paperTier: str               # the rubric's provisional claim (gap = a lead)
    provenance: dict
    probeReport: dict            # the P0–P11 evidence that DECIDED the tier
    probeStream: list = field(default_factory=list, repr=False)


def dump() -> dict:
    """The ENTIRE internal state of the last (or in-flight) run."""
    with _LAST_LOCK:
        s = _LAST["state"]
        return {
            "discovery": s.get("discovery"),
            "scorecard": s.get("scorecard"),
            "treewalk": s.get("treewalk"),
            "shimState": s.get("shimState"),
            "battery": s.get("battery"),
            "cache": s.get("cache"),
            "libInventory": s.get("libInventory"),
            "capability": s.get("capability"),
        }


def history() -> list[dict]:
    """The ordered probe stream (by logicalClock) for the last run."""
    with _LAST_LOCK:
        bus = _LAST["bus"]
    return bus.history() if bus else []
