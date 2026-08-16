"""Shared test bootstrap.  Every test asserts on PROBE OUTPUT (Contract 3.7);
return values alone are insufficient."""
import sys
from pathlib import Path

CELL_ROOT = Path(__file__).resolve().parents[1]
if str(CELL_ROOT) not in sys.path:
    sys.path.insert(0, str(CELL_ROOT))

from src.cell import GraphModelCell  # noqa: E402

# Appendix B goldens
GOLDEN_SAMPLE_SHA = "43c921b9a6b016cb03dc7b0a0e5898938a436a643a749bf41e0cf39d194d9548"
MODULE_ID = "n_baeb074b4cfa2016"
A_ID = "n_76287cc71e90c629"
B_ID = "n_7559f2b1db420f7d"
C_ID = "n_cab47a3389cd7f34"
EDGE_AB_ID = "e_b501b35da5a20ae1"
ALL_IDS = sorted([MODULE_ID, A_ID, B_ID, C_ID])


def run_cell(input_path="fixtures/sample.py", roots_path="fixtures/roots.json", **kw):
    cell = GraphModelCell(CELL_ROOT)
    result = cell.run(input_path, roots_path, **kw)
    return cell, result


def events(cell, probe_id):
    return [e for e in cell.history() if e["probeId"] == probe_id]


def only(cell, probe_id):
    evs = events(cell, probe_id)
    assert len(evs) == 1, f"expected exactly one {probe_id}, got {len(evs)}"
    return evs[0]


def payloads(cell, probe_id):
    return [e["payload"] for e in events(cell, probe_id)]
