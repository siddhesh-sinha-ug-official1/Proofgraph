"""Shared harness for the Section-9 test gates.

Full pipeline runs are expensive (a live shim + many ybc subprocesses), so each
named run happens once and is shared across gates. Taps that must observe a run
are registered here, BEFORE any run starts.
"""

from __future__ import annotations

import atexit
import os

from capability import tap
from capability.capability import capability

_LAYER_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))

_RUNS: dict = {}
_HANDLES: list = []

# live-lead observation (asserted by the skeleton gate): registered before ANY run
TAPPED_CHECK_CALLS: list = []
_untap = tap("capability.shim.check.call", TAPPED_CHECK_CALLS.append)


def work_dir(key: str) -> str:
    d = os.path.join(_LAYER_ROOT, ".testtmp", key)
    os.makedirs(d, exist_ok=True)
    return d


_CONFIGS = {
    # ct and ct2 share one work_dir on purpose: identical config ⇒ the two probe
    # streams must be identical after normalization (gate 13).
    "ct": ("yaddabinggiberish", lambda: {"work_dir": work_dir("ct")}),
    "ct2": ("yaddabinggiberish", lambda: {"work_dir": work_dir("ct")}),
    "awk": ("awk", lambda: {"work_dir": work_dir("awk")}),
    "zigish": ("zigish", lambda: {"work_dir": work_dir("zigish")}),
    "cap1": ("yaddabinggiberish", lambda: {"work_dir": work_dir("cap1"),
                                           "max_refs": 1}),
    # a client that offers ONLY utf-16: the shim must honor it end-to-end
    "utf16": ("yaddabinggiberish", lambda: {"work_dir": work_dir("utf16"),
                                            "client_encodings": ["utf-16"]}),
}


def get_run(key: str):
    if key not in _RUNS:
        if key == "ct2" and "ct" not in _RUNS:
            get_run("ct")  # ct must complete first (shared work_dir, sequential)
        lang, cfg = _CONFIGS[key]
        cap = capability(lang, config=cfg())
        _RUNS[key] = cap
        _HANDLES.append(cap.handle)
    return _RUNS[key]


def events_of(cap, probe_id: str) -> list:
    return [e for e in cap.probeStream if e["probeId"] == probe_id]


def result_of(cap, pid: str) -> dict:
    """The ProbeResult payload for probe id like 'p2'."""
    evs = events_of(cap, f"capability.probe.{pid}")
    assert evs, f"no capability.probe.{pid} event"
    return evs[-1]["payload"]


def _scrub(v):
    if isinstance(v, dict):
        return {k: ("<pid>" if k in ("pid", "processId") else _scrub(x))
                for k, x in v.items()}
    if isinstance(v, list):
        return [_scrub(x) for x in v]
    return v


def normalize_stream(events: list) -> list:
    """Determinism view: wallNanos stripped (a separate field, never ordered on),
    pids scrubbed. Everything else — including logicalClock and causeId — kept."""
    return [{"probeId": e["probeId"], "kind": e["kind"], "stage": e["stage"],
             "logicalClock": e["logicalClock"], "causeId": e["causeId"],
             "payload": _scrub(e["payload"])} for e in events]


@atexit.register
def _shutdown_handles():
    for h in _HANDLES:
        try:
            h.shutdown()
        except Exception:
            pass
