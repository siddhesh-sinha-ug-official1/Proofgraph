"""ow_real_shared.py — shared fixtures/helpers for the REAL-INPUTS suite.

SUB200 restructure: split out of outerwall/test_real_inputs.py (which stays
the discovering aggregator — `python outerwall/test_real_inputs.py` runs the
same 21 tests).  The expensive sessions (PY/LEAN + the second INDEPENDENT
byte-compare runs) are built LAZILY and memoized per process — the
aggregated run does exactly the old setUpModule's work, once.  SHA pins,
configs and helpers are verbatim from the original module.
"""
from __future__ import annotations

import sys
from pathlib import Path

OUTERWALL_DIR = Path(__file__).resolve().parent
PROOFGRAPH_ROOT = OUTERWALL_DIR.parent
if str(PROOFGRAPH_ROOT) not in sys.path:
    sys.path.insert(0, str(PROOFGRAPH_ROOT))

from outerwall import analyze_session, ensure_assembly_paths  # noqa: E402

FIXTURES = PROOFGRAPH_ROOT / "acceptance" / "fixtures"
REAL_PY = FIXTURES / "real_py" / "colorama"
REAL_LEAN = FIXTURES / "real_lean" / "src"

PY_CFG = {"extractor": {"roots": ["colorama.initialise"],
                        "python_package": "colorama",
                        "pyright_mode": "live"}}
LEAN_CFG = {"extractor": {"pyright_mode": "none"}}

# The PROVENANCE.md byte pins (single source of truth mirrored there —
# vendored REAL inputs are frozen evidence, drift is a build failure).
SHA_PINS = {
    REAL_PY / "__init__.py":
        "c1e3d0038536d2d2a060047248b102d38eee70d5fe83ca512e9601ba21e52dbf",
    REAL_PY / "ansi.py":
        "4e8a7811e12e69074159db5e28c11c18e4de29e175f50f96a3febf0a3e643b34",
    REAL_PY / "ansitowin32.py":
        "bcf3586b73996f18dbb85c9a568d139a19b2d4567594a3160a74fba1d5e922d9",
    REAL_PY / "initialise.py":
        "fa1227cbce82957a37f62c61e624827d421ad9ffe1fdb80a4435bb82ab3e28b5",
    REAL_PY / "win32.py":
        "61038ac0c4f0b4605bb18e1d2f91d84efc1378ff70210adae4cbcf35d769c59b",
    REAL_PY / "winterm.py":
        "5c24050c78cf8ba00760d759c32d2d034d87f89878f09a7e1ef0a378b78ba775",
    REAL_LEAN / "ByCases.lean":
        "3270f4bafaf99ca67f69b57972d0c3ef73e0ba46d359c8cd4645be254ac97965",
    REAL_LEAN / "Classical.lean":
        "23abb81f0a18f68badec8b2f7d3f65e3017882c3cd6dabea244d1abcdb1a3b77",
    REAL_LEAN / "SizeOfLemmas.lean":
        "58b3fd3d6a8e895305eba5479667cdf2ddd54a3bfcc867809b125e8485a71d85",
}

_CACHE: dict[str, object] = {}


def _canonical(session) -> bytes:
    ensure_assembly_paths()
    import pipeline as hub_pipeline
    return hub_pipeline.canonical_json_bytes(session["analysis"])


def py_session() -> dict:
    """First colorama session (the asserted one) — memoized."""
    if "PY" not in _CACHE:
        _CACHE["PY"] = analyze_session(REAL_PY, roots=["colorama.initialise"],
                                       config=PY_CFG)
    return _CACHE["PY"]


def py_bytes() -> bytes:
    if "PY_BYTES" not in _CACHE:
        _CACHE["PY_BYTES"] = _canonical(py_session())
    return _CACHE["PY_BYTES"]


def py2_bytes() -> bytes:
    """Second INDEPENDENT colorama run, canonical bytes only — memoized."""
    if "PY2_BYTES" not in _CACHE:
        _CACHE["PY2_BYTES"] = _canonical(analyze_session(
            REAL_PY, roots=["colorama.initialise"], config=PY_CFG))
    return _CACHE["PY2_BYTES"]


def lean_session() -> dict:
    if "LEAN" not in _CACHE:
        _CACHE["LEAN"] = analyze_session(REAL_LEAN, config=LEAN_CFG)
    return _CACHE["LEAN"]


def lean_bytes() -> bytes:
    if "LEAN_BYTES" not in _CACHE:
        _CACHE["LEAN_BYTES"] = _canonical(lean_session())
    return _CACHE["LEAN_BYTES"]


def lean2_bytes() -> bytes:
    """Second INDEPENDENT lean run (fresh capability battery, fresh driver
    invocations), canonical bytes only — memoized."""
    if "LEAN2_BYTES" not in _CACHE:
        _CACHE["LEAN2_BYTES"] = _canonical(
            analyze_session(REAL_LEAN, config=LEAN_CFG))
    return _CACHE["LEAN2_BYTES"]


def names_of(session):
    return {n["id"]: n["name"] for n in session["analysis"]["graph"]["nodes"]}


def id_of(session, name):
    return {v: k for k, v in names_of(session).items()}[name]
