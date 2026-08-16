"""§7 (b) — outline rings + validate.py green on the ON-DISK filled graph.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import json

from .common import ACCEPTANCE_DIR, ROOT, check, outerwall


def check_b_outline(moat):
    a = moat["analysis"]
    consts = outerwall.schema_constants()
    vocab = set(consts["OUTLINE_WORST_ORDER"])
    ring_ok = all(
        n["outline"] is not None
        and n["outline"]["status"] == "unknown"
        and n["outline"]["worstOf"] == ["none"]          # ruling 8: non-empty
        and set(n["outline"]["worstOf"]) <= vocab
        for n in a["graph"]["nodes"])
    face_pins_ok = all(a["verdicts"][n["id"]]["outline"] == n["outline"]
                       and a["verdicts"][n["id"]]["fill"] == n["fill"]
                       for n in a["graph"]["nodes"])
    closures = moat["outerLog"].events("outerwall.outline.closure")
    closure_ok = bool(closures) and closures[-1]["payload"]["agrees"] is True

    # validate.py green on the FILLED graph — the ON-DISK artifact, loaded
    # independently of the outer wall's own loader (nothing shared to fake).
    on_disk = json.loads((ACCEPTANCE_DIR / "analysis-moat.json")
                         .read_text(encoding="utf-8"))
    ns: dict = {"__name__": "acceptance_validate"}
    vpath = ROOT / "packages" / "schema" / "validate.py"
    exec(compile(vpath.read_text(encoding="utf-8"), str(vpath), "exec"), ns)
    schema_obj = json.loads((ROOT / "packages" / "schema" / "schema.json")
                            .read_text(encoding="utf-8"))
    conforms, errors = ns["validate_graph"](on_disk["graph"], schema_obj)

    ok = ring_ok and face_pins_ok and closure_ok and conforms
    check("b-outline-rings", ok,
          "every moat outline FILLED status=unknown (HONEST — no verdict "
          "compiler attached) with ruling-8 worstOf ['none'] (7-token vocab); "
          "face==pins (verdicts==node rows); two-library closure agreed "
          "(rustworkx×networkx); packages/schema/validate.py green on the "
          f"on-disk filled graph (conforms={conforms}, errors={errors[:3]})",
          {"ringOk": ring_ok, "facePins": face_pins_ok,
           "closureAgrees": closure_ok, "validateConforms": conforms,
           "validateErrors": errors})
    return ok
