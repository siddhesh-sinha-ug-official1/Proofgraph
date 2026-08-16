"""T3 wiring: rustworkx (primary) + NetworkX (mandatory cross-check).

Dossier rule: "Never implement these yourself." — every graph property here is
a library call; this module only builds graphs, calls, and normalizes outputs
into deterministic (sorted) id lists.  rustworkx API symbols verified against
0.18.0 at integration: PyDiGraph, descendants, strongly_connected_components,
condensation, is_directed_acyclic_graph.
"""
import networkx as nx
import rustworkx as rx

BLIND_SPOTS = ["dynamic dispatch", "reflection", "dynamic import"]
SOUNDNESS_NOTE = "reachability-based 'unused' is only as complete as the resolved edge set"


def build_rustworkx(universe_ids, edges):
    """universe_ids: ordered node ids; edges: [{srcId,dstId,id}] (resolved ONLY)."""
    graph = rx.PyDiGraph()
    index_by_id = {}
    for node_id in universe_ids:
        index_by_id[node_id] = graph.add_node(node_id)
    edges_in = []
    for e in edges:
        graph.add_edge(index_by_id[e["srcId"]], index_by_id[e["dstId"]], e["id"])
        edges_in.append({"srcIdx": index_by_id[e["srcId"]],
                        "dstIdx": index_by_id[e["dstId"]], "edgeId": e["id"]})
    return graph, index_by_id, edges_in


def rx_reachability(graph, index_by_id, root_ids):
    per_root = {}
    reachable = set(root_ids)
    for root in root_ids:
        desc_idx = rx.descendants(graph, index_by_id[root])
        desc_ids = sorted(graph[i] for i in desc_idx)
        per_root[root] = desc_ids
        reachable.update(desc_ids)
    return per_root, sorted(reachable)


def rx_sccs(graph):
    return normalize_sccs([[graph[i] for i in comp]
                           for comp in rx.strongly_connected_components(graph)])


def rx_condensation_is_dag(graph):
    return bool(rx.is_directed_acyclic_graph(rx.condensation(graph)))


def build_networkx(universe_ids, edges):
    graph = nx.DiGraph()
    graph.add_nodes_from(universe_ids)
    for e in edges:
        graph.add_edge(e["srcId"], e["dstId"], edgeId=e["id"])
    return graph


def nx_reachability(graph, root_ids):
    reachable = set(root_ids)
    for root in root_ids:
        reachable.update(nx.descendants(graph, root))
    return sorted(reachable)


def nx_sccs(graph):
    return normalize_sccs([list(c) for c in nx.strongly_connected_components(graph)])


def nx_condensation(graph):
    cond = nx.condensation(graph)
    edges = sorted([list(e) for e in cond.edges()])
    return edges, bool(nx.is_directed_acyclic_graph(cond))


def normalize_sccs(sccs):
    """Deterministic SCC partition: sort members, then sort components."""
    return sorted([sorted(c) for c in sccs])
