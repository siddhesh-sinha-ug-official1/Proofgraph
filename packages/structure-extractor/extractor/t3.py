"""S4 — T3 GRAPH PROPERTIES: uniform, rustworkx primary + NetworkX cross-check.

The single most important honesty gate in T3 fires first: every resolved=false
edge is EXCLUDED before the graph is built (a lead is not an edge — a dead-code
claim built on unresolved leads would be a faked green).

"unused" here is UNREACHABLE-FROM-ROOTS (the deadcode sense).  The distinct
UNREFERENCED set (in-degree zero) is computed and probed separately — the two
are never conflated (§5.10).  Every unused claim ships with the soundness
blind-spots probe: reachability is only as complete as the resolved edge set.
"""
from __future__ import annotations

from pathlib import Path

import rustworkx as rx

from .probe import ProbeBus, ProbeEvent
from .schema import SchemaEdge, SchemaNode
# NetworkX cross-check + DOT/JSON export live in t3_checks.py (SUB200
# restructure); _canon_cycle and the count cap are shared from there.
from .t3_checks import CYCLE_COUNT_CAP, _canon_cycle, cross_check, export_t3

STAGE = "S4.t3"

# Free wins: these languages forbid import cycles at compile time.
IMPORT_CYCLE_NA = {
    "lean": "Lean/Lake forbid import cycles at build time — DAG by construction",
    "go": "Go rejects import cycles as compile errors — DAG by construction",
}


