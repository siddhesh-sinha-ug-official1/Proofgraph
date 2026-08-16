"""§7 (c) + (h) — the typst honest ceiling: analysis-level + every layer.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import json

from .common import (HEADLESS_DIR, all_statuses, check, exercised, http_get,
                     hub_server, last_json_line, run_node)


def check_c_ceiling(ceiling):
    """UPDATED (green-flow round): the all-unknown honest-ceiling story moved
    from the lean input — which EARNED CT kernel greens (LEAN-DOCK) — to the
    typst ceiling input (a language cell 2 still refuses; recorded local-stub
    fallback).  The assertions are the SAME shape: unknown never upgrades."""
    a = ceiling["analysis"]
    gap = a["gapAnalysis"]
    statuses = set(all_statuses(a))
    leads = a["graph"]["leads"]
    leads_by_src: dict[str, list] = {}
    for l in leads:
        leads_by_src.setdefault(l["srcId"], []).append(l["id"])
    inc_ok = bool(gap["incompleteBases"]) and all(
        src in gap["incompleteBases"]
        and set(lids) <= set(gap["incompleteBases"][src])
        for src, lids in leads_by_src.items())
    cap = a["provenance"]["capability"].get("typst") or {}
    ok = (statuses == {"unknown"}
          and all_statuses(a).count("green") == 0
          and a["graph"]["edges"] == []
          and len(leads) > 0
          and all(l["resolved"] is False for l in leads)
          and inc_ok
          and gap["undeclared"] is True and gap["unused"] == []
          and gap["reachability"].get("wallRefusal") == "roots-undeclared"
          and cap.get("measuredBy") == "local-stub"
          and cap.get("tier") == "G")
    exercised("roots-undeclared")
    exercised("unknown-language (typst → cell-2 typed refusal, recorded "
              "local-stub fallback)")
    check("c-honest-ceiling", ok,
          f"typst ceiling: ZERO green anywhere (statuses=={sorted(statuses)}); "
          f"{len(a['graph']['nodes'])} nodes, 0 resolved edges, {len(leads)} "
          "leads (dashed class only, resolved=false); incompleteBases "
          f"populated for every lead source ({len(gap['incompleteBases'])} "
          "entries); roots-undeclared honored — nothing inferred; capability "
          "local-stub tier G, refusal pinned",
          {"statuses": sorted(statuses), "leads": len(leads),
           "incompleteBases": {k: len(v) for k, v in gap["incompleteBases"].items()},
           "capability": cap})
    return ok


def check_h_honesty(ceiling, ceiling_bytes: bytes, ev: dict | None) -> bool:
    """UPDATED (green-flow round): the every-layer unknown-honesty story now
    runs on the CEILING (typst) analysis — lean earned CT greens and its
    green flow is check (i)."""
    # layer 1: analyze() — owned by check c; restated structurally here.
    a = ceiling["analysis"]
    layer1 = set(all_statuses(a)) == {"unknown"}

    # layer 2: hub-served bytes — a fresh hub over the CEILING session.
    hub = hub_server.HubServer(ceiling["pipeline"], log=ceiling["hubLog"]).start()
    try:
        s0, body0 = http_get(hub.http_port, "/analysis")
        pre_refusal = (s0 == 503 and
                       json.loads(body0).get("failureClass")
                       == "no-analysis-computed")
        if pre_refusal:
            exercised("no-analysis-computed")
        hub.attach_analysis(ceiling["analysis"], note="run_demo §7(h)")
        s1, served_analysis = http_get(hub.http_port, "/analysis")
        s2, served_graph = http_get(hub.http_port, "/graph")
        byte_equal = served_analysis == ceiling_bytes
        g = json.loads(served_graph.decode("utf-8"))
        hub_unknown = all(
            n["fill"]["status"] == "unknown"
            and n["outline"]["status"] == "unknown"
            for n in g["nodes"])
        served_verdicts = json.loads(served_analysis.decode("utf-8"))["verdicts"]
        hub_no_green = "green" not in json.dumps(served_verdicts)
        layer2 = (pre_refusal and s1 == 200 and s2 == 200 and byte_equal
                  and hub_unknown and hub_no_green)

        # layer 4: the AI outlet over the CEILING hub — honest NO-CLAIM (the
        # wall's roots-undeclared refusal crosses every membrane untranslated
        # into a fabricated answer).
        rc, out, err = run_node(
            ["node", str(HEADLESS_DIR / "ai_check.mjs"),
             "--hub", f"http://127.0.0.1:{hub.http_port}",
             "--question", "what is unused?"],
            timeout_s=120)
        ai_ev = last_json_line(out, "answer") or {}
        answer = ai_ev.get("answer") or ""
        ceiling_node_ids = [n["id"] for n in a["graph"]["nodes"]]
        layer4 = (rc == 0
                  and "makes no reachability claim" in answer
                  and not any(nid in answer for nid in ceiling_node_ids))
    finally:
        hub.stop()

    # layer 3: the view — dump().paints from the headless walls suite (jsdom,
    # the V4 harness pattern): all unknown, hatched, zero green, dashed leads.
    h_view = (ev or {}).get("h_ceiling_view") or {}
    layer3 = (h_view.get("paintStatuses") == ["unknown"]
              and h_view.get("leadGuardCount") == len(a["graph"]["leads"])
              and h_view.get("resolvedEdges") == 0
              and (h_view.get("faceResult") or {}).get("leads")
              == len(a["graph"]["leads"]))

    ok = bool(layer1 and layer2 and layer3 and layer4)
    check("h-unknown-honesty", ok,
          "the CEILING (typst) analysis renders unknown through EVERY layer: "
          f"analyze() (all statuses unknown: {layer1}) → hub-served canonical "
          f"bytes (GET /analysis byte-equal, zero green, typed 503 before "
          f"attach: {layer2}) → view dump().paints (hatched grey fills, "
          f"unknown rings, every connection a DASHED LEAD: {layer3}) → AI "
          f"outlet honest no-claim over roots-undeclared ({layer4})",
          {"layer1_analyze": layer1, "layer2_hub": layer2,
           "layer3_view": layer3, "layer4_ai": layer4,
           "aiAnswer": (answer or "")[:240],
           "viewPaintStatuses": h_view.get("paintStatuses")})
    return ok
