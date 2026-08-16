"""§7 (g) — the squiggle on a temp moat variant (V2's path, reused).

Carved VERBATIM from acceptance/run_demo.py (SUB200 restructure, wave 2).
"""
from __future__ import annotations

import subprocess

from .common import (FIXTURES, HEADLESS_DIR, bound, check, last_json_line,
                     run_node, sha256_file)


def check_g_squiggle() -> bool:
    print("== §7(g): live pyright squiggle via V2's path (cell 2 battery + "
          "hub WS bridge) — this runs a REAL measured battery ==", flush=True)
    fixture_files = ["core.py", "helpers.py", "__init__.py"]
    before = {f: sha256_file(FIXTURES / "moatpkg" / f) for f in fixture_files}
    try:
        rc, out, err = run_node(
            ["node", str(HEADLESS_DIR / "squiggle_check.mjs")],
            timeout_s=540)
    except subprocess.TimeoutExpired:
        return check("g-squiggle", False, "squiggle check timed out", None)
    after = {f: sha256_file(FIXTURES / "moatpkg" / f) for f in fixture_files}
    ev = last_json_line(out, "injectedExpr") or last_json_line(out) or {}
    fixture_ok = before == after
    ok = (rc == 0 and ev.get("ok") is True and fixture_ok
          and ev.get("gotByteStart") == ev.get("expectedByteStart")
          and ev.get("gotByteEnd") == ev.get("expectedByteEnd")
          and ev.get("severity") == "error"
          and "Operator" in str(ev.get("message"))
          and ev.get("initializeEnrichments") == 1)
    bound("measured-child-respawn (V2 bound 1: one pyright tree per bridge "
          "session, taskkill /T)")
    bound("declared initialize enrichment fired exactly once (V2 bound 2)")
    bound("temp-variant staging: the moat fixture was NEVER mutated "
          f"(sha256 before==after: {fixture_ok})")
    check("g-squiggle", ok,
          "type error injected into a TEMP COPY of moatpkg/core.py → pyright "
          f"(measured tier {ev.get('measuredTier')}) → hub WS bridge → editor "
          f"wall: diagnostic at bytes [{ev.get('gotByteStart')},"
          f"{ev.get('gotByteEnd')}) == the injected expression exactly; "
          f"message {str(ev.get('message'))[:60]!r}; uri+version guards "
          "applied; capability wall shut down (terminated:true); fixture "
          "byte-identical before/after",
          {"rc": rc, "evidence": {k: v for k, v in ev.items()
                                  if k not in ("allMarkers",)},
           "fixtureUntouched": fixture_ok,
           "stderrTail": err.splitlines()[-5:] if not ok else None})
    return ok
