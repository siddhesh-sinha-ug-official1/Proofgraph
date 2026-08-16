"""The wall's read faces: query (library calls EXACTLY — src/t3.py, never
hand-rolled), project ('graph' | 'flat'; 'text' honestly refused), and
verdictOf ({fill, outline} pass-through, never invented).
"""
from copy import deepcopy

from src import t3 as t3lib
from src.wall.base import (PROJECT_KINDS, QUERY_KINDS, SCHEMA_PIN_VERSION,
                           _WALL_STAGE)


class _QueryFace:
    # ---- face: query (library calls EXACTLY — src/t3.py, never hand-rolled) ----
    def query(self, kind, **args):
        if self._state is None:
            self._reject_query(kind, "no-graph-ingested",
                               "query before any successful ingest")
        if kind not in QUERY_KINDS:
            self._reject_query(kind, "unknown-query",
                               f"known query kinds: {QUERY_KINDS}")

        universe = [n["id"] for n in self._state["nodes"] if n["kind"] != "module"]
        universe_set = set(universe)
        graph_edges = [e for e in self._state["edges"]
                       if e["srcId"] in universe_set and e["dstId"] in universe_set]

        if kind in ("reachable", "unused"):
            roots = args.get("roots")
            roots = list(roots) if roots is not None else list(self._state["roots"])
            if not roots:
                # roots are DECLARED, never inferred: no roots -> no claim.
                self._reject_query(kind, "roots-undeclared",
                                   "roots are declared, never inferred — with no "
                                   "declared roots the wall makes no "
                                   "reachable/unused claim")
            for r in roots:
                if r not in universe_set:
                    self._reject_query(kind, "unknown-root",
                                       f"root {r!r} is not a decl node")
            rw_graph, index_by_id, _ = t3lib.build_rustworkx(universe, graph_edges)
            per_root, rw_reachable = t3lib.rx_reachability(rw_graph, index_by_id, roots)
            nx_graph = t3lib.build_networkx(universe, graph_edges)
            nx_reachable = t3lib.nx_reachability(nx_graph, roots)
            if rw_reachable != nx_reachable:
                self._reject_query(kind, "t3-library-disagreement",
                                   f"rustworkx={rw_reachable} networkx={nx_reachable}")
            crosscheck = {"library": "networkx", "agrees": True, "symmetricDiff": []}
            if kind == "reachable":
                result = {"roots": roots, "reachable": rw_reachable,
                          "perRoot": per_root, "crosscheck": crosscheck}
            else:
                result = {"roots": roots,
                          "unused": sorted(universe_set - set(rw_reachable)),
                          "crosscheck": crosscheck,
                          "blindSpots": list(t3lib.BLIND_SPOTS),
                          "soundnessNote": t3lib.SOUNDNESS_NOTE}
        elif kind == "sccs":
            rw_graph, _, _ = t3lib.build_rustworkx(universe, graph_edges)
            nx_graph = t3lib.build_networkx(universe, graph_edges)
            rw_scc, nx_scc = t3lib.rx_sccs(rw_graph), t3lib.nx_sccs(nx_graph)
            if rw_scc != nx_scc:
                self._reject_query(kind, "t3-library-disagreement",
                                   f"SCC partitions differ: rustworkx={rw_scc} "
                                   f"networkx={nx_scc}")
            result = {"sccs": rw_scc,
                      "crosscheck": {"library": "networkx", "agrees": True}}
        else:  # condensation
            rw_graph, _, _ = t3lib.build_rustworkx(universe, graph_edges)
            nx_graph = t3lib.build_networkx(universe, graph_edges)
            cond_edges, nx_is_dag = t3lib.nx_condensation(nx_graph)
            is_dag = nx_is_dag and t3lib.rx_condensation_is_dag(rw_graph)
            if not is_dag:
                self._reject_query(kind, "condensation-not-dag",
                                   "condensation-of-SCCs is not a DAG — "
                                   "SCC/condensation bug")
            result = {"condensationEdges": cond_edges, "isDAG": is_dag,
                      "sccs": t3lib.rx_sccs(rw_graph)}

        self._bus.emit("graph-model.wall.query", _WALL_STAGE, "value",
                       {"kind": kind, "args": deepcopy(args), "result": result},
                       cause=self._version_ref)
        return deepcopy(result)

    # ---- face: project ----
    def project(self, kind):
        if kind not in PROJECT_KINDS:
            self._refuse_projection(kind, "unknown-projection",
                                    f"known projection kinds: {PROJECT_KINDS}")
        if kind == "text":
            # ingest(nodes, edges) carries no byte-source/manifest material;
            # a reprint from here would be a fabrication.  Honest refusal.
            self._refuse_projection(
                kind, "projection-unavailable-no-source",
                "the text projection requires byte-source/manifest material "
                "that ingest(nodes, edges) does not carry")
        if self._state is None:
            self._refuse_projection(kind, "no-graph-ingested",
                                    "projection before any successful ingest")

        if kind == "graph":
            out = {"schemaVersion": SCHEMA_PIN_VERSION,
                   "nodes": deepcopy(self._state["nodes"]),
                   "edges": deepcopy(self._state["edges"]),
                   "leads": deepcopy(self._state["leads"])}
        else:  # flat
            roots = self._state["roots"]
            reachable, unused = set(), set()
            claims = bool(roots)
            if claims:
                reachable = set(self.query("reachable")["reachable"]) | set(roots)
                unused = set(self.query("unused")["unused"])
            rows = []
            for n in self._state["nodes"]:
                is_container = n["kind"] == "module"
                no_claim = is_container or not claims
                rows.append({
                    "id": n["id"], "kind": n["kind"], "name": n["name"],
                    "fill": dict(n["fill"]), "tier": n["provenance"]["tier"],
                    # T3-derived, labeled as such; None where the wall makes
                    # no claim (container, or no declared roots).
                    "reachable": None if no_claim else n["id"] in reachable,
                    "unused": None if no_claim else n["id"] in unused,
                })
            out = rows

        self._bus.emit("graph-model.wall.project", _WALL_STAGE, "value",
                       {"kind": kind, "available": True}, cause=self._version_ref)
        return out

    # ---- face: verdictOf ----
    def verdictOf(self, node_id):
        if self._state is None:
            self._reject_query("verdictOf", "no-graph-ingested",
                               "verdictOf before any successful ingest")
        node = next((n for n in self._state["nodes"] if n["id"] == node_id), None)
        if node is None:
            self._reject_query("verdictOf", "unknown-node",
                               f"no ingested node with id {node_id!r}")
        verdict = {"fill": deepcopy(node["fill"]),
                   "outline": deepcopy(node["outline"])}  # null passes through
        self._bus.emit("graph-model.wall.verdict", _WALL_STAGE, "value",
                       {"nodeId": node_id, **verdict}, cause=self._version_ref)
        return verdict
