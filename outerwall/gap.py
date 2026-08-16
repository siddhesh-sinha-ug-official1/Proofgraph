"""gap.py — the composed-graph gap analysis (emergent layer).

BINDING RULE honored: unused / unreferenced / cycles / reachability come
STRICTLY from the graph-model WALL's query() — never re-implemented here.
The wall's own two-library crosscheck (rustworkx + networkx) and its
condensation-is-DAG gate stand behind every number in this module.

Honest bounds, all logged, never silent:

  * roots undeclared -> the wall's typed roots-undeclared refusal is taken
    AS the answer: unused/unreferenced are [] with an explicit "undeclared"
    marker; nothing is inferred.
  * `unreferenced` is the hub's DOCUMENTED alias of the wall's `unused`
    vocabulary (hub/server.py QUERY_KIND_ALIASES) — served under both names,
    same wall query, alias recorded in the payload.
  * decl-universe bound: the model wall's query universe is decl nodes only
    (module nodes excluded by the wall — its own documented behavior), so
    MODULE-level cycles cannot surface through query().  They are surfaced
    VERBATIM from cell 3's own t3 diagnosis (pins.dump()["t3"] — computed by
    the CELL with its own rustworkx+networkx agreement gate, so nothing is
    re-implemented) under cycles["extractorT3"] WHEN the extractor was
    configured with roots (config["extractor"]["roots"]).  With no
    extractor-side roots the extractor's S4.t3 stage is SKIPPED at the
    cell; [Wave-B D4] cycles["extractorT3"] carries {skipped:true,reason}
    from the cell's own extractor.t3.roots.selected pin (never a silent
    empty dict), and the bound is logged
    (outerwall.gap.declUniverse.bound).
  * blindSpots and soundnessNote are surfaced VERBATIM from the cells
    (model wall unused query; extractor t3 soundness pins; per-dock honest
    ceilings) — never summarized away.
"""
from __future__ import annotations

from . import OuterLog


def _wall_refusal_class(exc) -> str:
    return getattr(exc, "failure_class",
                   getattr(exc, "failureClass", type(exc).__name__))


