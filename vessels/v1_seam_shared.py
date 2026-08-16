"""Shared fixture stack for the V1 connector suite (SUB200 restructure).

Split out of vessels/test_v1.py, which remains the runnable AGGREGATOR
(`python vessels/test_v1.py` — run_all_suites invokes it by path).  The
split modules (test_v1_live_python / test_v1_langs_lifecycle) stand on ONE
shared stack built here lazily — exactly the original setUpClass: the live
V1CapabilityFeed plus the five wall extractions (python live-CT, the
labelled reduced-S double, awk, lean, latex).  Cleanup (feed.shutdown + the
awk temp dir) runs at process exit, preserving the original tearDownClass
safety net; test_z still owns the EXPLICIT shutdown.
"""
from __future__ import annotations

import atexit
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from v1_capability_extractor import (  # noqa: E402
    CAP_ROOT, EXT_ROOT, CapabilityHandle, UnknownLanguageError,
    V1CapabilityFeed, extract_wall)

FIXTURES = EXT_ROOT / "fixtures"
RICH_ROOTS = ["richpkg.core", "richpkg.models", "richpkg.dyn", "richpkg.core.alpha"]

GUARD_PIN = "extractor.tier.enforcement.violation"
RESPONSE_PIN = "extractor.ingest.capability.response"
REQUEST_PIN = "extractor.ingest.capability.request"


def _events(hist, probe_id):
    return [e for e in hist if e["probeId"] == probe_id]


def _node_pids() -> set[str]:
    if os.name != "nt":
        return set()
    cp = subprocess.run(["tasklist", "/FI", "IMAGENAME eq node.exe", "/FO", "CSV"],
                        capture_output=True, text=True)
    pids = set()
    for line in (cp.stdout or "").splitlines():
        parts = [p.strip('"') for p in line.split('","')]
        if len(parts) >= 2 and parts[0].lower() == "node.exe":
            pids.add(parts[1])
    return pids


# ---- the shared stack (original V1Connector.setUpClass, built once) --------

node_before: set[str] = None
feed: V1CapabilityFeed = None
wall_py = env_py = hist_py = None
wall_s = env_s = hist_s = None
awk_handle = awk_root = wall_awk = env_awk = hist_awk = None
wall_lean = env_lean = hist_lean = None
wall_tex = env_tex = hist_tex = None

_built = False


def _cleanup():
    if feed is not None:
        feed.shutdown()   # idempotent safety net (test_z already did it)
    if awk_root is not None:
        shutil.rmtree(awk_root, ignore_errors=True)


def ensure_stack():
    global _built, node_before, feed
    global wall_py, env_py, hist_py, wall_s, env_s, hist_s
    global awk_handle, awk_root, wall_awk, env_awk, hist_awk
    global wall_lean, env_lean, hist_lean, wall_tex, env_tex, hist_tex
    if _built:
        return
    if shutil.which("npx") is None:
        raise unittest.SkipTest(
            "LOUD SKIP: npx unavailable — V1's live python seam not run")
    node_before = _node_pids()
    feed = V1CapabilityFeed()
    atexit.register(_cleanup)

    # ---- python: the rich CT path, live pyright on BOTH sides ---------
    wall_py = extract_wall()
    env_py = wall_py.extract(
        FIXTURES / "pyrich", capability_fn=feed.capability_fn,
        config={"roots": list(RICH_ROOTS), "python_package": "richpkg",
                "pyright_mode": "live"})
    hist_py = wall_py.pins.history()

    # ---- the labelled reduced-measurement double ("cell 2 measured S"):
    # honest degradation, NOT a fake — it reduces, never upgrades.
    def reduced_fn(lang: str) -> CapabilityHandle:
        return CapabilityHandle(
            lang, "S",
            "vessel-V1 TEST DOUBLE [simulated reduced measurement S — "
            "labelled; proves reduced tier => zero resolved edges]",
            None)

    wall_s = extract_wall()
    env_s = wall_s.extract(
        FIXTURES / "pyrich", capability_fn=reduced_fn,
        config={"roots": list(RICH_ROOTS), "python_package": "richpkg",
                "pyright_mode": "live"})
    hist_s = wall_s.pins.history()

    # ---- awk: cell 2 MEASURES it (G); the extractor cannot even ingest
    # .awk — the honest boundary is "no dock, no nodes, no tier consulted"
    awk_handle = feed.capability_fn("awk")
    awk_root = Path(tempfile.mkdtemp(prefix="v1_awk_"))
    shutil.copy(CAP_ROOT / "testbed" / "awk_repo" / "main.awk",
                awk_root / "main.awk")
    wall_awk = extract_wall()
    env_awk = wall_awk.extract(awk_root, capability_fn=feed.capability_fn)
    hist_awk = wall_awk.pins.history()

    # ---- lean: cell 2 MEASURES lean live since CAP-LEAN (lake battery);
    # the extractor's CT kernel-driver dock then runs for real
    wall_lean = extract_wall()
    env_lean = wall_lean.extract(
        FIXTURES / "lean", capability_fn=feed.capability_fn)
    hist_lean = wall_lean.pins.history()

    # ---- latex: cell 2 typed refusal -> recorded local-stub fallback (G)
    # (the refusal/fallback mechanism previously proven on lean — lean is
    # now measured, so the mechanism is pinned on a still-refused lang)
    wall_tex = extract_wall()
    env_tex = wall_tex.extract(
        FIXTURES / "latex", capability_fn=feed.capability_fn)
    hist_tex = wall_tex.pins.history()

    _built = True
