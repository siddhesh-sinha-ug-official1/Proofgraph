"""S3 edge-build: resolve each use-site against the node table.

Resolved hit  -> Edge {resolved:true}  — may enter the T3 graph.
Miss          -> a LEAD {resolved:false, dstId:"unresolved:<name>", resolver:""}
                 held in a SEPARATE list; a lead is not an edge and may never
                 be presented as a real relationship.
Malformed ref (src is not a node) -> edge.rejected, with the reason.
"""
from ..ids import EDGE_DOMAIN_TAG, compute_edge_identity

STAGE = "edge"
RESOLVER = "skeleton.nameTable"


def run(cell, ctx, in_ref):
    bus = cell.bus
    by_name = ctx["nodeTable"]["byName"]
    module_name = ctx["ingest"]["manifest"]["module"]["name"]

    resolved_edges = []
    unresolved_leads = []

    for ref_rec in ctx["ingest"]["refs"]:
        src_id = by_name.get(ref_rec["fromDecl"])
        if src_id is None:
            bus.emit("graph-model.edge.rejected", STAGE, "edge",
                     {"candidate": ref_rec,
                      "reason": f"src {ref_rec['fromDecl']!r} is not a node in the table"},
                     cause=in_ref)
            continue

        qualified = f"{module_name}.{ref_rec['refName']}"
        dst_id = by_name.get(qualified)
        candidates = [dst_id] if dst_id else []
        resolved = dst_id is not None
        attempt_ref = bus.emit(
            "graph-model.edge.resolve.attempt", STAGE, "decision",
            {"refName": ref_rec["refName"], "candidatesByName": candidates,
             "chosenDstId": dst_id, "resolved": resolved,
             "reason": (f"name bound in module scope as {qualified!r}" if resolved
                        else f"no name match for {qualified!r} in the node table")},
            cause=in_ref)

        if resolved:
            branch_ref = bus.emit("graph-model.edge.resolve.resolved", STAGE, "branch",
                                  {"srcId": src_id, "dstId": dst_id, "resolver": RESOLVER},
                                  cause=attempt_ref)
            final_dst, resolver = dst_id, RESOLVER
        else:
            placeholder = f"unresolved:{ref_rec['refName']}"
            branch_ref = bus.emit("graph-model.edge.resolve.unresolved", STAGE, "branch",
                                  {"srcId": src_id, "dstPlaceholder": placeholder,
                                   "resolver": "", "reason": "no name match"},
                                  cause=attempt_ref)
            final_dst, resolver = placeholder, ""

        ident = compute_edge_identity(ref_rec["kind"], src_id, final_dst)
        inputs_ref = bus.emit("graph-model.edge.id.inputs", STAGE, "value",
                              {"kind": ref_rec["kind"], "srcId": src_id,
                               "dstId": final_dst, "domainTag": EDGE_DOMAIN_TAG},
                              cause=branch_ref)
        hash_ref = bus.emit("graph-model.edge.id.hash", STAGE, "value",
                            {"algo": "sha256", "fullHex": ident["fullHex"],
                             "edgeId": ident["edgeId"]}, cause=inputs_ref)

        edge = {
            "id": ident["edgeId"],
            "kind": ref_rec["kind"],
            "srcId": src_id,
            "dstId": final_dst,
            "resolved": resolved,
            "resolver": resolver,
            "provenance": {"tier": "T2", "extractor": RESOLVER},
        }
        create_ref = bus.emit("graph-model.edge.create", STAGE, "edge",
                              {"edge": edge}, cause=hash_ref)
        bus.emit("graph-model.edge.provenance", STAGE, "value",
                 dict(edge["provenance"]), cause=create_ref)

        (resolved_edges if resolved else unresolved_leads).append(edge)

    bus.emit("graph-model.edge.resolvedSet", STAGE, "state",
             {"resolvedEdges": resolved_edges, "unresolvedLeads": unresolved_leads},
             cause=in_ref)
    ctx["edgeSplit"] = {"resolvedEdges": resolved_edges,
                       "unresolvedLeads": unresolved_leads}
