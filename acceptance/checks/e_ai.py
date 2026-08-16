"""§7 (e) — the AI outlet against the LIVE hub.

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import json

from .common import (HEADLESS_DIR, bound, check, ids_by_name, last_json_line,
                     run_node)


def check_e_ai(hub_port: int, moat) -> bool:
    names = ids_by_name(moat["analysis"])
    unused_id = names["moatpkg.helpers.unused_fn"]
    rc, out, err = run_node(
        ["node", str(HEADLESS_DIR / "ai_check.mjs"),
         "--hub", f"http://127.0.0.1:{hub_port}",
         "--question", "what is unused?"],
        timeout_s=120)
    ev = last_json_line(out, "answer") or last_json_line(out) or {}
    tool_outputs = json.dumps(ev.get("toolCalls") or [])
    ok = (rc == 0 and ev.get("ok") is True
          and ev.get("transport") == "fake"
          and unused_id in (ev.get("answer") or "")
          and "FAKE-transport" in (ev.get("answer") or "")
          and any(tc.get("name") == "listUnused"
                  for tc in (ev.get("toolCalls") or []))
          and unused_id in tool_outputs
          and (ev.get("graphFacts") or {}).get("nodes") == 6)
    bound("FAKE transport labels itself in the answer; tool execution + node "
          "ids are REAL hub graph data (no keys, no network)")
    check("e-ai", ok,
          f"POST /ask 'what is unused?' through the V6 outlet (FAKE transport "
          f"goldens) → the answer names the REAL unused Node.id {unused_id} "
          "(moatpkg.helpers.unused_fn); listUnused executed against the LIVE "
          "hub-served graph (outlet.tool.exec pins served as toolCalls)",
          {"rc": rc, "answer": (ev.get("answer") or "")[:400],
           "toolCalls": [tc.get("name") for tc in (ev.get("toolCalls") or [])],
           "graphFacts": ev.get("graphFacts"),
           "stderrTail": err.splitlines()[-3:] if not ok else None})
    return ok
