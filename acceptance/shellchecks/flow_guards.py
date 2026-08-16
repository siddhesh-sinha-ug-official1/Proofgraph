"""the /fs jail (path-escape, probed) + the root-picker candidate feed.

Carved VERBATIM from acceptance/run_shell_demo.py (SUB200 restructure,
wave 2).
"""
from __future__ import annotations

from .common import check, http


def run_guard_flows(port: int, tmp, log) -> None:
    """path-escape-refused + roots-candidates-decls."""
    # ---- the jail: traversal PUT refused with the NAMED class ----------
    rejected_before = len(log.events("hub.fs.rejected"))
    s, e = http(port, "PUT", "/fs/file",
                {"path": "../escape.py", "content": "smuggled = True"})
    rejected = log.events("hub.fs.rejected")
    probe_ok = (len(rejected) == rejected_before + 1
                and rejected[-1]["payload"]["failureClass"] == "path-escape"
                and rejected[-1]["payload"]["op"] == "write")
    ok = (s == 403 and e.get("failureClass") == "path-escape"
          and probe_ok
          and not (tmp.parent / "escape.py").exists()
          and not (tmp / "escape.py").exists())
    check("path-escape-refused", ok,
          f"PUT /fs/file ../escape.py → HTTP {s} failureClass "
          f"{e.get('failureClass')!r}; probed hub.fs.rejected "
          f"(op=write); nothing written anywhere")

    # ---- root-picker feed == the served decl set -----------------------
    s1, cands = http(port, "GET", "/fs/roots-candidates")
    s2, graph = http(port, "GET", "/graph")
    cand_ids = {c["id"] for c in cands.get("candidates", [])}
    decl_ids = {n["id"] for n in graph.get("nodes", [])
                if n.get("kind") != "module"}
    module_ids = {n["id"] for n in graph.get("nodes", [])
                  if n.get("kind") == "module"}
    ok = (s1 == 200 and s2 == 200 and cand_ids == decl_ids
          and len(cand_ids) > 0 and not (cand_ids & module_ids))
    check("roots-candidates-decls", ok,
          f"GET /fs/roots-candidates == the served /graph's non-module "
          f"decl set ({len(cand_ids)} ids; {len(module_ids)} module "
          f"nodes excluded — V3's root-vocabulary lesson)")
