"""headless vitest suite → §7 (d), the two browser-tier trace hops, (h)-view.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import json

from .common import APP_DIR, EVIDENCE_DIR, NPX, check, ids_by_name, run_node


def run_headless_suite() -> tuple[bool, dict | None, str]:
    print("== headless walls suite (vitest: V5 bus + both walls on the REAL "
          "analyses) ==", flush=True)
    rc, out, err = run_node(
        [NPX, "vitest", "run", "--config", "vitest.acceptance.config.ts"],
        timeout_s=600, cwd=APP_DIR)
    ev_path = EVIDENCE_DIR / "headless.json"
    ev = None
    if ev_path.is_file():
        ev = json.loads(ev_path.read_text(encoding="utf-8"))
    tail = "\n".join((out + "\n" + err).splitlines()[-25:])
    return rc == 0, ev, tail


def check_d_brushing(vitest_ok: bool, ev: dict | None, moat) -> bool:
    names = ids_by_name(moat["analysis"])
    if not vitest_ok or not ev or "d_brushing" not in ev:
        return check("d-brushing", False,
                     "headless vitest suite failed or wrote no d_brushing "
                     "evidence", {"vitestOk": vitest_ok})
    d = ev["d_brushing"]
    side, main = names["moatpkg.core.side_calc"], names["moatpkg.core.main"]
    e2g, g2e = d["editorToGraph"], d["graphToEditor"]
    ok = (e2g["byteEqual"] is True and g2e["byteEqual"] is True
          and e2g["editorEmitNodeId"] == side
          and e2g["gvSelectInNodeId"] == side
          and e2g["editorEmitNodeIdUtf8"] == list(side.encode("utf-8"))
          and g2e["gvSelectOutNodeId"] == main
          and g2e["editorBusLogEntry"]["nodeId"] == main
          and g2e["editorBusLogEntry"]["origin"] == "graph"
          and g2e["editorBusLogNodeIdUtf8"] == list(main.encode("utf-8"))
          and g2e["revealPayload"]["highlightApplied"] is True
          and d["counts"] == {"editorSideLog": 2, "graphSideEmitted": 1,
                              "dropped": 0})
    check("d-brushing", ok,
          "one select each direction over the V5 joined bus, BOTH real walls: "
          f"editor→graph {side} (editor.select.emit.bus × link.select.in) and "
          f"graph→editor {main} (link.select.out/link.bus.emit × T4 busLog × "
          "editor.select.recv.reveal highlightApplied) — nodeIds byte-equal "
          "(independent JSON parses + UTF-8 byte arrays re-verified in "
          "python); exact bounded counts, zero drops (no echo storm)",
          {"counts": d["counts"], "editorToGraph": e2g["byteEqual"],
           "graphToEditor": g2e["byteEqual"]})
    return ok
