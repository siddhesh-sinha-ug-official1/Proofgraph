"""The canonical content-addressed ID MINT (assembly ruling 5) — cell mirror.

Split from schema.py (SUB200 restructure); schema.py re-exports every name so
`extractor.schema` remains the single import surface for the mint.

Verified-in-sync with packages/schema/ids.py + vectors.json (membrane test
selftest/test_schema_sync.py).  SHA-256, hex, first 16 chars, domain-separated
preimages joined by the unit separator 0x1f:
    node: "node:v0" US lang US kind US canonicalName US file US path
    edge: "edge:v0" US kind US srcId US dstId
The preimage is the reformatting-invariant STRUCTURAL locator {file, path} —
NOT span text: ids are stable across reformatting AND body edits.  The raw
byte span lives in Node.span and is used only for reprint.
"""
from __future__ import annotations

import hashlib

US = "\x1f"
US_ESCAPED = "\\x1f"           # how the delimiter is spelled in probe payloads
NODE_DOMAIN_TAG = "node:v0"
EDGE_DOMAIN_TAG = "edge:v0"
ID_TRUNCATE = 16


def sha256_hex(data: str | bytes) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def canonical_name_for(module_name: str, decl_kind: str, raw_name: str) -> str:
    """Qualified name: the module IS its name; members are module.member."""
    if decl_kind == "module":
        return module_name
    return f"{module_name}.{raw_name}"


def structural_path_for(module_name: str, decl_kind: str, raw_name: str) -> str:
    """The structural locator path (container chain), e.g. sample::A."""
    if decl_kind == "module":
        return module_name
    return f"{module_name}::{raw_name}"


def node_preimage(lang: str, kind: str, canonical_name: str, file: str, path: str) -> str:
    return US.join([NODE_DOMAIN_TAG, lang, kind, canonical_name, file, path])


def edge_preimage(kind: str, src_id: str, dst_id: str) -> str:
    return US.join([EDGE_DOMAIN_TAG, kind, src_id, dst_id])


def node_id(lang: str, kind: str, canonical_name: str, file: str, path: str) -> tuple[str, dict]:
    """Canonical node mint. Returns (id, probe-payload preimage dict)."""
    pre = node_preimage(lang, kind, canonical_name, file, path)
    nid = "n_" + sha256_hex(pre)[:ID_TRUNCATE]
    return nid, {"lang": lang, "kind": kind, "canonicalName": canonical_name,
                 "file": file, "path": path, "joined": pre.replace(US, US_ESCAPED)}


def edge_id(kind: str, src_id: str, dst_id: str) -> tuple[str, dict]:
    """Canonical edge mint — deterministic and dedup-friendly."""
    pre = edge_preimage(kind, src_id, dst_id)
    eid = "e_" + sha256_hex(pre)[:ID_TRUNCATE]
    return eid, {"kind": kind, "srcId": src_id, "dstId": dst_id,
                 "joined": pre.replace(US, US_ESCAPED)}


def compute_node_identity(lang: str, kind: str, module_name: str, raw_name: str,
                          file: str) -> dict:
    """Pure identity computation — byte-agrees with packages/schema/ids.py
    (asserted against vectors.json by the membrane test)."""
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
        "nodeId": "n_" + full_hex[:ID_TRUNCATE],
    }
