"""Shared fixture bundles for the V3 connector suite (SUB200 restructure).

Split out of vessels/test_v3_extractor_to_model.py, which remains the
runnable AGGREGATOR (run_all_suites and faultcheck invoke it by path).  The
split modules (test_v3_byte_identity / test_v3_accounting /
test_v3_semantics / test_v3_negatives) all stand on the SAME two Bundles
built here lazily — exactly the original setUpModule: the skeleton and rich
fixtures extracted through the extractor wall and ingested through the
model wall (stub capability; the real one is V1's scope, not V3's).
"""
from __future__ import annotations

import sys
from pathlib import Path

VESSELS = Path(__file__).resolve().parent
if str(VESSELS) not in sys.path:
    sys.path.insert(0, str(VESSELS))

import pathing  # noqa: E402

# Walls loaded THROUGH the vessel pathing helper — never `import wall` (the
# dual root-wall.py ambiguity, pathing.py failure mode 1).
sx_wall_mod = pathing.load_wall("structure-extractor")
gm_wall_mod = pathing.load_wall("graph-model")
ids = pathing.load_schema_module("ids")   # the CANONICAL mint

SX_ROOT = pathing.cell_root("structure-extractor")
FIXTURES = SX_ROOT / "fixtures"

# Cell 3's own fixture configs (mirrors selftest/harness.py; stub capability
# by default — V1 wires the real one, out of V3 scope).
SKELETON_CFG = {"roots": ["pkg.a"], "python_package": "pkg",
                "pyright_mode": "none"}
RICH_ROOTS = ["richpkg.core", "richpkg.models", "richpkg.dyn",
              "richpkg.core.alpha"]
RICH_CFG = {"roots": list(RICH_ROOTS), "python_package": "richpkg",
            "pyright_mode": "recorded",
            "pyright_recording_path": FIXTURES / "pyright" / "richpkg.recorded.json"}
RICH_ENTRY = "richpkg.core.alpha"          # the fixture's entry decl


def wall_payloads(wall, probe_id):
    """Filter a wall's pin history to payloads matching one probe id."""
    return [e["payload"] for e in wall.pins.history() if e["probeId"] == probe_id]


# Aliases kept so existing test call sites don't need to change.
sx_payloads = wall_payloads
gm_payloads = wall_payloads


def as_bytes(s: str) -> bytes:
    return s.encode("utf-8")


def byte_set(strings) -> set[bytes]:
    return {as_bytes(s) for s in strings}


class Bundle:
    """One fixture, extracted through the extractor wall and ingested through
    the model wall — the composed seam under test."""

    def __init__(self, name: str, fixture_dir: Path, cfg: dict,
                 entry_name: str | None):
        self.name = name
        self.sx = sx_wall_mod.extract_wall(cfg)          # one wall = one stream
        self.env = self.sx.extract(fixture_dir)
        self.node_id_by_name = {n["name"]: n["id"] for n in self.env["nodes"]}
        self.roots = [self.node_id_by_name[entry_name]] if entry_name else []
        self.gm = gm_wall_mod.create_wall()
        self.ingest_result = self.gm.ingest(
            self.env["nodes"], self.env["edges"], self.env["leads"],
            roots=self.roots)
        self.accepted = self.gm.pins.dump()["wall"]["ingested"]


SKELETON: Bundle | None = None
RICH: Bundle | None = None


def ensure_bundles():
    """Build the two shared bundles once (the original setUpModule)."""
    global SKELETON, RICH
    if SKELETON is None:
        SKELETON = Bundle("skeleton", FIXTURES / "python", SKELETON_CFG,
                          entry_name=None)   # all-module graph: no decl roots exist
    if RICH is None:
        RICH = Bundle("rich", FIXTURES / "pyrich", RICH_CFG,
                      entry_name=RICH_ENTRY)


def bundles():
    return (SKELETON, RICH)
