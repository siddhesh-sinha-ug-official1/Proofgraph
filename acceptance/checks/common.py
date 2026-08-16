"""common — env bootstrap, the check registry and shared utilities.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
Importing this module performs the runner's original bootstrap: UTF-8
console, sys.path → proofgraph root, outerwall + hub imports.
"""
from __future__ import annotations

import hashlib
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):     # Windows cp1252 console honesty:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ACCEPTANCE_DIR = Path(__file__).resolve().parents[1]
ROOT = ACCEPTANCE_DIR.parent                     # proofgraph/
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import outerwall                                              # noqa: E402
from outerwall import analyze_session, system_pins            # noqa: E402,F401

outerwall.ensure_assembly_paths()
import pipeline as hub_pipeline                                # noqa: E402,F401
import server as hub_server                                    # noqa: E402,F401

FIXTURES = ACCEPTANCE_DIR / "fixtures"
EVIDENCE_DIR = ACCEPTANCE_DIR / "evidence"
HEADLESS_DIR = ACCEPTANCE_DIR / "headless"
APP_DIR = ROOT / "app"
AI_DIR = ROOT / "ai"

MOAT_CFG = {"extractor": {"roots": ["moatpkg.core"],
                          "python_package": "moatpkg",
                          "pyright_mode": "live"}}
LEAN_CFG = {"extractor": {"pyright_mode": "none"}}

IS_WIN = os.name == "nt"
NPX = "npx.cmd" if IS_WIN else "npx"
NPM = "npm.cmd" if IS_WIN else "npm"


# ---------------------------------------------------------------------------
# check registry — named checks, PASS/FAIL, evidence; never silent
# ---------------------------------------------------------------------------

CHECKS: list[dict] = []
BOUNDS_HIT: list[str] = []
CLASSES_EXERCISED: list[str] = []


def check(name: str, passed: bool, detail: str, evidence=None) -> bool:
    CHECKS.append({"name": name, "pass": bool(passed), "detail": detail,
                   "evidence": evidence})
    print(f"[{'PASS' if passed else 'FAIL'}] {name}: {detail}", flush=True)
    return bool(passed)


def skip(name: str, detail: str) -> None:
    CHECKS.append({"name": name, "pass": None, "detail": detail,
                   "evidence": None})
    print(f"[SKIP] {name}: {detail}", flush=True)


def bound(text: str) -> None:
    if text not in BOUNDS_HIT:
        BOUNDS_HIT.append(text)


def exercised(cls: str) -> None:
    if cls not in CLASSES_EXERCISED:
        CLASSES_EXERCISED.append(cls)


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def wait_port(port: int, timeout_s: float,
              hosts=("127.0.0.1", "::1")) -> bool:
    """True once ANY loopback family answers — vite v5 binds ::1-only on
    Windows/Node>=17 (localhost resolves IPv6 first); the hub binds IPv4."""
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        for host in hosts:
            try:
                with socket.create_connection((host, port), timeout=1):
                    return True
            except OSError:
                continue
        time.sleep(0.5)
    return False


def kill_tree(proc: subprocess.Popen) -> None:
    if proc is None or proc.poll() is not None:
        return
    if IS_WIN:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       capture_output=True)
    else:
        proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


def run_node(args: list[str], timeout_s: int, cwd: Path = ROOT):
    """Run a node/npx child, return (rc, stdout, stderr).

    [H5] On TimeoutExpired the whole tree is taskkill /T'd BEFORE we drain
    the pipes: the node child spawns headless Chromium, and subprocess.run's
    own timeout path (proc.kill()+communicate()) only reaps node and blocks
    on the browser's still-open handles (orphaned-subprocess-tree).  After
    tree-kill all pipe writers close and communicate() sees EOF."""
    proc = subprocess.Popen(args, cwd=str(cwd), stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True,
                            encoding="utf-8", errors="replace", shell=False)
    try:
        out, err = proc.communicate(timeout=timeout_s)
        return proc.returncode, out or "", err or ""
    except subprocess.TimeoutExpired:
        kill_tree(proc)
        try:
            out, err = proc.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            out, err = "", ""
        raise subprocess.TimeoutExpired(
            cmd=args, timeout=timeout_s,
            output=(out or "") + f"\n[run_node] TIMEOUT after {timeout_s}s "
                                 f"(tree-killed)",
            stderr=err or "")


def last_json_line(stdout: str, key: str | None = None) -> dict | None:
    """Last parseable JSON object line (optionally requiring a key)."""
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        if key is None or key in obj:
            return obj
    return None


def http_get(port: int, path: str) -> tuple[int, bytes]:
    import urllib.error
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}") as r:
            return r.status, r.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()


def offsets_of(payload: bytes, node_id: str) -> list[int]:
    needle = b'"' + node_id.encode("utf-8") + b'"'
    offs, start = [], 0
    while True:
        i = payload.find(needle, start)
        if i < 0:
            break
        offs.append(i + 1)
        start = i + 1
    return offs


def ids_by_name(analysis: dict) -> dict:
    return {n["name"]: n["id"] for n in analysis["graph"]["nodes"]}


def all_statuses(analysis: dict) -> list[str]:
    out = []
    for n in analysis["graph"]["nodes"]:
        out += [n["fill"]["status"], n["outline"]["status"]]
    for v in analysis["verdicts"].values():
        out += [v["fill"]["status"], v["outline"]["status"]]
    return out
