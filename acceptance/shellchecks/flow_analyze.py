"""edit + save → re-analyze → unused SHRINKS → revert → determinism.

Carved VERBATIM from acceptance/run_shell_demo.py (SUB200 restructure,
wave 2).
"""
from __future__ import annotations

from .common import (DECLARED_ROOT_NAME, PACKAGE, PYRIGHT_MODE, check, http,
                     names_to_ids, sha256_bytes)


def run_analyze_flows(port: int, tmp, ws: dict, core_disk: bytes,
                      original_text: str) -> None:
    """unused-initial + fs-write-edit + analyze-after-edit + unused-shrunk +
    revert-restores (the UI's exact /analyze body throughout)."""
    # ---- initial /analysis: unused == {side_calc, unused_fn} -----------
    s, a0 = http(port, "GET", "/analysis")
    ids0 = names_to_ids(a0) if s == 200 else {}
    side0 = ids0.get("moatpkg.core.side_calc")
    unused_fn0 = ids0.get("moatpkg.helpers.unused_fn")
    gap0 = a0.get("gapAnalysis", {}) if s == 200 else {}
    unused_before = set(gap0.get("unused", []))
    ok = (s == 200 and gap0.get("undeclared") is False
          and unused_before == {side0, unused_fn0}
          and None not in unused_before)
    check("unused-initial", ok,
          f"GET /analysis: unused == exactly {{side_calc {side0}, "
          f"unused_fn {unused_fn0}}} under declared root "
          f"{DECLARED_ROOT_NAME} (undeclared=false, pyright live)")

    # ---- edit + save: main now CALLS unused_fn (PUT /fs/file) ----------
    edited_text = original_text.replace(
        "return helpers.used_fn(3)",
        "return helpers.used_fn(3) + helpers.unused_fn(3)", 1)
    assert edited_text != original_text, "edit template drifted"
    s, w = http(port, "PUT", "/fs/file",
                {"path": "moatpkg/core.py", "content": edited_text})
    want_sha = sha256_bytes(edited_text.encode("utf-8"))
    ok = (s == 200 and w.get("sha256") == want_sha
          and (tmp / "moatpkg" / "core.py").read_bytes()
          == edited_text.encode("utf-8"))
    check("fs-write-edit", ok,
          f"PUT /fs/file moatpkg/core.py (main += helpers.unused_fn(3)): "
          f"sha256 {want_sha[:16]}… == returned == TEMP-copy disk bytes")

    # ---- re-analyze: THE UI BODY (App.tsx runAnalyze, hub vocabulary) --
    ui_body = {"root": ws["root"], "roots": ws["declaredRoots"],
               "extractorConfig": {"pyright_mode": PYRIGHT_MODE,
                                   "python_package": PACKAGE}}
    s, r = http(port, "POST", "/analyze", ui_body)
    ok = s == 200 and r.get("ok") is True
    check("analyze-after-edit", ok,
          f"POST /analyze (the UI's exact body — root = workspace root, "
          f"roots = CURRENT declaredRoots, extractorConfig snake_case): "
          f"ok={r.get('ok')}, {r.get('nodes')} nodes")

    # ---- unused SHRUNK: unused_fn reachable, side_calc still unused ----
    s, a1 = http(port, "GET", "/analysis")
    ids1 = names_to_ids(a1) if s == 200 else {}
    side1 = ids1.get("moatpkg.core.side_calc")
    unused_fn1 = ids1.get("moatpkg.helpers.unused_fn")
    gap1 = a1.get("gapAnalysis", {}) if s == 200 else {}
    unused_after = set(gap1.get("unused", []))
    reach1 = set(gap1.get("reachability", {}).get("reachable", []))
    ok = (s == 200
          and unused_after == {side1} and side1 is not None
          and unused_fn1 in reach1
          and len(unused_after) < len(unused_before))
    check("unused-shrunk", ok,
          f"GET /analysis after the edit: unused SHRUNK "
          f"{len(unused_before)}→{len(unused_after)} — unused_fn "
          f"{unused_fn1} now REACHABLE, side_calc {side1} still unused")

    # ---- revert + save + re-analyze: the original unused set returns ---
    s, w = http(port, "PUT", "/fs/file",
                {"path": "moatpkg/core.py", "content": original_text})
    revert_ok = (s == 200
                 and w.get("sha256") == sha256_bytes(core_disk))
    s, r = http(port, "POST", "/analyze", ui_body)
    revert_ok = revert_ok and s == 200 and r.get("ok") is True
    s, a2 = http(port, "GET", "/analysis")
    gap2 = a2.get("gapAnalysis", {}) if s == 200 else {}
    unused_reverted = set(gap2.get("unused", []))
    ok = (revert_ok and s == 200 and unused_reverted == unused_before)
    check("revert-restores", ok,
          f"revert (PUT original bytes) + POST /analyze: unused id set "
          f"IS the original again ({sorted(unused_reverted)}) — "
          f"byte-same ids across re-runs, determinism holds")