def build(model_wall, extractor_wall, declared_roots: list[str],
          outline_result: dict, log: OuterLog) -> dict:
    """Assemble gapAnalysis per OUTERWALL-CONTRACT.md from the two walls."""
    gap: dict = {}

    # ---- unused / unreferenced / reachability (roots declared, never inferred)
    if declared_roots:
        unused_q = model_wall.query("unused")
        reach_q = model_wall.query("reachable")
        log.emit("outerwall.gap.query", {
            "kinds": ["unused", "reachable"], "roots": list(declared_roots),
            "unusedCount": len(unused_q["unused"]),
            "reachableCount": len(reach_q["reachable"])})
        gap["undeclared"] = False
        gap["unused"] = list(unused_q["unused"])
        # the hub's documented alias — same wall query, both names served
        gap["unreferenced"] = list(unused_q["unused"])
        gap["unreferencedAlias"] = ("unreferenced -> unused (hub "
                                    "QUERY_KIND_ALIASES, documented)")
        gap["reachability"] = {
            "roots": list(reach_q["roots"]),
            "reachable": list(reach_q["reachable"]),
            "perRoot": dict(reach_q["perRoot"]),
            "crosscheck": dict(reach_q["crosscheck"]),
        }
        model_blind = list(unused_q["blindSpots"])
        soundness = unused_q["soundnessNote"]
    else:
        # take the WALL's typed refusal as the honest answer (probed there),
        # then mark, never infer.
        refusal = None
        try:
            model_wall.query("unused", roots=[])
        except Exception as exc:  # noqa: BLE001 — typed wall refusal expected
            refusal = _wall_refusal_class(exc)
        log.emit("outerwall.gap.refusal", {
            "kind": "unused/reachable", "failureClass": refusal,
            "marker": "undeclared",
            "note": "roots are declared, never inferred — [] + marker"})
        gap["undeclared"] = True
        gap["unused"] = []
        gap["unreferenced"] = []
        gap["unreferencedAlias"] = ("unreferenced -> unused (hub "
                                    "QUERY_KIND_ALIASES, documented)")
        gap["reachability"] = {"roots": [], "reachable": [], "perRoot": {},
                               "undeclared": True,
                               "wallRefusal": refusal}
        model_blind = []
        soundness = None

    # ---- cycles: sccs + condensation via the wall; isDAG ASSERTED ----------
    sccs_q = model_wall.query("sccs")
    cond_q = model_wall.query("condensation")
    if cond_q["isDAG"] is not True:      # the wall itself refuses first; belt+braces
        raise AssertionError("condensation-not-dag surfaced through query()")
    log.emit("outerwall.gap.query", {
        "kinds": ["sccs", "condensation"], "sccCount": len(sccs_q["sccs"]),
        "isDAG": cond_q["isDAG"]})

    # [Wave-B D4] extractor T3 runs ONLY if the extractor was configured
    # with roots (cfg.roots on the extractor pipeline).  When analyze() is
    # called WITHOUT an extractor-side roots vocabulary threaded through
    # config["extractor"]["roots"], T3 is skipped at the cell and the
    # extractor_wall's t3 dump is None — cycles["extractorT3"] would then
    # silently be {}, contradicting the doc claim that module-level cycles
    # are covered here.  Detect the skip and surface it HONESTLY: mark
    # extractorT3 with skipped/reason, and reflect the same in the logged
    # decl-universe bound so consumers see the actual coverage gap rather
    # than an empty dict that looks like "no cycles found".
    t3_dump = extractor_wall.pins.dump().get("t3")
    t3_skipped_reason = None
    if not t3_dump:
        # Prefer the cell's own explanation over inference: the extractor
        # emits extractor.t3.roots.selected with a reason when it skips.
        for ev in extractor_wall.pins.history():
            if ev["probeId"] == "extractor.t3.roots.selected":
                if not ev["payload"].get("roots"):
                    t3_skipped_reason = (ev["payload"].get("reason")
                                         or "no roots configured — T3 skipped")
                    break
        extractor_t3 = {
            "skipped": True,
            "reason": (t3_skipped_reason
                       or "extractor cfg.roots empty (no extractor-side "
                          "roots threaded through config['extractor']"
                          "['roots']) — extractor's S4.t3 stage did not "
                          "run; module-level cycles NOT surfaced this run"),
            "coversModuleLevelCycles": False,
        }
    else:
        extractor_t3 = t3_dump
    decl_bound = ("the model wall's query universe is decl nodes only "
                  "(module nodes excluded by the wall) — module-level cycles "
                  "surface verbatim in cycles['extractorT3'] WHEN the "
                  "extractor is configured with roots (cfg.roots); with "
                  "no extractor-side roots the extractor's T3 stage is "
                  "SKIPPED and extractorT3 carries {skipped:true,reason} "
                  "instead of module cycles — no silent empty dict")
    log.emit("outerwall.gap.declUniverse.bound", {
        "bound": "decl-universe", "detail": decl_bound,
        "extractorT3Skipped": bool(extractor_t3.get("skipped")),
        "extractorT3SkipReason": t3_skipped_reason,
        "extractorT3Cycles": extractor_t3.get("cycles", [])})

    gap["cycles"] = {
        "sccs": list(sccs_q["sccs"]),
        "crosscheck": dict(sccs_q["crosscheck"]),
        "condensation": {"condensationEdges": list(cond_q["condensationEdges"]),
                         "isDAG": cond_q["isDAG"],
                         "sccs": list(cond_q["sccs"])},
        "isDAG": cond_q["isDAG"],
        "declUniverseBound": decl_bound,
        "extractorT3": extractor_t3,     # VERBATIM cell diagnosis (incl. modules)
    }

    # ---- incompleteBases (ruling 8's lead-capped nodes) ---------------------
    gap["incompleteBases"] = {k: list(v) for k, v
                              in outline_result["incompleteBases"].items()}

    # ---- blindSpots + soundnessNote: VERBATIM from the cells ----------------
    blind_entries = []
    if model_blind:
        blind_entries.append({"source": "graph-model.wall.query(unused)",
                              "blindSpots": model_blind})
    for ev in extractor_wall.pins.history():
        if ev["probeId"] == "extractor.t3.soundness.blindspots":
            blind_entries.append({
                "source": "structure-extractor::extractor.t3.soundness.blindspots",
                "payload": dict(ev["payload"])})
    for ceiling in (extractor_wall.pins.dump().get("honestCeilings") or []):
        spots = (ceiling or {}).get("blindSpots")
        if spots:
            blind_entries.append({
                "source": ("structure-extractor.honestCeilings"
                           f"[{ceiling.get('lang')}]"),
                "blindSpots": list(spots)})
    gap["blindSpots"] = blind_entries

    if soundness is not None:
        gap["soundnessNote"] = soundness            # model wall, verbatim
    else:
        # no reachability claim was made; the extractor's own caveat verbatim
        caveats = [e["payload"].get("caveat")
                   for e in extractor_wall.pins.history()
                   if e["probeId"] == "extractor.t3.soundness.blindspots"]
        gap["soundnessNote"] = (
            caveats[-1] if caveats else
            "no reachability claim made (roots undeclared) — completeness "
            "never claimed over blind spots")
    return gap
