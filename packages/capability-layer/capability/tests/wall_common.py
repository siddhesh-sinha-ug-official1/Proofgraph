"""Shared wall-loading helpers for the wall gates (15 / 15b / 17 / 17b).

Loading strategy (unchanged from the original single-file gates): wall.py
lives at the package ROOT (outside capability/), so it is loaded by
file-read + exec — the same canonical-as-data pattern as test_13_schema_sync
— keeping importgate.py's ALLOWED lists honest and unchanged.
"""

from pathlib import Path

# .../capability-layer/capability/tests/... -> parents[2] == capability-layer
_WALL_PATH = Path(__file__).resolve().parents[2] / "wall.py"


def _load_wall() -> dict:
    ns = {"__name__": "capability_layer_wall", "__file__": str(_WALL_PATH)}
    source = _WALL_PATH.read_text(encoding="utf-8")
    exec(compile(source, str(_WALL_PATH), "exec"), ns)
    return ns


# One shared load for the gate-15 files (the original test_15 loaded it once
# at module import; 15 and 15b keep sharing that single namespace).
WALL = _load_wall()


def _events(hist, probe_id):
    return [e for e in hist if e["probeId"] == probe_id]
