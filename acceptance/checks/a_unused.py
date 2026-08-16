"""§7 (a) — exactly one unused decl; crosschecked reachability.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

from .common import check, ids_by_name


def check_a_unused(moat):
    a = moat["analysis"]
    names = ids_by_name(a)
    gap = a["gapAnalysis"]
    unused_id = names.get("moatpkg.helpers.unused_fn")
    node = next((n for n in a["graph"]["nodes"] if n["id"] == unused_id), {})
    reach = set(gap["reachability"]["reachable"])
    want_reach = {names[k] for k in ("moatpkg.core.main", "moatpkg.core.side_calc",
                                     "moatpkg.helpers.used_fn")}
    ok = (gap["undeclared"] is False
          and gap["unused"] == [unused_id]
          and gap["unreferenced"] == gap["unused"]
          and node.get("kind") == "function"
          and reach == want_reach
          and dict(gap["reachability"]["crosscheck"]).get("agrees") is True)
    check("a-unused", ok,
          f"unused == exactly [{unused_id}] (moatpkg.helpers.unused_fn, decl "
          f"node kind=function); reachable == {sorted(want_reach)} "
          f"(rustworkx+networkx crosscheck agrees)",
          {"unused": gap["unused"], "reachable": sorted(reach),
           "declaredRoots": moat["declaredRoots"]})
    return ok
