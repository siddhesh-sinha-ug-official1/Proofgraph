"""outline_closure.py — the closure primitive for ruling 8.

SUB200 split of outline.py: Wave D E2 (pre-GitHub) grew _closure_bases past
the ≤200 ceiling.  The public entry point is `_closure_bases`, re-exported
by outline.py (its facade is unchanged; every external importer of
outline.fill_outlines is unaffected).

Behavior contract:
  * REFLEXIVE-transitive descendants along resolved edges, computed as ONE
    bottom-up pass over the SCC condensation (E2: replaces the per-node
    double BFS, O(V·(V+E))×2, with O(V+E+total-closure)).
  * TWO-LIBRARY crosscheck via an AGGREGATE fingerprint (one hash per
    library, not per-node): the SCC decompositions of rustworkx and
    networkx must fingerprint-match; disagreement is the named,
    build-failing class outline-closure-disagreement.  The pin
    `outerwall.outline.closure` (agrees: True|False) is preserved and still
    a real two-library check.
"""
from __future__ import annotations

import networkx as nx
import rustworkx as rx

from . import OuterLog, OutlineClosureDisagreement


def _scc_fingerprint(components) -> tuple:
    """Deterministic aggregate fingerprint of an SCC decomposition:
    sorted tuple of sorted tuples of node ids.  Independent of the library's
    internal component ordering; two libraries agree iff fingerprints match.
    """
    return tuple(sorted(tuple(sorted(map(str, comp))) for comp in components))


def _closure_bases(nodes: list[dict], edges: list[dict], log: OuterLog) -> dict:
    """nodeId -> reflexive-transitive base (set of nodeIds) along resolved
    edges.  See module docstring for the full E2 contract."""
    ids = [n["id"] for n in nodes]
    id_set = set(ids)
    pairs = [(e["srcId"], e["dstId"]) for e in edges
             if e["srcId"] in id_set and e["dstId"] in id_set]

    # ---- both libraries build the same graph ---------------------------
    g = rx.PyDiGraph()
    idx = {nid: g.add_node(nid) for nid in ids}
    for src, dst in pairs:
        g.add_edge(idx[src], idx[dst], None)

    ng = nx.DiGraph()
    ng.add_nodes_from(ids)
    ng.add_edges_from(pairs)

    # ---- SCC decomposition per library, aggregate fingerprint crosscheck
    rx_sccs_raw = rx.strongly_connected_components(g)
    rx_sccs = [[g[i] for i in comp] for comp in rx_sccs_raw]
    nx_sccs = [list(comp) for comp in nx.strongly_connected_components(ng)]
    if _scc_fingerprint(rx_sccs) != _scc_fingerprint(nx_sccs):
        rx_set = {frozenset(c) for c in rx_sccs}
        nx_set = {frozenset(c) for c in nx_sccs}
        log.emit("outerwall.outline.closure", {
            "libraryPrimary": f"rustworkx {rx.__version__}",
            "crosscheck": f"networkx {nx.__version__}",
            "agrees": False, "aggregate": "scc-fingerprint",
            "onlyInRustworkx": sorted(map(sorted, rx_set - nx_set)),
            "onlyInNetworkx": sorted(map(sorted, nx_set - rx_set))})
        raise OutlineClosureDisagreement(
            "closure: rustworkx and networkx disagree on the SCC "
            "decomposition (aggregate fingerprint mismatch); closure "
            "over resolved edges is not well-defined until both agree")

    # ---- bottom-up: descendants per SCC on the condensation ------------
    node_to_scc: dict[str, int] = {}
    for i, comp in enumerate(rx_sccs):
        for nid in comp:
            node_to_scc[nid] = i
    n_sccs = len(rx_sccs)
    succ_sccs: list[set[int]] = [set() for _ in range(n_sccs)]
    # singleton SCC with a self-loop counts as reachable from itself
    self_reach = [len(rx_sccs[i]) > 1 for i in range(n_sccs)]
    for src, dst in pairs:
        s, d = node_to_scc[src], node_to_scc[dst]
        if s != d:
            succ_sccs[s].add(d)
        elif len(rx_sccs[s]) == 1:
            self_reach[s] = True

    # Kahn's toposort (sources first); reverse gives sinks first for union
    indeg = [0] * n_sccs
    for s in range(n_sccs):
        for t in succ_sccs[s]:
            indeg[t] += 1
    order: list[int] = []
    stack = [s for s in range(n_sccs) if indeg[s] == 0]
    while stack:
        s = stack.pop()
        order.append(s)
        for t in succ_sccs[s]:
            indeg[t] -= 1
            if indeg[t] == 0:
                stack.append(t)

    # reach_members[s] = union of members of successor SCCs (transitively)
    reach_members: list[set] = [set() for _ in range(n_sccs)]
    for s in reversed(order):
        r: set = set()
        for t in succ_sccs[s]:
            r |= reach_members[t]
            r |= set(rx_sccs[t])
        reach_members[s] = r

    bases: dict[str, set] = {}
    for s, comp in enumerate(rx_sccs):
        comp_set = set(comp)
        if self_reach[s]:
            # every member is a descendant of every other (and of itself)
            base = reach_members[s] | comp_set
            for nid in comp:
                bases[nid] = base | {nid}       # reflexive: self included
        else:
            # singleton with no self-loop: descendants = successors only
            for nid in comp:
                bases[nid] = reach_members[s] | {nid}   # reflexive add-self

    log.emit("outerwall.outline.closure", {
        "libraryPrimary": f"rustworkx {rx.__version__}",
        "crosscheck": f"networkx {nx.__version__}", "agrees": True,
        "aggregate": "scc-fingerprint",
        "nodes": len(ids), "resolvedEdges": len(pairs),
        "sccs": n_sccs,
        "closureKind": "reflexive-transitive over resolved edges (ruling 8; "
                       "single bottom-up pass over the condensation, E2 "
                       "pre-GitHub)"})
    return bases
