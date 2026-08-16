"""step 3 expectations — page specs COMPUTED from the analyses.

Carved VERBATIM from acceptance/run_demo.py's ui_step (SUB200 restructure,
wave 2): the spec-building block moved here as build_specs(); every value is
computed from the SAME analyses the §7 checks asserted — never hardcoded.
"""
from __future__ import annotations

from .common import ids_by_name

GREEN_COLOR = "#2E7D32"   # the graph cell's canonical green (asserted via pins)


def _utf8(s: str) -> list[int]:
    return list(s.encode("utf-8"))


def _nodes_in_file(analysis: dict, rel_path: str) -> list[dict]:
    """The nodes the editor indexes for an open file — the SAME span-file
    suffix rule the shell uses (app/src/uris.ts spanFileMatches)."""
    out = []
    for n in analysis["graph"]["nodes"]:
        f = str((n.get("span") or {}).get("file", "")).replace("\\", "/")
        if f and (rel_path == f or rel_path.endswith("/" + f)):
            out.append(n)
    return out


def build_specs(moat, lean, ceiling) -> dict:
    """The three page specs + the derived id maps browser_step re-verifies."""
    m, l, c = moat["analysis"], lean["analysis"], ceiling["analysis"]
    mn, ln, cn = ids_by_name(m), ids_by_name(l), ids_by_name(c)
    lean_green_ids = [n["id"] for n in l["graph"]["nodes"]
                      if n["fill"]["status"] == "green"]
    lean_module_id = ln["unused_hyp"]
    ceil_ghosts = sorted({str(ld["dstId"]) for ld in c["graph"]["leads"]
                          if str(ld["dstId"]).startswith("unresolved:")})

    # Expectations are COMPUTED from the same analyses the §7 checks asserted
    # — never hardcoded.  Gutter glyph expectations encode the cells' OWN
    # honest treatments: origin "assumed" is DEBT → pg-fill-amber (cell 4's
    # origin map); an attested green at the browser's tier-G stub floor is
    # BLOCKED → downgraded to unknown (pg-fill-unknown) — the CT gutter green
    # is the HEADLESS §7(i) proof (REPORT-GREENFLOW bound 4).
    def glyph_for(n: dict) -> str:
        if n["origin"] == "assumed":
            return "pg-fill-amber"
        if n["fill"]["status"] == "green":
            return "pg-fill-unknown"        # blocked at tier G, downgraded
        if n["origin"] == "given":
            return "pg-fill-blue"
        return f"pg-fill-{n['fill']['status']}"

    def gutter_spec(analysis: dict, rel_path: str, green_blocked_ids=None):
        nodes = _nodes_in_file(analysis, rel_path)
        g = {
            "nodeIds": [n["id"] for n in nodes],
            "glyphById": {n["id"]: glyph_for(n) for n in nodes},
            "greenGlyphCount": 0,   # browser floor is tier G — never green here
        }
        if green_blocked_ids:
            g["greenBlocked"] = {
                "ids": green_blocked_ids,
                "guardReasonContains": "tier G is not compiler truth",
                "blockedReason": "green-may-never-be-faked",
            }
        return g

    moat_spec = {
        "page": "moat",
        "expect": {
            "servedNodes": len(m["graph"]["nodes"]), "ghosts": 0,
            "renderedEdges": len(m["graph"]["edges"]),
            "leadGuards": len(m["graph"]["leads"]),
            "analysisLine": f"applied ({len(m['graph']['nodes'])} verdicts)",
            "paintStatuses": ["unknown"],
            "greens": [], "greenColor": GREEN_COLOR,
            "initialOpen": {"relPath": "moatpkg/core.py", "source": "hub-fs"},
            "openViaExplorer": None,
            "gutter": gutter_spec(m, "moatpkg/core.py"),
            "brush": {
                "graphToEditor": {"nodeId": mn["moatpkg.core.main"]},
                # caret col 6 lands inside "side_calc" on its def line —
                # innermost span wins (the module span also contains it)
                "editorToGraph": {"nodeId": mn["moatpkg.core.side_calc"],
                                  "linePrefix": "def side_calc", "caretCol": 6},
            },
            "ai": {"mustContain": [mn["moatpkg.helpers.unused_fn"],
                                   "FAKE-transport"],
                   "toolHeadContains": "listUnused"},
        },
    }
    lean_spec = {
        "page": "lean",
        "expect": {
            "servedNodes": len(l["graph"]["nodes"]), "ghosts": 0,
            "renderedEdges": len(l["graph"]["edges"]),   # the RESOLVED proof_uses edge
            "leadGuards": len(l["graph"]["leads"]),
            "analysisLine": f"applied ({len(l['graph']['nodes'])} verdicts)",
            "paintStatuses": ["green", "unknown"],
            "greens": [{"id": nid,
                        "name": next(k for k, v in ln.items() if v == nid)}
                       for nid in lean_green_ids],
            "greenColor": GREEN_COLOR,
            "moduleUnknownId": lean_module_id,
            "initialOpen": None,   # the moat tab falls back to the bundled
                                   # fixture on this hub (declared); the REAL
                                   # open is the explorer flow below
            "openViaExplorer": {"relPath": "unused_hyp.lean"},
            "gutter": gutter_spec(l, "unused_hyp.lean",
                                  green_blocked_ids=lean_green_ids),
            "brush": {
                "graphToEditor": {"nodeId": ln["unused_hyp.uses_base"]},
                "editorToGraph": {"nodeId": ln["unused_hyp.base_fact"],
                                  "linePrefix": "theorem base_fact",
                                  "caretCol": 10},
            },
            "ai": {"mustContain": ["makes no reachability claim"],
                   "mustNotContainIds": sorted(ln.values())},
        },
    }
    ceiling_spec = {
        "page": "ceiling",
        "expect": {
            "servedNodes": len(c["graph"]["nodes"]),
            "ghosts": len(ceil_ghosts),
            "renderedEdges": len(c["graph"]["leads"]),   # leads render dashed
            "leadGuards": len(c["graph"]["leads"]),
            "analysisLine": f"applied ({len(c['graph']['nodes'])} verdicts)",
            "paintStatuses": ["unknown"],
            "greens": [], "greenColor": GREEN_COLOR,
            "ghostIds": ceil_ghosts,
            "initialOpen": None,
            "openViaExplorer": {"relPath": "honest_ceiling.typ"},
            "gutter": gutter_spec(c, "honest_ceiling.typ"),
            "brush": {
                "graphToEditor": {"nodeId": cn["honest_ceiling.bound"]},
                "editorToGraph": None,
            },
            "ai": {"mustContain": ["makes no reachability claim"],
                   "mustNotContainIds": sorted(cn.values())},
        },
    }
    return {"mn": mn, "ln": ln, "cn": cn,
            "lean_green_ids": lean_green_ids,
            "specs": (moat_spec, lean_spec, ceiling_spec)}
