"""open folder / explorer / open core.py — the GET-side contract flows.

Carved VERBATIM from acceptance/run_shell_demo.py (SUB200 restructure,
wave 2).  Returns the facts the edit/analyze flow builds on.
"""
from __future__ import annotations

import os

from .common import PACKAGE, PYRIGHT_MODE, check, http, sha256_bytes


def run_fs_flows(port: int, tmp, session) -> tuple[dict, bytes, str]:
    """workspace-facts + fs-list-tree + fs-read-core.

    Returns (ws, core_disk, original_text) for the edit/analyze flow."""
    # ---- open folder: /workspace facts == the declaration -------------
    s, ws = http(port, "GET", "/workspace")
    ok = (s == 200
          and os.path.normcase(ws.get("root", "")) == os.path.normcase(str(tmp))
          and ws.get("package") == PACKAGE
          and ws.get("pyrightMode") == PYRIGHT_MODE
          and ws.get("declaredRoots") == session["declaredRoots"]
          and len(session["declaredRoots"]) == 1
          and isinstance(ws.get("analyzedAt"), int))
    check("workspace-facts", ok,
          f"GET /workspace == the declaration: root {ws.get('root')!r}, "
          f"package {ws.get('package')!r}, pyrightMode "
          f"{ws.get('pyrightMode')!r}, declaredRoots "
          f"{ws.get('declaredRoots')} (analyzedAt int, hub time_ns)")

    # ---- explorer: /fs/list tree contains core.py ----------------------
    s1, top = http(port, "GET", "/fs/list?path=")
    s2, pkg = http(port, "GET", "/fs/list?path=moatpkg")
    top_names = {e["name"]: e for e in top.get("entries", [])}
    pkg_names = {e["name"]: e for e in pkg.get("entries", [])}
    core_disk = (tmp / "moatpkg" / "core.py").read_bytes()
    ok = (s1 == 200 and s2 == 200
          and top_names.get("moatpkg", {}).get("kind") == "dir"
          and pkg_names.get("core.py", {}).get("kind") == "file"
          and pkg_names.get("core.py", {}).get("size") == len(core_disk))
    check("fs-list-tree", ok,
          f"/fs/list walk: root lists moatpkg/ (dir), moatpkg lists "
          f"core.py (file, {len(core_disk)} bytes == disk) — entries "
          f"{sorted(pkg_names)}")

    # ---- open core.py: /fs/file read == disk bytes ---------------------
    s, f = http(port, "GET", "/fs/file?path=moatpkg/core.py")
    original_text = core_disk.decode("utf-8")
    ok = (s == 200 and f.get("content") == original_text
          and f.get("sha256") == sha256_bytes(core_disk))
    check("fs-read-core", ok,
          f"GET /fs/file moatpkg/core.py: content ({len(core_disk)} "
          f"bytes) + sha256 {f.get('sha256', '')[:16]}… == disk")
    return ws, core_disk, original_text
