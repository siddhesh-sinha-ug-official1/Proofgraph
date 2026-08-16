"""§7 (j) — the companion guard: a DOCTORED green fails at every wall.

Carved from acceptance/run_demo.py (SUB200 restructure, wave 2).  ONE
adaptation vs. the pre-split runner, documented at the site: cell 3's
schema module is imported THROUGH the package system instead of being
file-loaded standalone — the wave-1 SUB200 facade layer made
extractor/schema.py a facade with relative imports, which a bare
spec_from_file_location load cannot resolve (no parent package).  The
assertion is unchanged: SchemaNode.validate raises the NAMED class
unbacked-green on a green without checker evidence.
"""
from __future__ import annotations

import sys

from .common import ROOT, check, exercised


def check_j_unbacked_green(lean, ev: dict | None) -> bool:
    import copy
    a = lean["analysis"]

    # (1) cell 3's schema level: the NAMED class unbacked-green.  The cell's
    # schema module is imported through its own package (wave-1 facade layer:
    # extractor/schema.py re-exports from submodules via relative imports, so
    # the old standalone file-load no longer resolves; the imported surface —
    # SchemaNode + Span + validate() — is identical).
    sx_pkg_dir = str(ROOT / "packages" / "structure-extractor")
    if sx_pkg_dir not in sys.path:
        sys.path.insert(0, sx_pkg_dir)
    import extractor.schema as sx_schema
    node = next(n for n in a["graph"]["nodes"] if n["kind"] == "module")
    doctored_schema_node = sx_schema.SchemaNode(
        id=node["id"], lang=node["lang"], kind=node["kind"], name=node["name"],
        signature=node.get("signature"),
        span=sx_schema.Span(**node["span"]),
        fill={"status": "green", "source": ""},        # no checker evidence
        origin=node["origin"], provenance=node.get("provenance") or {})
    try:
        doctored_schema_node.validate()
        cell3_ok, cell3_msg = False, "validate() let the doctored green pass"
    except Exception as exc:  # noqa: BLE001 — the typed refusal is the point
        cell3_ok = "unbacked-green" in str(exc)
        cell3_msg = str(exc)[:160]
    if cell3_ok:
        exercised("unbacked-green (cell 3 SchemaNode.validate)")

    # (2) the model wall's ingest gate: fake-green, pinned — the SAME wall
    # that admitted the real attested greens
    wall = lean["modelWall"]
    doctored_nodes = copy.deepcopy(a["graph"]["nodes"])
    victim = next(n for n in doctored_nodes if n["kind"] == "module")
    victim["fill"] = {"status": "green", "source": ""}
    try:
        wall.ingest(doctored_nodes, a["graph"]["edges"], a["graph"]["leads"])
        wall_ok, wall_msg = False, "wall ingest ACCEPTED the doctored green"
    except Exception as exc:  # noqa: BLE001
        wall_ok = getattr(exc, "failure_class", None) == "fake-green"
        wall_msg = str(exc)[:160]
    rejected_pins = [e for e in wall.pins.history()
                     if e.get("probeId") == "graph-model.wall.ingest.rejected"
                     and e["payload"].get("failureClass") == "fake-green"]
    wall_pinned = bool(rejected_pins)
    if wall_ok:
        exercised("fake-green (graph-model wall ingest)")
    # the wall's committed state SURVIVED the refusal (still serves verdicts)
    state_survived = wall.verdictOf(victim["id"])["fill"]["status"] == "unknown"

    # (3) the editor wall (headless evidence): green.blocked, no green glyph
    j_ev = (ev or {}).get("j_editor_blocked") or {}
    editor_ok = ((j_ev.get("guard") or {}).get("greenAllowed") is False
                 and (j_ev.get("blocked") or {}).get("reason")
                 == "green-may-never-be-faked"
                 and j_ev.get("greenGlyphCount") == 0)
    if editor_ok:
        exercised("green-may-never-be-faked (editor wall verdict guard)")

    ok = bool(cell3_ok and wall_ok and wall_pinned and state_survived
              and editor_ok)
    check("j-unbacked-green", ok,
          "a DOCTORED green (module node, checker evidence stripped) fails "
          "at EVERY wall: cell 3 SchemaNode.validate raises the NAMED class "
          f"unbacked-green ({cell3_msg[:60]!r}); the graph-model wall "
          "rejects ingest with failure class fake-green (pinned on "
          "graph-model.wall.ingest.rejected; committed state survived); the "
          "editor wall blocks it (editor.verdict.green.blocked, "
          "green-may-never-be-faked, zero green glyphs) — never a silent "
          "pass anywhere",
          {"cell3": {"ok": cell3_ok, "msg": cell3_msg},
           "modelWall": {"ok": wall_ok, "pinned": wall_pinned,
                         "stateSurvived": state_survived, "msg": wall_msg},
           "editor": j_ev})
    return ok
