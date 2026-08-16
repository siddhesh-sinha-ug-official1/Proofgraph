"""Shared helpers for the wall test files (test_wall_standsup.py,
test_wall_conformance.py, test_wall_rejections.py) — probe readers plus the
canonical-minted node/lead builders."""
import context  # noqa: F401  (sys.path bootstrap: cell root -> src/, wall)

from src.ids import compute_edge_identity
from src.probe import CATALOG
from wall import UNRESOLVED_PREFIX

WALL_LEAD_IDS = [e["probeId"] for e in CATALOG
                 if e["probeId"].startswith("graph-model.wall.")]


def wall_events(wall, probe_id):
    return [e for e in wall.pins.history() if e["probeId"] == probe_id]


def wall_only(wall, probe_id):
    evs = wall_events(wall, probe_id)
    assert len(evs) == 1, f"expected exactly one {probe_id}, got {len(evs)}"
    return evs[0]


def make_node(nid, kind="function", name="x", origin="assumed", fill=None):
    return {"id": nid, "kind": kind, "lang": "python", "name": name,
            "signature": None,
            "span": {"file": "f.py", "byteStart": 0, "byteEnd": 1},
            "fill": dict(fill) if fill else
                    {"status": "unknown", "source": "skeleton:no-compiler-attached"},
            "outline": None, "origin": origin,
            "provenance": {"tier": "T1", "extractor": "test.wall", "resolved": True}}


def make_lead(kind, src_id, raw_name):
    dst = UNRESOLVED_PREFIX + raw_name
    return {"id": compute_edge_identity(kind, src_id, dst)["edgeId"],
            "kind": kind, "srcId": src_id, "dstId": dst,
            "resolved": False, "resolver": "",
            "provenance": {"tier": "T2", "extractor": "test.wall"}}
