"""S2 · Lean DOCK — shared constants, driver-environment resolution, and the
typed driver-dead failure.

Split from lean_dock.py (SUB200 restructure); lean_dock.py stays the import
surface (facade, dock registry name stable).
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

STAGE = "S2.dock.lean"

DRIVER_DIR = Path(__file__).resolve().parent / "lean_driver"
DRIVER_TIMEOUT_S = 300.0        # cold toolchain measured at ~76s once; warm ~3s
# Cell 2's measured lean pin (packages/capability-layer, REPORT-CAP-LEAN) —
# recorded here ONLY to declare the divergence against this driver's pin.
CAP_LAYER_LEAN_PIN = "leanprover/lean4:v4.32.0"


def _default_lean_exe() -> str | None:
    cand = os.environ.get("LEAN_EXE")
    if cand and os.path.exists(cand):
        return cand
    shim = r"A:\lean\elan\bin\lean.exe"
    if os.path.exists(shim):
        return shim
    return shutil.which("lean")


def _pos_to_byte(data: bytes, line: int, col: int) -> int:
    """Driver pos {line: 1-based, col: 0-based codepoints} -> byte offset."""
    lines = data.split(b"\n")
    if line - 1 >= len(lines):
        return len(data)
    prefix = sum(len(l) + 1 for l in lines[: line - 1])
    text = lines[line - 1].decode("utf8", "replace")
    return prefix + len(text[: max(col, 0)].encode("utf8"))


class DriverDead(Exception):
    """Typed driver-dead failure; .failure_class ∈ driver-timeout |
    driver-crash | driver-bad-json."""

    def __init__(self, failure_class: str, detail: str):
        super().__init__(f"{failure_class}: {detail}")
        self.failure_class = failure_class
        self.detail = detail


def run_ref(sha16: str) -> str:
    """The driver-evidence reference every verdict cites: the sha256 (first 16
    hex) of the driver's verbatim stdout, resolvable in the probe stream via
    extractor.backend.leanDriver.resp payload.runSha."""
    return sha16
