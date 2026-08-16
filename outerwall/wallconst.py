"""wallconst.py — the outer wall's version/id constants and assembly paths.

SUB200 restructure: split out of outerwall/__init__.py (which stays the
facade re-exporting every one of these names — importers see no change).
"""
from __future__ import annotations

from pathlib import Path

OUTERWALL_VERSION = "outerwall/1.0.0"
CELL_ID = "system.outerwall"

OUTERWALL_DIR = Path(__file__).resolve().parent
PROOFGRAPH_ROOT = OUTERWALL_DIR.parent
PACKAGES = PROOFGRAPH_ROOT / "packages"
VESSELS_DIR = PROOFGRAPH_ROOT / "vessels"
HUB_DIR = PROOFGRAPH_ROOT / "hub"

# The canonical assembly PIN — hard-coded on purpose (WALL-CONVENTIONS rule 4).
SCHEMA_PIN_VERSION = "v0"
SCHEMA_PIN_HASH = "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c"
