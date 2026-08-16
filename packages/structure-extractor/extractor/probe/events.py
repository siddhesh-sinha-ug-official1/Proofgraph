"""Probe event/catalog datatypes for the uniform probe bus (spec §3).

Split from bus.py (SUB200 restructure): the typed event record, the catalog
entry record, the probe-kind vocabulary, the typed catalog errors, and the one
sanctioned redaction.  The bus itself (emission, ordering, taps) stays in
bus.py, which re-exports everything here — one probe surface, two files.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

CELL_ID = "tree3.structure-extractor"

PROBE_KINDS = (
    "input", "output", "value", "decision", "branch", "edge", "node",
    "state", "call", "timing", "error",
)

_SECRET_KEY_RE = re.compile(r"(?i)(token|secret|api[_-]?key|password|passwd|authorization|bearer)")


class UncataloguedProbeError(RuntimeError):
    """A lead fired that probeCatalog() does not enumerate (Probe Density §3)."""


class ProbeKindMismatchError(RuntimeError):
    """A lead fired with a kind different from its catalog declaration."""


def _redact(payload: Any) -> Any:
    """Secrets are the one redaction: show presence + last-4 only (Probe Density §9)."""
    if isinstance(payload, dict):
        out = {}
        for k, v in payload.items():
            if isinstance(k, str) and _SECRET_KEY_RE.search(k) and isinstance(v, str):
                out[k] = f"<redacted:…{v[-4:]}>" if len(v) >= 4 else "<redacted>"
            else:
                out[k] = _redact(v)
        return out
    if isinstance(payload, (list, tuple)):
        return [_redact(v) for v in payload]
    return payload


@dataclass(frozen=True)
class CatalogEntry:
    probeId: str
    kind: str
    payloadType: str
    description: str

    def to_dict(self) -> dict:
        return {
            "probeId": self.probeId,
            "kind": self.kind,
            "payloadType": self.payloadType,
            "description": self.description,
        }


@dataclass
class ProbeEvent:
    probeId: str
    cellId: str
    stage: str
    kind: str
    payload: Any
    logicalClock: int
    causeId: str | None
    wallNanos: int | None

    def ref(self) -> str:
        """Stable causal reference for this event: probeId + logicalClock."""
        return f"{self.probeId}#{self.logicalClock}"

    def to_dict(self, strip_wall: bool = False) -> dict:
        payload = self.payload
        if strip_wall and self.kind == "timing" and isinstance(payload, dict) \
                and "wallNanos" in payload:
            # real time lives ONLY in wallNanos fields — determinism is judged
            # modulo every one of them, including timing payloads
            payload = {**payload, "wallNanos": None}
        d = {
            "probeId": self.probeId,
            "cellId": self.cellId,
            "stage": self.stage,
            "kind": self.kind,
            "payload": payload,
            "logicalClock": self.logicalClock,
            "causeId": self.causeId,
        }
        if not strip_wall:
            d["wallNanos"] = self.wallNanos
        return d
