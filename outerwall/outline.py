"""outline.py — RULING 8, implemented precisely (the master transcript's
ruling 8 is authoritative; OUTERWALL-CONTRACT.md carries the same spec):

  * trust base of n = REFLEXIVE-transitive closure along resolved dependency
    edges (self included — kills the vacuous-green-ring-on-unknown-leaf
    problem).  Closure computed with rustworkx over the model wall's INGESTED
    graph (pin surface), crosschecked node-by-node against networkx — the
    project's two-library idiom, applied to the closure itself.  Disagreement
    is the named, build-failing class outline-closure-disagreement.
  * each base member contributes worstOf tokens from the FROZEN 7-token
    vocabulary (packages/schema/gen OUTLINE_WORST_ORDER):
        fill red/amber/blue  -> that token
        fill green           -> kind-derived: 'lemma' (theorem kind) or
                                'definition' (every other decl kind)
        (empty contribution set -> the single token 'none')
  * fill 'unknown' is NOT a worstOf token: it acts on STATUS only —
        status = worse-of(WORST_TOKEN_TO_STATUS[worst token],
                          'unknown' if any base fill is unknown)
    using the FILL severity order red < amber < blue < unknown < green
    (ruling 8 verbatim; lower = worse).
  * any unresolved lead OUT of the base caps status at unknown and lands in
    incompleteBases[nodeId] (an incomplete base never displays better than
    unknown; completeness is never claimed over blind spots).

A non-vocabulary string in any worstOf is the named, BUILD-FAILING class
outline-vocabulary-leak — analyze() raises, it never serves the outline.
"""
from __future__ import annotations

import networkx as nx
import rustworkx as rx

from . import OuterLog, OutlineVocabularyLeak, schema_constants
from .outline_closure import _closure_bases, _scc_fingerprint  # noqa: F401
                                                                # re-exported

#: Ruling 8's FILL severity order (T4's), lower index = worse.  This is the
#: 'worse-of' scale for STATUS composition — distinct from the 7-token
#: OUTLINE_WORST_ORDER, which ranks worstOf tokens.
FILL_SEVERITY_ORDER = ("red", "amber", "blue", "unknown", "green")


def worse_fill(a: str, b: str) -> str:
    """worse-of two statuses on the FILL severity scale (ruling 8)."""
    for s in (a, b):
        if s not in FILL_SEVERITY_ORDER:
            raise OutlineVocabularyLeak(
                f"status {s!r} is outside the frozen fill enum "
                f"{FILL_SEVERITY_ORDER} — refusing to rank it")
    return min(a, b, key=FILL_SEVERITY_ORDER.index)


def assert_vocabulary(worst_of) -> None:
    """BUILD-FAILING vocabulary gate: every worstOf entry must be one of the
    frozen 7 tokens.  (rank_worst_token would rank an unrecognized token
    WORST and report it — but the outer wall does not even let it exist.)"""
    consts = schema_constants()
    vocab = tuple(consts["OUTLINE_WORST_ORDER"])
    leaked = [t for t in worst_of if t not in vocab]
    if leaked:
        raise OutlineVocabularyLeak(
            f"non-vocabulary worstOf token(s) {leaked!r} — the frozen "
            f"7-token vocabulary is {list(vocab)}; a leak is build-failing")


def fill_outlines(state: dict, log: OuterLog) -> dict:
    """Compute ruling-8 outlines over the model wall's ingested pin surface
    (`pins.dump()['wall']['ingested']`: nodes/edges/leads/roots).

    Returns {"outlines": {nodeId: {status, worstOf}},
             "incompleteBases": {nodeId: [leadIds]},
             "closure": {...provenance of the closure computation...}}.
    """
    consts = schema_constants()
    vocab_order = tuple(consts["OUTLINE_WORST_ORDER"])
    worst_of_verdict = consts["worst_of_verdict"]
    fill_statuses = tuple(consts["FILL_STATUSES"])

    nodes, edges, leads = state["nodes"], state["edges"], state["leads"]
    bases = _closure_bases(nodes, edges, log)

    kind_by = {n["id"]: n["kind"] for n in nodes}
    fill_by = {n["id"]: n["fill"]["status"] for n in nodes}

    leads_by_src: dict[str, list] = {}
    for l in leads:
        leads_by_src.setdefault(l["srcId"], []).append(l["id"])

    outlines: dict[str, dict] = {}
    incomplete: dict[str, list] = {}
    status_tally: dict[str, int] = {}

    for nid, base in bases.items():
        tokens: set[str] = set()
        unknown_in_base = False
        for m in sorted(base):
            fs = fill_by[m]
            if fs not in fill_statuses:
                raise OutlineVocabularyLeak(
                    f"node {m} carries fill status {fs!r} outside the frozen "
                    f"enum {list(fill_statuses)} — no token can be derived")
            if fs in ("red", "amber", "blue"):
                tokens.add(fs)
            elif fs == "green":
                tokens.add("lemma" if kind_by[m] == "theorem" else "definition")
            else:                       # unknown: STATUS-only (ruling 8)
                unknown_in_base = True

        # deterministic worst-first ordering; empty contribution set -> 'none'
        worst_of = [t for t in vocab_order if t in tokens] or ["none"]
        assert_vocabulary(worst_of)
        verdict = worst_of_verdict(worst_of)
        if verdict["unrecognized"]:
            log.emit("outerwall.outline.vocabulary.violation",
                     {"nodeId": nid, "unrecognized": verdict["unrecognized"]})
            raise OutlineVocabularyLeak(
                f"node {nid}: unrecognized worstOf token(s) "
                f"{verdict['unrecognized']!r} ranked worst by policy — "
                f"build-failing, never served")
        status = verdict["status"]
        if unknown_in_base:
            status = worse_fill(status, "unknown")

        lead_ids = sorted(lid for src in base
                          for lid in leads_by_src.get(src, ()))
        if lead_ids:                     # lead out of the base: cap at unknown
            status = worse_fill(status, "unknown")
            incomplete[nid] = lead_ids

        outlines[nid] = {"status": status, "worstOf": worst_of}
        status_tally[status] = status_tally.get(status, 0) + 1

    closure_info = {
        "libraryPrimary": f"rustworkx {rx.__version__}",
        "crosscheck": f"networkx {nx.__version__}",
        "kind": "reflexive-transitive closure over resolved edges (ruling 8)",
        "nodes": len(nodes), "resolvedEdges": len(edges),
        "leadCappedNodes": sorted(incomplete),
    }
    log.emit("outerwall.outline.filled", {
        "nodes": len(outlines), "statusTally": status_tally,
        "incompleteBases": len(incomplete)})
    return {"outlines": outlines, "incompleteBases": incomplete,
            "closure": closure_info}
