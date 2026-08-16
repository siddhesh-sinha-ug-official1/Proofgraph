"""S2 node-build: content-addressed Nodes from raw decl records.

The id preimage is (domainTag, lang, kind, canonicalName, file, path) — the
structural locator, deliberately NOT byte offsets, which is why ids survive
reformatting.  Every hash input, preimage, and result gets a tap; a collision
is a gate failure (two decls silently merging into one node).
"""
from ..errors import GateFailure
from ..ids import (NODE_DOMAIN_TAG, TRUNCATE, US_ESCAPED, compute_node_identity)

STAGE = "node"
EXTRACTOR = "skeleton.handwritten"
HONEST_FILL = {"status": "unknown", "source": "skeleton:no-compiler-attached"}


def run(cell, ctx, in_ref):
    bus = cell.bus
    manifest = ctx["ingest"]["manifest"]
    module_name = manifest["module"]["name"]
    file = manifest["module"]["file"]
    lang = manifest["module"].get("lang", "python")
    decl_refs = ctx["ingest"]["declProbeRefs"]

    nodes = []
    by_id = {}
    by_name = {}
    node_create_refs = {}
    node_by_ordinal = {}
    first_seen_ordinal = {}

    for rec in [ctx["ingest"]["module"]] + ctx["ingest"]["decls"]:
        cause = decl_refs[str(rec["ordinal"])]
        ident = compute_node_identity(lang, rec["kind"], module_name, rec["name"], file)

        cn_ref = bus.emit("graph-model.node.canonicalName", STAGE, "value",
                          {"raw": rec["name"], "canonicalName": ident["canonicalName"]},
                          cause=cause)
        ns_ref = bus.emit("graph-model.node.normalizedSpan", STAGE, "value",
                          {"file": file, "path": ident["path"],
                           "rawSpan": {"byteStart": rec["byteStart"], "byteEnd": rec["byteEnd"]},
                           "normalizedSpan": ident["normalizedSpan"]}, cause=cn_ref)
        inputs_ref = bus.emit("graph-model.node.id.inputs", STAGE, "value",
                              {"lang": lang, "kind": rec["kind"],
                               "canonicalName": ident["canonicalName"],
                               "normalizedSpan": ident["normalizedSpan"],
                               "domainTag": NODE_DOMAIN_TAG}, cause=ns_ref)
        bus.emit("graph-model.node.id.preimage", STAGE, "value",
                 {"preimageString": ident["preimage"], "encoding": "utf-8",
                  "delimiter": US_ESCAPED}, cause=inputs_ref)
        hash_ref = bus.emit("graph-model.node.id.hash", STAGE, "value",
                            {"algo": "sha256", "fullHex": ident["fullHex"],
                             "truncated": TRUNCATE, "nodeId": ident["nodeId"]},
                            cause=inputs_ref)

        node = {
            "id": ident["nodeId"],
            "kind": rec["kind"],
            "lang": lang,
            "name": ident["canonicalName"],
            "signature": None,
            "span": {"file": file, "byteStart": rec["byteStart"], "byteEnd": rec["byteEnd"]},
            "fill": dict(HONEST_FILL),
            "outline": None,
            "origin": "given" if rec["kind"] == "module" else "assumed",
            "provenance": {"tier": "T1", "extractor": EXTRACTOR, "resolved": True},
        }
        create_ref = bus.emit("graph-model.node.create", STAGE, "node",
                              {"node": node}, cause=hash_ref)
        bus.emit("graph-model.node.provenance", STAGE, "value",
                 dict(node["provenance"]), cause=create_ref)

        collided = node["id"] in by_id
        bus.emit("graph-model.node.id.collision", STAGE, "decision",
                 {"nodeId": node["id"],
                  "firstSeenOrdinal": first_seen_ordinal.get(node["id"], rec["ordinal"]),
                  "dupOrdinal": rec["ordinal"] if collided else None,
                  "collided": collided}, cause=hash_ref)
        if collided:
            raise GateFailure(
                "id-collision",
                f"node id {node['id']} for ordinal {rec['ordinal']} collides with "
                f"ordinal {first_seen_ordinal[node['id']]} — two decls would silently merge")

        first_seen_ordinal[node["id"]] = rec["ordinal"]
        nodes.append(node)
        by_id[node["id"]] = node
        by_name[node["name"]] = node["id"]
        node_create_refs[node["id"]] = create_ref
        node_by_ordinal[str(rec["ordinal"])] = node["id"]

    bus.emit("graph-model.node.table", STAGE, "state",
             {"byId": by_id, "byName": by_name, "count": len(by_id)}, cause=in_ref)

    ctx["nodes"] = nodes
    ctx["nodeTable"] = {"byId": by_id, "byName": by_name}
    ctx["nodeByOrdinal"] = node_by_ordinal
    ctx["nodeCreateRefs"] = node_create_refs
