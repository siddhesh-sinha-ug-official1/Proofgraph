"""common — env bootstrap, the check registry, HTTP + sha helpers.

Carved VERBATIM from acceptance/run_shell_demo.py (SUB200 restructure,
wave 2).  Importing this module performs the runner's original bootstrap.
"""
from __future__ import annotations

import hashlib
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):     # Windows cp1252 console honesty
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ACCEPTANCE_DIR = Path(__file__).resolve().parents[1]
ROOT = ACCEPTANCE_DIR.parent                     # proofgraph/
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import outerwall                                              # noqa: E402

outerwall.ensure_assembly_paths()
import pipeline as hub_pipeline                                # noqa: E402,F401
import server as hub_server                                    # noqa: E402,F401

FIXTURE = ACCEPTANCE_DIR / "fixtures" / "moatpkg"
PYRIGHT_MODE = "live"
PACKAGE = "moatpkg"
DECLARED_ROOT_NAME = "moatpkg.core.main"

CHECKS: list[dict] = []


def check(name: str, passed: bool, detail: str) -> bool:
    CHECKS.append({"name": name, "pass": bool(passed), "detail": detail})
    print(f"[{'PASS' if passed else 'FAIL'}] {name}: {detail}", flush=True)
    return bool(passed)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


# ---------------------------------------------------------------------------
# HTTP — the browser's transport, verbatim (GET/PUT/POST json, typed bodies)
# ---------------------------------------------------------------------------

def http(port: int, method: str, path: str, body: dict | None = None,
         timeout: float = 900.0) -> tuple[int, dict]:
    url = f"http://127.0.0.1:{port}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            status = r.status
    except urllib.error.HTTPError as err:
        raw = err.read()
        status = err.code
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except ValueError:
        parsed = {"unparseable": raw[:200].decode("utf-8", "replace")}
    return status, parsed


def names_to_ids(analysis: dict) -> dict[str, str]:
    return {n["name"]: n["id"] for n in analysis["graph"]["nodes"]}