def compute_t3(bus: ProbeBus, nodes: list[SchemaNode], edges: list[SchemaEdge],
               roots: list[str], johnson_length_bound: int,
               langs_present: set[str], out_dir: Path | None = None,
               cause: ProbeEvent | None = None) -> dict:
    name_of = {n.id: n.name for n in nodes}

    # ---- D6: exclude every lead BEFORE building the graph -------------------
    leads = [e for e in edges if not e.resolved]
    resolved = [e for e in edges if e.resolved]
    bus.emit("extractor.t3.graph.exclude.unresolved", STAGE, "decision", {
        "excludedCount": len(leads),
        "reason": "resolved=false is a lead, not an edge"}, cause=cause)
    bus.emit("extractor.t3.graph.input", STAGE, "input", {
        "nodeCount": len(nodes), "resolvedEdgeCount": len(resolved)}, cause=cause)

    for lang in sorted(langs_present & IMPORT_CYCLE_NA.keys()):
        bus.emit("extractor.t3.import.cycle.na", STAGE, "branch",
                 {"lang": lang, "reason": IMPORT_CYCLE_NA[lang]}, cause=cause)

    ids = sorted(n.id for n in nodes)
    idx = {nid: i for i, nid in enumerate(ids)}
    pairs = sorted({(e.srcId, e.dstId) for e in resolved
                    if e.srcId in idx and e.dstId in idx})

    # ---- rustworkx (primary) ------------------------------------------------
    ev_rx = bus.emit("extractor.t3.rustworkx.build", STAGE, "call",
                     {"lib": "rustworkx", "nodes": len(ids), "edges": len(pairs)}, cause=cause)
    g = rx.PyDiGraph()
    g.add_nodes_from(ids)
    g.add_edges_from([(idx[a], idx[b], None) for a, b in pairs])

    sccs_rx = sorted(tuple(sorted(ids[i] for i in comp))
                     for comp in rx.strongly_connected_components(g))
    multi = sum(1 for c in sccs_rx if len(c) > 1)
    bus.emit("extractor.t3.scc.tarjan", STAGE, "value", {
        "sccs": [[name_of[i] for i in c] for c in sccs_rx if len(c) > 1],
        "multiNodeSccCount": multi}, cause=ev_rx)

    # Symmetric caps (review C13/C15): the length bound filters FIRST and only
    # in-bound cycles count toward the cap — identically on both libraries —
    # and length-bound drops are themselves counted, never silent.
    cycles_rx: set[tuple[str, ...]] = set()
    truncated = False
    length_dropped = 0
    for cyc in rx.simple_cycles(g):
        c = [ids[j] for j in cyc]
        if len(c) > johnson_length_bound:
            length_dropped += 1
            continue
        if len(cycles_rx) >= CYCLE_COUNT_CAP:
            truncated = True
            break
        cycles_rx.add(_canon_cycle(c))
    bus.emit("extractor.t3.cycle.johnson", STAGE, "value", {
        "cycles": sorted([name_of[i] for i in c] for c in sorted(cycles_rx)),
        "lengthBound": johnson_length_bound}, cause=ev_rx)
    bus.emit("extractor.t3.cycle.bound.cap", STAGE, "decision", {
        "lengthBound": johnson_length_bound, "countCap": CYCLE_COUNT_CAP,
        "truncated": truncated, "lengthDroppedCount": length_dropped}, cause=ev_rx)
    if truncated or length_dropped:
        bus.emit("extractor.cap.applied", STAGE, "decision", {
            "capName": "t3.johnson.bounds",
            "limit": {"lengthBound": johnson_length_bound, "countCap": CYCLE_COUNT_CAP},
            "actual": {"countCapHit": truncated, "lengthDropped": length_dropped},
            "dropped": "elementary cycles beyond the logged bounds"}, cause=ev_rx)

    # ---- roots + reachability ----------------------------------------------
    root_ids = []
    missing = []
    by_name = {}
    for n in nodes:
        by_name.setdefault(n.name, []).append(n.id)
    for r in roots:
        cands = by_name.get(r, [])
        if len(cands) == 1:
            root_ids.append(cands[0])
        else:
            missing.append(r)
    bus.emit("extractor.t3.roots.selected", STAGE, "decision", {
        "roots": sorted(roots),
        "reason": ("declared entry set from pipeline config (code: entry modules/"
                   "functions; documents: top-level document) — a wrong root set "
                   "silently inflates unused, so it is explicit"),
        "unmatched": sorted(missing)}, cause=cause)
    if missing:
        bus.emit("extractor.error.caught", STAGE, "error", {
            "stage": STAGE,
            "exception": f"T3 roots not uniquely matched to nodes: {missing}",
            "sourceSpan": None}, cause=cause)
        raise ValueError(f"T3 roots not uniquely matched: {missing}")

    reach_rx: set[str] = set()
    for rid in root_ids:
        reach_rx.add(rid)
        reach_rx |= {ids[j] for j in rx.descendants(g, idx[rid])}
    bus.emit("extractor.t3.reach.descendants", STAGE, "value", {
        "roots": sorted(name_of[i] for i in root_ids),
        "reachableSet": sorted(name_of[i] for i in reach_rx)}, cause=ev_rx)

    unused = sorted(set(ids) - reach_rx)
    unused_ev = bus.emit("extractor.t3.unused.complement", STAGE, "value",
                         {"unusedSet": sorted(name_of[i] for i in unused)}, cause=ev_rx)

    indeg: dict[str, int] = {i: 0 for i in ids}
    for a, b in pairs:
        indeg[b] += 1
    unreferenced = sorted(i for i, d in indeg.items() if d == 0)
    bus.emit("extractor.t3.unreferenced", STAGE, "value", {
        "unreferencedSet": sorted(name_of[i] for i in unreferenced),
        "note": "distinct from unusedSet (unreachable-from-roots); never conflated"},
        cause=ev_rx)

    cond = rx.condensation(g)
    cond_is_dag = rx.is_directed_acyclic_graph(cond)
    bus.emit("extractor.t3.condensation.dag", STAGE, "value",
             {"condensationIsDag": cond_is_dag}, cause=ev_rx)

    # ---- NetworkX cross-check (the agreement oracle) — t3_checks.py ---------
    agree, diff_payload, truncated_nx = cross_check(
        bus, ids, pairs, root_ids, sccs_rx, cycles_rx, reach_rx, truncated,
        johnson_length_bound, cause)
    # Logged next to every unused claim (§5.10 / §6.9): never presented as sound.
    bus.emit("extractor.t3.soundness.blindspots", STAGE, "state", {
        "caveat": "reachability-based 'unused' is only as complete as the edge set",
        "missingEdgeClasses": ["dynamic dispatch", "reflection",
                               "dependency injection", "dynamic imports"]}, cause=unused_ev)

    result = {
        "sccs": [list(c) for c in sccs_rx],
        "multiNodeSccs": [[name_of[i] for i in c] for c in sccs_rx if len(c) > 1],
        "cycles": sorted([name_of[i] for i in c] for c in sorted(cycles_rx)),
        "reachableSet": sorted(name_of[i] for i in reach_rx),
        "unusedSet": sorted(name_of[i] for i in unused),
        "unreferencedSet": sorted(name_of[i] for i in unreferenced),
        "condensationIsDag": cond_is_dag,
        "crossCheck": {"agree": agree, "diff": diff_payload},
        "capsApplied": [{"johnsonLengthBound": johnson_length_bound,
                         "cycleCountCap": CYCLE_COUNT_CAP, "truncated": truncated,
                         "truncatedNetworkx": truncated_nx,
                         "lengthDroppedCount": length_dropped}],
        "roots": sorted(name_of[i] for i in root_ids),
    }

    # ---- export (t3_checks.py) ----------------------------------------------
    export_t3(bus, out_dir, ids, pairs, name_of, result, cause)
    return result
