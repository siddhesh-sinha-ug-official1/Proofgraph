"""S6 project: three isomorphic projections, all carrying identical Node.ids.

text  = byte-exact reprint by tiling the ordered spans over the source buffer
graph = {schemaVersion, nodes, edges, leads} JSON, schema-conformant
        (leads carried SEPARATELY — a resolved=false lead never sits in edges)
flat  = node list with T3-derived reachable/unused clearly labeled, never
        conflated with fill

The id set is recovered from each projection and asserted identical.
"""
from ..errors import GateFailure
from ..ids import ids_from_manifest, sha256_hex
from ..schema_tools import canonical_json
from ..validate import validate_graph

STAGE = "project"


def tile_spans(ingest):
    """Ordered (start, end, srcNodeId|'trivia') tiles for reprint."""
    tiles = ([{"start": d["byteStart"], "end": d["byteEnd"], "ordinal": d["ordinal"]}
              for d in ingest["decls"]]
             + [{"start": t["byteStart"], "end": t["byteEnd"], "ordinal": None}
                for t in ingest["trivia"]])
    return sorted(tiles, key=lambda t: t["start"])


def reprint_from_tiles(source_text, tiles):
    data = source_text.encode("utf-8")
    return b"".join(data[t["start"]:t["end"]] for t in tiles).decode("utf-8")


def run(cell, ctx, in_ref):
    bus = cell.bus
    ingest = ctx["ingest"]
    node_by_ordinal = ctx["nodeByOrdinal"]
    t3 = ctx["t3"]
    reachable, unused = set(t3["reachable"]), set(t3["unused"])

    # ---- text projection ----
    tiles = tile_spans(ingest)
    ordered_spans = [{"start": t["start"], "end": t["end"],
                      "srcNodeId": (node_by_ordinal[str(t["ordinal"])]
                                    if t["ordinal"] is not None else "trivia")}
                     for t in tiles]
    tile_ref = bus.emit("graph-model.project.text.tileOrder", STAGE, "value",
                        {"orderedSpans": ordered_spans}, cause=in_ref)
    reprint = reprint_from_tiles(ctx["source"]["text"], tiles)
    reprint_bytes = reprint.encode("utf-8")
    text_ref = bus.emit("graph-model.project.text.emit", STAGE, "output",
                        {"bytes": reprint, "byteLen": len(reprint_bytes),
                         "sha256": sha256_hex(reprint_bytes)}, cause=tile_ref)
    span_to_node = {f"{s['start']}-{s['end']}": s["srcNodeId"] for s in ordered_spans}
    bus.emit("graph-model.project.text.idsCarried", STAGE, "value",
             {"spanToNodeId": span_to_node}, cause=text_ref)

    # ---- graph-JSON projection ----
    graph = {
        "schemaVersion": ctx["freeze"]["schemaVersion"],
        "nodes": ctx["nodes"],
        "edges": ctx["edgeSplit"]["resolvedEdges"],
        "leads": ctx["edgeSplit"]["unresolvedLeads"],
    }
    nodes_ref = bus.emit("graph-model.project.graphjson.nodes", STAGE, "value",
                         {"nodes": graph["nodes"], "count": len(graph["nodes"])},
                         cause=in_ref)
    bus.emit("graph-model.project.graphjson.edges", STAGE, "value",
             {"edges": graph["edges"], "count": len(graph["edges"]),
              "resolvedOnly": all(e["resolved"] for e in graph["edges"]),
              "leadsCarriedSeparately": True}, cause=nodes_ref)
    graph_json = canonical_json(graph)
    conforms, errors = validate_graph(graph, ctx["freeze"]["schema"])
    graphjson_ref = bus.emit("graph-model.project.graphjson.emit", STAGE, "output",
                             {"json": graph_json, "sha256": sha256_hex(graph_json),
                              "conformsToSchema": conforms}, cause=nodes_ref)
    if not conforms:
        raise GateFailure("graphjson-nonconformant",
                          f"graph-JSON violates schema.json: {errors}")

    # ---- flat node-list projection ----
    rows = []
    for node in ctx["nodes"]:
        is_container = node["kind"] == "module"
        rows.append({
            "id": node["id"], "kind": node["kind"], "name": node["name"],
            "fill": dict(node["fill"]), "tier": node["provenance"]["tier"],
            # T3-derived, labeled as such; None for the container (not in the
            # reachability universe). NEVER written into fill.
            "reachable": None if is_container else node["id"] in reachable,
            "unused": None if is_container else node["id"] in unused,
        })
    flat_ref = bus.emit("graph-model.project.flat.emit", STAGE, "output",
                        {"rows": rows, "count": len(rows)}, cause=in_ref)

    # ---- ids agree across all three ----
    # the pure re-ingest: ids implied by (manifest, logical file) — the id
    # computation never consumes reprint bytes (that is the invariance claim)
    text_ids = ids_from_manifest(ingest["manifest"])
    graph_ids = sorted(n["id"] for n in graph["nodes"])
    flat_ids = sorted(r["id"] for r in rows)
    t_ref = bus.emit("graph-model.project.ids.text", STAGE, "value",
                     {"ids": text_ids}, cause=text_ref)
    bus.emit("graph-model.project.ids.graphjson", STAGE, "value",
             {"ids": graph_ids}, cause=graphjson_ref)
    bus.emit("graph-model.project.ids.flat", STAGE, "value",
             {"ids": flat_ids}, cause=flat_ref)
    all_equal = text_ids == graph_ids == flat_ids
    diffs = {} if all_equal else {
        "text_vs_graph": sorted(set(text_ids) ^ set(graph_ids)),
        "text_vs_flat": sorted(set(text_ids) ^ set(flat_ids)),
    }
    bus.emit("graph-model.project.ids.agree", STAGE, "decision",
             {"textIds": text_ids, "graphIds": graph_ids, "flatIds": flat_ids,
              "allEqual": all_equal, "diffs": diffs}, cause=t_ref)
    if not all_equal:
        raise GateFailure("projection-id-drift",
                          f"projections carry different id sets: {diffs}")

    ctx["projections"] = {
        "text": {"bytes": reprint, "byteLen": len(reprint_bytes),
                 "sha256": sha256_hex(reprint_bytes),
                 "tileOrder": ordered_spans, "spanToNodeId": span_to_node},
        "graph": graph,
        "flat": rows,
    }
    ctx["idAgreement"] = {"textIds": text_ids, "graphIds": graph_ids,
                          "flatIds": flat_ids, "allEqual": all_equal}
