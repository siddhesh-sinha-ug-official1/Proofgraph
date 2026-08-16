"""Content-addressed IDs (Frozen Schema + the 7.7 hashing spec).

IMPLEMENTATION CHOICE (marked for a later round to revisit): SHA-256, hex,
truncated to 16 chars, domain-separated preimages joined by the unit separator
0x1f:
    node: "node:v0" US lang US kind US canonicalName US file US path
    edge: "edge:v0" US kind US srcId US dstId

`normalizedSpan` is the reformatting-invariant structural locator {file, path}
— deliberately NOT byte offsets.  The raw byte span lives in Node.span and is
used ONLY for reprint.  That is what makes ids stable across reformatting.
"""
import hashlib

US = "\x1f"
US_ESCAPED = "\\x1f"  # how the delimiter is spelled in probe payloads
NODE_DOMAIN_TAG = "node:v0"
EDGE_DOMAIN_TAG = "edge:v0"
TRUNCATE = 16


def sha256_hex(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def node_preimage(lang, kind, canonical_name, file, path):
    return US.join([NODE_DOMAIN_TAG, lang, kind, canonical_name, file, path])


def edge_preimage(kind, src_id, dst_id):
    return US.join([EDGE_DOMAIN_TAG, kind, src_id, dst_id])


def node_id_from_preimage(preimage):
    return "n_" + sha256_hex(preimage)[:TRUNCATE]


def edge_id_from_preimage(preimage):
    return "e_" + sha256_hex(preimage)[:TRUNCATE]


def canonical_name_for(module_name, decl_kind, raw_name):
    """Qualified name: the module IS its name; members are module.member."""
    if decl_kind == "module":
        return module_name
    return f"{module_name}.{raw_name}"


def structural_path_for(module_name, decl_kind, raw_name):
    """The structural locator path (container chain), e.g. sample::A."""
    if decl_kind == "module":
        return module_name
    return f"{module_name}::{raw_name}"


def compute_node_identity(lang, kind, module_name, raw_name, file):
    """Pure identity computation shared by S2, re-ingest, and the fixpoint checks."""
    canonical = canonical_name_for(module_name, kind, raw_name)
    path = structural_path_for(module_name, kind, raw_name)
    preimage = node_preimage(lang, kind, canonical, file, path)
    full_hex = sha256_hex(preimage)
    return {
        "canonicalName": canonical,
        "path": path,
        "normalizedSpan": {"file": file, "path": path},
        "preimage": preimage,
        "fullHex": full_hex,
        "nodeId": "n_" + full_hex[:TRUNCATE],
    }


def compute_edge_identity(kind, src_id, dst_id):
    preimage = edge_preimage(kind, src_id, dst_id)
    full_hex = sha256_hex(preimage)
    return {
        "preimage": preimage,
        "fullHex": full_hex,
        "edgeId": "e_" + full_hex[:TRUNCATE],
    }


def ids_from_manifest(manifest):
    """Recover the full node id set implied by (manifest, logical file) — the
    pure re-ingest used by the text projection and the round-trip id checks."""
    module_name = manifest["module"]["name"]
    file = manifest["module"]["file"]
    lang = manifest["module"].get("lang", "python")
    ids = [compute_node_identity(lang, "module", module_name, module_name, file)["nodeId"]]
    for decl in manifest["decls"]:
        ids.append(compute_node_identity(lang, decl["kind"], module_name, decl["name"], file)["nodeId"])
    return sorted(ids)
