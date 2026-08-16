"""Shared helpers for the wall conformance test files (SUB200 restructure:
test_wall_conformance.py split into test_wall_conformance.py /
test_wall_face.py — total test count unchanged, no assertion touched)."""
import sys

from harness import TREE

# canonical mint, imported flat like test_schema_sync.py does
SCHEMA_PKG = TREE.parent / "schema"
sys.path.append(str(SCHEMA_PKG))
import ids as canonical_ids            # noqa: E402,F401
sys.path.remove(str(SCHEMA_PKG))

SKELETON_CFG = {"roots": ["pkg.a"], "python_package": "pkg", "pyright_mode": "none"}
FACE_KEYS = ["edges", "honestCeilings", "leads", "nodes", "schemaVersion"]
# The frozen pre-wall census (seam map): 131 at wall promotion, +11 additive
# LEAN-DOCK-round leads (9 CT-driver + 2 assemble green-guard), +1 additive
# REAL-INPUTS-round lead (extractor.t2.lean.decl.match — the disambiguated
# driver-decl -> node assignment).  Additive ONLY — the original entries are
# all still present, asserted below.
PRE_WALL_CATALOG_COUNT = 143


def _payloads(wall, probe_id):
    return [e["payload"] for e in wall.pins.history() if e["probeId"] == probe_id]


def _one(wall, probe_id):
    ps = _payloads(wall, probe_id)
    assert len(ps) >= 1, f"expected at least one {probe_id} event"
    return ps[-1]
