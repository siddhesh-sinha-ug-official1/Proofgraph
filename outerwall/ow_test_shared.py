"""ow_test_shared.py — shared fixtures/helpers for the outer-wall suite.

SUB200 restructure: split out of outerwall/test_outerwall.py (which stays
the discovering aggregator — `python outerwall/test_outerwall.py` runs the
same 41 tests).  The expensive analyze_session worlds (MOAT/RICH/LEAN/
LEANCT/CEILING/XYZ) are built LAZILY and memoized per process, so the
aggregated run computes each exactly once (same total work as the old
single-module setUpModule) and a split module run standalone builds only
what it needs.  Configs, helpers and the TRACE seed are verbatim from the
original module.
"""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

OUTERWALL_DIR = Path(__file__).resolve().parent
PROOFGRAPH_ROOT = OUTERWALL_DIR.parent
if str(PROOFGRAPH_ROOT) not in sys.path:
    sys.path.insert(0, str(PROOFGRAPH_ROOT))

from outerwall import analyze_session                     # noqa: E402

ACCEPTANCE = PROOFGRAPH_ROOT / "acceptance" / "fixtures"
SX_FIXTURES = PROOFGRAPH_ROOT / "packages" / "structure-extractor" / "fixtures"
TRACE_SEED = json.loads(
    (PROOFGRAPH_ROOT / "vessels" / "TRACE-node.json").read_text("utf-8"))

MOAT_CFG = {"extractor": {"roots": ["moatpkg.core"],
                          "python_package": "moatpkg",
                          "pyright_mode": "live"}}
RICH_CFG = {"extractor": {
    "roots": ["richpkg.core", "richpkg.models", "richpkg.dyn",
              "richpkg.core.alpha"],
    "python_package": "richpkg",
    "pyright_mode": "recorded",
    "pyright_recording_path":
        SX_FIXTURES / "pyright" / "richpkg.recorded.json"}}
LEAN_CFG = {"extractor": {"pyright_mode": "none"}}

_SESSIONS: dict[str, dict] = {}


def _build_xyz() -> dict:
    xyz_root = Path(tempfile.mkdtemp(prefix="outerwall-xyz-")) / "src"
    xyz_root.mkdir()
    (xyz_root / "mystery.xyz").write_text("blorp blorp\n", encoding="utf-8")
    return analyze_session(xyz_root, config=LEAN_CFG)


_BUILDERS = {
    "MOAT": lambda: analyze_session(ACCEPTANCE / "moatpkg",
                                    roots=["moatpkg.core"], config=MOAT_CFG),
    "RICH": lambda: analyze_session(SX_FIXTURES / "pyrich",
                                    roots=["richpkg.core.alpha"],
                                    config=RICH_CFG),
    "LEAN": lambda: analyze_session(ACCEPTANCE / "unused_hyp.lean",
                                    config=LEAN_CFG),
    # green-flow round: sorry coverage at the outer wall — cell 3's own CT
    # fixture (READ-ONLY, the pyrich precedent) carries the four verdict
    # cases incl. sorry_case -> amber.
    "LEANCT": lambda: analyze_session(SX_FIXTURES / "lean_ct"
                                      / "Verified.lean", config=LEAN_CFG),
    "CEILING": lambda: analyze_session(ACCEPTANCE / "honest_ceiling.typ",
                                       config=LEAN_CFG),
    "XYZ": _build_xyz,
}


def session(key: str) -> dict:
    """Memoized analyze_session world — one build per process."""
    if key not in _SESSIONS:
        _SESSIONS[key] = _BUILDERS[key]()
    return _SESSIONS[key]


def names_of(session):
    return {n["id"]: n["name"] for n in session["analysis"]["graph"]["nodes"]}


def id_of(session, name):
    return {v: k for k, v in names_of(session).items()}[name]


def all_statuses(session):
    a = session["analysis"]
    out = []
    for n in a["graph"]["nodes"]:
        out.append(n["fill"]["status"])
        out.append(n["outline"]["status"])
    for v in a["verdicts"].values():
        out.append(v["fill"]["status"])
        out.append(v["outline"]["status"])
    return out
