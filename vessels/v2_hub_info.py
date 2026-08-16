"""vessels/v2_hub_info.py — evidence extractors for v2_hub_runner.py.

SUB200 restructure: split out of vessels/v2_hub_runner.py (which stays the
spawned-process entry point).  Behavior unchanged: uri/version/config
evidence from the hub's BridgeSession raw-frame ledger and from the
capability CELL's own probe stream (capability.probe.msg, stage=bridge).
"""
from __future__ import annotations

import json


def _session_info(session) -> dict:
    """uri/version/config evidence from one BridgeSession's raw-frame ledger
    (raw retained up to the hub's logged 64 KiB bound; sha256 always)."""
    def parse(recs):
        msgs = []
        for r in recs:
            if r.get("raw") is None:
                msgs.append(None)
                continue
            try:
                msgs.append(json.loads(r["raw"]))
            except ValueError:
                msgs.append(None)
        return msgs

    c2s, s2c = parse(session.c2s), parse(session.s2c)
    method_counts: dict[str, int] = {}
    for m in c2s:
        if isinstance(m, dict) and m.get("method"):
            method_counts[m["method"]] = method_counts.get(m["method"], 0) + 1
    info = {"sessionId": session.session_id, "closed": session.closed,
            "c2sFrames": len(c2s), "s2cFrames": len(s2c),
            "c2sMethodCounts": method_counts,
            "didOpen": None, "publishes": [],
            "configRequests": [], "configResponses": []}
    cfg_ids = set()
    for m in s2c:
        if not isinstance(m, dict):
            continue
        if m.get("method") == "textDocument/publishDiagnostics":
            prm = m.get("params") or {}
            info["publishes"].append({
                "uri": prm.get("uri"), "version": prm.get("version"),
                "count": len(prm.get("diagnostics") or [])})
        elif m.get("method") == "workspace/configuration" and "id" in m:
            cfg_ids.add(m["id"])
            items = (m.get("params") or {}).get("items", [])
            info["configRequests"].append(
                {"id": m["id"],
                 "sections": [i.get("section") for i in items]})
    for m in c2s:
        if not isinstance(m, dict):
            continue
        if m.get("method") == "textDocument/didOpen":
            td = (m.get("params") or {}).get("textDocument") or {}
            info["didOpen"] = {"uri": td.get("uri"),
                               "version": td.get("version"),
                               "languageId": td.get("languageId")}
        elif "id" in m and "method" not in m and m["id"] in cfg_ids:
            info["configResponses"].append(
                {"id": m["id"], "result": m.get("result")})
    return info


def _bridge_pins(wall) -> dict:
    """The same evidence from the CAPABILITY CELL's own pins: every bridged
    frame was also emitted as capability.probe.msg (stage=bridge)."""
    events = [e for e in wall.pins.history()
              if e.get("probeId") == "capability.probe.msg"
              and e.get("stage") == "bridge"]
    res = {"bridgeMsgCount": len(events), "didOpen": None,
           "publishes": [], "configRequests": 0}
    for e in events:
        payload = e.get("payload") or {}
        m = payload.get("message")
        d = payload.get("direction")
        if not isinstance(m, dict):
            continue
        method = m.get("method")
        if d == "send" and method == "textDocument/didOpen":
            td = (m.get("params") or {}).get("textDocument") or {}
            res["didOpen"] = {"uri": td.get("uri"),
                              "version": td.get("version")}
        elif d == "recv" and method == "textDocument/publishDiagnostics":
            prm = m.get("params") or {}
            res["publishes"].append({
                "uri": prm.get("uri"), "version": prm.get("version"),
                "count": len(prm.get("diagnostics") or [])})
        elif d == "recv" and method == "workspace/configuration":
            res["configRequests"] += 1
    return res
