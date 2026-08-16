"""§7 (i) — THE GREEN TRACE (green-flow round): one decl green BECAUSE the
kernel verified it, the SAME Node.id byte-identical at every hop.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import hashlib
import json

from .common import (ACCEPTANCE_DIR, check, http_get, hub_server, ids_by_name,
                     offsets_of, system_pins)


def check_i_green_trace(lean, ev: dict | None) -> bool:
    a = lean["analysis"]
    names = ids_by_name(a)
    green_id = names["unused_hyp.uses_base"]     # green AND src of the edge
    want = green_id.encode("utf-8")
    green_node = next(n for n in a["graph"]["nodes"] if n["id"] == green_id)

    # hop 0 — WHY it is green: the kernel driver invocation is probed, and
    # the fill.source's run=<sha16> resolves to that probe's runSha (the
    # checker evidence chain, never an assertion).
    src = green_node["fill"]["source"]
    kernel_backed = (green_node["fill"]["status"] == "green"
                     and green_node["origin"] == "checked"
                     and src.startswith("lean-kernel:")
                     and "kernelAccepted" in src and "run=" in src)
    run_sha16 = src.split("run=")[-1].strip()
    driver_probes = [e for e in lean["extractorWall"].pins.history()
                     if e.get("probeId") == "extractor.backend.leanDriver.resp"]
    sha_resolves = any(str(e["payload"].get("runSha", "")).startswith(run_sha16)
                       for e in driver_probes)

    # hop 0b — the model wall's greenGuard ADMITTED this green (pins)
    guard_events = [e for e in lean["modelWall"].pins.history()
                    if e.get("probeId") == "graph-model.wall.ingest.greenGuard"
                    and e["payload"].get("nodeId") == green_id]
    wall_admitted = bool(guard_events) and all(
        e["payload"].get("allowedGreen") is True for e in guard_events)

    # hops 1-3 — extraction preimage → model ingest → analysis bytes
    pins = system_pins(lean)
    tr = pins.trace(green_id)
    by_hop = {h["hop"]: h for h in tr["hops"]}

    # hops 4-5 — the LIVE hub serves the green (fresh hub over the lean
    # session; typed refusal exercised, then canonical bytes)
    hub = hub_server.HubServer(lean["pipeline"], log=lean["hubLog"]).start()
    try:
        hub.attach_analysis(lean["analysis"], note="run_demo §7(i)")
        status_g, graph_bytes = http_get(hub.http_port, "/graph")
        status_a, analysis_bytes = http_get(hub.http_port, "/analysis")
    finally:
        hub.stop()
    g_offs = offsets_of(graph_bytes, green_id)
    a_offs = offsets_of(analysis_bytes, green_id)
    g_ok = (status_g == 200 and bool(g_offs)
            and all(graph_bytes[o:o + len(want)] == want for o in g_offs))
    a_ok = (status_a == 200 and bool(a_offs)
            and all(analysis_bytes[o:o + len(want)] == want for o in a_offs))
    served_node = next(n for n in json.loads(graph_bytes.decode("utf-8"))["nodes"]
                       if n["id"] == green_id)
    served_green = (served_node["fill"]["status"] == "green"
                    and served_node["fill"]["source"] == src)

    # hops 6-7 — view paint + editor gutter (headless walls suite evidence)
    i_hops = (ev or {}).get("i_hops") or {}
    view_hop = i_hops.get("viewGreenPaint") or {}
    gutter_hop = i_hops.get("editorGutter") or {}
    view_ok = (view_hop.get("byteIdentical") is True
               and view_hop.get("id") == green_id
               and view_hop.get("idUtf8") == list(want)
               and view_hop.get("fillStatus") == "green"
               and view_hop.get("fillColor") == "#2E7D32")
    gutter_ok = (gutter_hop.get("byteIdentical") is True
                 and gutter_hop.get("id") == green_id
                 and gutter_hop.get("idUtf8") == list(want)
                 and gutter_hop.get("glyphClass") == "pg-fill-green"
                 and (gutter_hop.get("guard") or {}).get("greenAllowed") is True
                 and (gutter_hop.get("guard") or {}).get("tier") == "CT")

    ok = bool(kernel_backed and sha_resolves and wall_admitted
              and tr["byteIdenticalEverywhere"] is True
              and {"extraction", "model-ingest", "analysis-graph"} <= set(by_hop)
              and g_ok and a_ok and served_green and view_ok and gutter_ok)

    # append the green trace to TRACE-full.json (written by check f)
    tf = ACCEPTANCE_DIR / "TRACE-full.json"
    trace_doc = json.loads(tf.read_text(encoding="utf-8")) if tf.is_file() else {}
    trace_doc["greenTrace"] = {
        "nodeId": green_id,
        "name": "unused_hyp.uses_base",
        "idSha256": hashlib.sha256(want).hexdigest(),
        "idUtf8Bytes": list(want),
        "byteIdenticalEverywhere": ok,
        "why": ("GREEN because the Lean kernel verified it: fill.source "
                f"{src!r} — run={run_sha16} resolves to the probed "
                "extractor.backend.leanDriver.resp invocation; the model "
                "wall's ingest greenGuard admitted it (attested origin "
                "checked); the editor wall's greenGuard passed at the "
                "MEASURED CT tier"),
        "fixture": "acceptance/fixtures/unused_hyp.lean (CT, live kernel driver)",
        "hops": {
            "kernelEvidence": {"fillSource": src, "runSha16": run_sha16,
                               "driverProbeResolved": sha_resolves},
            "modelWallGreenGuard": {"admitted": wall_admitted,
                                    "events": len(guard_events)},
            "extraction": by_hop.get("extraction"),
            "modelIngest": by_hop.get("model-ingest"),
            "analysisGraph": by_hop.get("analysis-graph"),
            "hubServedGraph": {
                "endpoint": "/graph", "httpStatus": status_g,
                "id": green_id, "idByteOffsets": g_offs,
                "payloadSha256": hashlib.sha256(graph_bytes).hexdigest(),
                "servedFillStatus": served_node["fill"]["status"],
                "byteIdentical": g_ok,
            },
            "hubServedAnalysis": {
                "endpoint": "/analysis", "httpStatus": status_a,
                "id": green_id, "idByteOffsets": a_offs,
                "payloadSha256": hashlib.sha256(analysis_bytes).hexdigest(),
                "byteIdentical": a_ok,
            },
            "viewGreenPaint": view_hop or None,
            "editorGutter": gutter_hop or None,
        },
    }
    tf.write_text(json.dumps(trace_doc, indent=2), encoding="utf-8")

    check("i-green-trace", ok,
          f"{green_id} (unused_hyp.uses_base) GREEN because the kernel "
          f"verified it (source run={run_sha16} resolves to the probed "
          "driver invocation; model-wall greenGuard admitted) — the SAME id "
          "byte-identical at EVERY hop: extractor preimage pin → model "
          f"ingest → analyze() canonical bytes → hub GET /graph (offsets "
          f"{g_offs}) + /analysis ({len(a_offs)} offsets, fill green served) "
          "→ view dump().paints #2E7D32 → editor gutter pg-fill-green "
          "(greenGuard PASSED at measured CT) — greenTrace appended to "
          "TRACE-full.json",
          {"kernelBacked": kernel_backed, "shaResolves": sha_resolves,
           "wallAdmitted": wall_admitted, "hubGraph": g_ok, "hubAnalysis": a_ok,
           "viewOk": view_ok, "gutterOk": gutter_ok})
    return ok
