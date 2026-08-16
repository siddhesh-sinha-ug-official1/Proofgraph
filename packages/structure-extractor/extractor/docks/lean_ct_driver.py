"""S2 · Lean DOCK — CT kernel-driver invocation + stdout parsing.

Shells out to the kernel-grade driver (`lean --run Driver.lean <file>`,
cwd = extractor/docks/lean_driver/ so the adjacent lean-toolchain file pins
leanprover/lean4:v4.31.0) and consumes its ONE-line JSON document.
Driver-dead (timeout/crash/bad-json) is a TYPED failure: tree-killed on
timeout (taskkill /T — the elan shim spawns a child lean), probed by the
caller as extractor.t2.lean.driver.dead.

Split from lean_dock.py (SUB200 restructure); lean_dock.py stays the facade.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

from ..probe import ProbeBus, ProbeEvent
from .lean_common import STAGE, DriverDead, _default_lean_exe


def run_driver(bus: ProbeBus, rel_path: str, abspath: Path,
               cause: ProbeEvent | None, *, lean_exe: str | None,
               driver_dir: Path, timeout_s: float) -> tuple[dict, str, int]:
    """Invoke the kernel driver on ONE file. Returns (doc, runSha16, exit).
    Raises DriverDead (typed) on timeout/crash/bad JSON — probed by caller."""
    exe = lean_exe or _default_lean_exe()
    if exe is None:
        raise DriverDead("driver-crash",
                         "no lean binary (set LEAN_EXE or install elan)")
    cmd = [exe, "--run", "Driver.lean", str(abspath)]
    inv = bus.emit("extractor.t2.lean.driver.invoke", STAGE, "call", {
        "file": rel_path, "cmd": cmd, "cwd": str(driver_dir),
        "timeoutS": timeout_s}, cause=cause)
    bus.emit("extractor.backend.leanDriver.req", STAGE, "call",
             {"file": rel_path, "cmd": cmd}, cause=inv)
    t0 = time.time_ns()
    try:
        proc = subprocess.Popen(cmd, cwd=str(driver_dir),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8")
    except OSError as exc:
        raise DriverDead("driver-crash", f"spawn failed: {exc}") from exc
    try:
        stdout, stderr = proc.communicate(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        # tree-kill discipline (cell precedent, pyright_backend.close):
        # the elan shim spawns a child lean — killing the shim alone
        # orphans it; taskkill /T reaps the tree.
        if sys.platform == "win32":
            try:
                subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                               capture_output=True, timeout=15)
            except Exception:
                pass
        try:
            proc.kill()
        except Exception:
            pass
        try:
            proc.wait(timeout=10)
        except Exception:
            pass
        bus.emit("extractor.backend.timeout", STAGE, "error", {
            "backend": "lean-driver", "cmd": " ".join(cmd),
            "ms": int(timeout_s * 1000)}, cause=inv)
        raise DriverDead("driver-timeout",
                         f"driver exceeded {timeout_s}s on {rel_path}") \
            from None
    finally:
        bus.emit("extractor.t2.lean.driver.timing", STAGE, "timing", {
            "file": rel_path, "wallNanos": time.time_ns() - t0}, cause=inv)
    if proc.returncode not in (0, 1):
        raise DriverDead("driver-crash",
                         f"exit {proc.returncode}; stderr={stderr[:400]!r}")
    try:
        doc = json.loads(stdout)
    except (json.JSONDecodeError, TypeError) as exc:
        raise DriverDead("driver-bad-json",
                         f"stdout unparseable ({exc}); head={stdout[:200]!r}") \
            from exc
    run_sha = hashlib.sha256(stdout.encode("utf-8")).hexdigest()[:16]
    bus.emit("extractor.backend.leanDriver.resp", STAGE, "call", {
        "file": rel_path, "exit": proc.returncode, "runSha": run_sha,
        "doc": doc}, cause=inv)
    return doc, run_sha, proc.returncode
