"""§7 (f) — THE SYSTEM TRACE (extended with hub-served + view + editor hops).

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import hashlib
import json

from .common import (ACCEPTANCE_DIR, check, http_get, ids_by_name, offsets_of,
                     system_pins)


def check_f_trace(moat, hub_port: int, ev: dict | None) -> bool:
    a = moat["analysis"]
    names = ids_by_name(a)
    main_id = names["moatpkg.core.main"]
    want = main_id.encode("utf-8")

    pins = system_pins(moat)
    tr = pins.trace(main_id)
    by_hop = {h["hop"]: h for h in tr["hops"]}

    # hub-served hops: the LIVE hub's /graph and /analysis payload bytes.
    status_g, graph_bytes = http_get(hub_port, "/graph")
    status_a, analysis_bytes = http_get(hub_port, "/analysis")
    g_offs = offsets_of(graph_bytes, main_id)
    a_offs = offsets_of(analysis_bytes, main_id)
    g_ok = (status_g == 200 and bool(g_offs)
            and all(graph_bytes[o:o + len(want)] == want for o in g_offs))
    a_ok = (status_a == 200 and bool(a_offs)
            and all(analysis_bytes[o:o + len(want)] == want for o in a_offs))

    # browser-tier hops from the headless walls suite evidence.
    f_hops = (ev or {}).get("f_hops") or {}
    view_hop = f_hops.get("viewIngested") or {}
    editor_hop = f_hops.get("editorSelection") or {}
    view_ok = (view_hop.get("byteIdentical") is True
               and view_hop.get("id") == main_id
               and view_hop.get("idUtf8") == list(want))
    editor_ok = (editor_hop.get("byteIdentical") is True
                 and editor_hop.get("id") == main_id
                 and editor_hop.get("idUtf8") == list(want)
                 and editor_hop.get("highlightApplied") is True)

    trace_full = {
        "nodeId": main_id,
        "name": "moatpkg.core.main",
        "idSha256": hashlib.sha256(want).hexdigest(),
        "idUtf8Bytes": list(want),
        "byteIdenticalEverywhere": bool(
            tr["byteIdenticalEverywhere"] and g_ok and a_ok
            and view_ok and editor_ok),
        "provenance": (
            "§7(f) system trace: the V4 TRACE mechanism (vessels/"
            "TRACE-node.json seed, verified in outerwall/test_outerwall.py) "
            "read through outerwall system_pins().trace() and EXTENDED with "
            "the hub-served, view-ingested and editor-selection hops — one "
            "moatpkg Node.id byte-identical at EVERY hop, extraction → model "
            "→ analysis canonical bytes → hub GET /graph + /analysis → "
            "graph-view ingest.node pin → editor busLog/recv.reveal pins "
            "(driven headlessly over the V5 joined bus)"),
        "fixture": "acceptance/fixtures/moatpkg (live pyright, real V1 CT)",
        "v4Seed": "vessels/TRACE-node.json (n_ccb26550281c06b8, richpkg) — "
                  "a DIFFERENT node; its seed verification is owned by "
                  "outerwall/test_outerwall.py Test02Rich",
        "hops": {
            "extraction": by_hop.get("extraction"),
            "modelIngest": by_hop.get("model-ingest"),
            "analysisGraph": by_hop.get("analysis-graph"),
            "hubServedGraph": {
                "endpoint": "/graph", "httpStatus": status_g,
                "id": main_id, "idByteOffsets": g_offs,
                "payloadSha256": hashlib.sha256(graph_bytes).hexdigest(),
                "payloadBytes": len(graph_bytes), "byteIdentical": g_ok,
            },
            "hubServedAnalysis": {
                "endpoint": "/analysis", "httpStatus": status_a,
                "id": main_id, "idByteOffsets": a_offs,
                "payloadSha256": hashlib.sha256(analysis_bytes).hexdigest(),
                "payloadBytes": len(analysis_bytes), "byteIdentical": a_ok,
            },
            "viewIngested": view_hop or None,
            "editorSelection": editor_hop or None,
        },
    }
    (ACCEPTANCE_DIR / "TRACE-full.json").write_text(
        json.dumps(trace_full, indent=2), encoding="utf-8")

    ok = (tr["byteIdenticalEverywhere"] is True
          and {"extraction", "model-ingest", "analysis-graph"} <= set(by_hop)
          and by_hop["extraction"]["preimage"] is not None
          and by_hop["model-ingest"]["idInRootIds"] is True
          and g_ok and a_ok and view_ok and editor_ok)
    check("f-system-trace", ok,
          f"{main_id} (moatpkg.core.main) byte-identical at EVERY hop: "
          "extractor.t1.node.id preimage pin → graph-model ingest pin surface "
          "(idInRootIds) → analyze() canonical bytes → hub GET /graph "
          f"(offsets {g_offs}) + GET /analysis ({len(a_offs)} offsets) → "
          "graph-view ingest.node pin → editor busLog + recv.reveal "
          "(headless V5 bus) — TRACE-full.json written",
          {"traceHops": sorted(by_hop), "hubGraphOffsets": g_offs,
           "hubAnalysisOffsets": len(a_offs), "viewOk": view_ok,
           "editorOk": editor_ok})
    return ok
