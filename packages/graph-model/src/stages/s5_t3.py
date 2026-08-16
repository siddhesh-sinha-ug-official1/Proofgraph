"""S5 t3: exactly ONE graph property — reachability-from-roots — through
rustworkx, cross-checked against NetworkX (they must agree EXACTLY), plus the
Tarjan-SCC / condensation-is-DAG sanity invariant.  Only resolved edges enter
the graph; unresolved leads never do.  The universe is the decl nodes — the
module container is excluded (reachability is over the call/reference graph,
not containment; the schema has no containment edge).
"""
from ..errors import GateFailure
from .. import t3 as t3lib

STAGE = "t3"


def run(cell, ctx, in_ref):
    bus = cell.bus
    nodes = ctx["nodes"]
    by_name = ctx["nodeTable"]["byName"]

    universe = [n["id"] for n in nodes if n["kind"] != "module"]
    excluded = [n["id"] for n in nodes if n["kind"] == "module"]
    universe_set = set(universe)
    uni_ref = bus.emit("graph-model.t3.universe", STAGE, "value",
                       {"declNodeIds": universe, "excluded": excluded,
                        "reason": "reachability universe = decls, not containers"},
                       cause=in_ref)

    root_ids = []
    for root_name in ctx["roots"]["roots"]:
        root_id = by_name.get(root_name)
        if root_id is None or root_id not in universe_set:
            raise GateFailure("unknown-root",
                              f"declared root {root_name!r} is not a decl node")
        root_ids.append(root_id)
    roots_ref = bus.emit("graph-model.t3.roots", STAGE, "value",
                         {"rootIds": root_ids, "source": "declared"}, cause=uni_ref)

    # ONLY resolved edges enter the T3 graph (a lead is not an edge).
    graph_edges = [e for e in ctx["edgeSplit"]["resolvedEdges"]
                   if e["srcId"] in universe_set and e["dstId"] in universe_set]

    rw_graph, index_by_id, edges_in = t3lib.build_rustworkx(universe, graph_edges)
    nodes_in_ref = bus.emit("graph-model.t3.rustworkx.build.nodesIn", STAGE, "call",
                            {"indexById": index_by_id, "nodeCount": len(universe)},
                            cause=roots_ref)
    edges_in_ref = bus.emit("graph-model.t3.rustworkx.build.edgesIn", STAGE, "call",
                            {"edges": edges_in, "edgeCount": len(edges_in),
                             "usedOnlyResolved": True}, cause=nodes_in_ref)

    per_root, rw_reachable = t3lib.rx_reachability(rw_graph, index_by_id, root_ids)
    desc_ref = bus.emit("graph-model.t3.rustworkx.descendants", STAGE, "value",
                        {"perRoot": per_root}, cause=edges_in_ref)
    rw_reach_ref = bus.emit("graph-model.t3.rustworkx.reachable", STAGE, "output",
                            {"reachableSet": rw_reachable}, cause=desc_ref)
    rw_unused = sorted(universe_set - set(rw_reachable))
    bus.emit("graph-model.t3.rustworkx.unused", STAGE, "output",
             {"unusedSet": rw_unused}, cause=rw_reach_ref)

    nx_graph = t3lib.build_networkx(universe, graph_edges)
    nx_build_ref = bus.emit("graph-model.t3.networkx.build", STAGE, "call",
                            {"nodeCount": nx_graph.number_of_nodes(),
                             "edgeCount": nx_graph.number_of_edges()}, cause=roots_ref)
    nx_reachable = t3lib.nx_reachability(nx_graph, root_ids)
    nx_reach_ref = bus.emit("graph-model.t3.networkx.reachable", STAGE, "value",
                            {"reachableSet": nx_reachable}, cause=nx_build_ref)
    nx_unused = sorted(universe_set - set(nx_reachable))
    bus.emit("graph-model.t3.networkx.unused", STAGE, "value",
             {"unusedSet": nx_unused}, cause=nx_reach_ref)

    symmetric_diff = sorted((set(rw_reachable) ^ set(nx_reachable))
                            | (set(rw_unused) ^ set(nx_unused)))
    agree = not symmetric_diff
    bus.emit("graph-model.t3.crosscheck.reachable", STAGE, "decision",
             {"rustworkx": rw_reachable, "networkx": nx_reachable,
              "agree": agree, "symmetricDiff": symmetric_diff}, cause=rw_reach_ref)
    if not agree:
        raise GateFailure("t3-library-disagreement",
                          f"rustworkx and networkx disagree on reachability: "
                          f"symmetricDiff={symmetric_diff}")

    rw_scc = t3lib.rx_sccs(rw_graph)
    nx_scc = t3lib.nx_sccs(nx_graph)
    rw_scc_ref = bus.emit("graph-model.t3.scc.rustworkx", STAGE, "value",
                          {"sccs": rw_scc}, cause=edges_in_ref)
    bus.emit("graph-model.t3.scc.networkx", STAGE, "value",
             {"sccs": nx_scc}, cause=nx_build_ref)
    if rw_scc != nx_scc:
        raise GateFailure("t3-library-disagreement",
                          f"SCC partitions differ: rustworkx={rw_scc} networkx={nx_scc}")

    cond_edges, nx_is_dag = t3lib.nx_condensation(nx_graph)
    rw_is_dag = t3lib.rx_condensation_is_dag(rw_graph)
    is_dag = nx_is_dag and rw_is_dag
    bus.emit("graph-model.t3.condensation.isDAG", STAGE, "decision",
             {"condensationEdges": cond_edges, "isDAG": is_dag}, cause=rw_scc_ref)
    if not is_dag:
        raise GateFailure("condensation-not-dag",
                          "condensation-of-SCCs is not a DAG — SCC/condensation bug")

    bus.emit("graph-model.t3.cap", STAGE, "value",
             {"johnsonLengthBound": None, "nodeCap": None,
              "note": "no bounds applied in the walking skeleton; logged per the "
                      "no-silent-caps rule (cycle enumeration is out of scope here)"},
             cause=in_ref)

    result = {
        "property": "reachability-from-roots",
        "roots": root_ids,
        "reachable": rw_reachable,
        "unused": rw_unused,
        "library": "rustworkx",
        "crosscheck": {"library": "networkx", "agrees": agree,
                       "symmetricDiff": symmetric_diff},
        "scc": {"rustworkx": rw_scc, "networkx": nx_scc,
                "condensationIsDAG": is_dag},
        "caps": {"johnsonLengthBound": None, "nodeCap": None},
        "blindSpots": list(t3lib.BLIND_SPOTS),
        "soundnessNote": t3lib.SOUNDNESS_NOTE,
    }
    bus.emit("graph-model.t3.result", STAGE, "state", result, cause=in_ref)
    ctx["t3"] = result
