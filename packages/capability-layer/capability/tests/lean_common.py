"""Shared harness for the Gate-17 lean gates (17 / 17b): the one live
capability_wall('lean') run over the real toolchain server, the orphan-sweep
PID baseline, and the LOUD lake-availability skip (mirrors Gate 16's npx
gate).  One live run is shared by every test in the lean gates (module
cache) — the run is expensive (lake build + two real server spawns: cold
start + P11 restart)."""

import os
import shutil
import subprocess
import unittest

from capability.tests.wall_common import _events, _load_wall  # noqa: F401


def _lean_pids() -> set[str]:
    """PIDs of lean/lake processes — the orphan-sweep baseline.  The spawned
    chain is 4 deep (elan shim lake → real lake → lean watchdog → lean file
    workers); killing only the top orphans the rest (failure class:
    orphaned-subprocess-tree)."""
    pids: set[str] = set()
    if os.name == "nt":
        for image in ("lean.exe", "lake.exe"):
            cp = subprocess.run(
                ["tasklist", "/FI", f"IMAGENAME eq {image}", "/FO", "CSV"],
                capture_output=True, text=True)
            for line in (cp.stdout or "").splitlines():
                parts = [p.strip('"') for p in line.split('","')]
                if len(parts) >= 2 and parts[0].lower() == image:
                    pids.add(parts[1])
    else:
        for name in ("lean", "lake"):
            try:
                cp = subprocess.run(
                    ["pgrep", "-x", name],
                    capture_output=True, text=True)
                for line in (cp.stdout or "").strip().splitlines():
                    if line.strip():
                        pids.add(line.strip())
            except FileNotFoundError:
                pass  # pgrep not installed
    return pids


def _lake_available() -> bool:
    if shutil.which("lake") is not None:
        return True
    # Check the elan default shim location.
    if os.name == "nt":
        return os.path.exists(
            os.path.expandvars(r"%USERPROFILE%\.elan\bin\lake.exe"))
    return os.path.exists(os.path.expanduser("~/.elan/bin/lake"))


_STATE: dict = {}


def get_lean_wall():
    """One shared live run: capability_wall('lean') over the real toolchain
    server."""
    if "error" in _STATE:
        raise _STATE["error"]
    if "wall" not in _STATE:
        if not _lake_available():
            raise unittest.SkipTest(
                "LOUD SKIP: lake unavailable — the live lean battery was NOT "
                "measured (the ybg fixture gates still run)")
        _STATE["lean_pids_before"] = _lean_pids()
        WALL = _load_wall()
        _STATE["WALL"] = WALL
        wall = WALL["capability_wall"]("lean")
        _STATE["wall"] = wall
        # snapshot the pins for THIS run immediately (dump/history are
        # module-global last-run state)
        _STATE["hist"] = wall.pins.history()
        _STATE["dump"] = wall.pins.dump()
    return _STATE["wall"]
