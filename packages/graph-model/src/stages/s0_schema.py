"""S0 schema-freeze: the constitution.

Reads schema.json (canonical), regenerates schema.md from it and byte-SYNCS
graph-schema.ts from the canonical projection
(packages/schema/gen/graph-schema.ts) — bootstrap-writes them if absent;
byte-compares if present — drift is a gate failure. Cross-checks that all three
artifacts enumerate the SAME kinds, and commits the freeze (schemaVersion +
schemaHash).

graph-schema.ts is byte-mirrored from canonical rather than re-generated in the
cell: the cell's old TS generator emitted the pre-amendment format and silently
missed the v0.1 amendment, and nothing gated the gap. Pointing the drift gate at
the canonical projection means a schema amendment can no longer reach canonical
without this cell's S0 failing loudly (Wave-A / cluster-U1, 2026-08-16).
"""
import json
import re

from ..errors import GateFailure
from ..ids import sha256_hex
from ..schema_tools import schema_hash, node_kinds_of, edge_kinds_of
from ..schemagen_core import regenerate

STAGE = "schema"


def _parse_ts_kinds(ts_text):
    # canonical projection form: `export const NODE_KINDS = [ "a", "b" ] as const;`
    def grab(const_name):
        m = re.search(rf"export const {const_name}\s*=\s*\[(.*?)\]\s*as const;",
                      ts_text, re.DOTALL)
        return re.findall(r'"([^"]*)"', m.group(1)) if m else []
    return {"node": grab("NODE_KINDS"), "edge": grab("EDGE_KINDS")}


def _parse_md_kinds(md_text):
    def grab(label):
        m = re.search(rf"^{label} kinds: (.+)$", md_text, re.MULTILINE)
        return [v.strip() for v in m.group(1).split("|")] if m else []
    return {"node": grab("node"), "edge": grab("edge")}


def run(cell, ctx, in_ref):
    bus = cell.bus
    schema_dir = cell.cell_root / "schema"
    json_path = schema_dir / "schema.json"
    json_bytes = json_path.read_bytes()
    schema_obj = json.loads(json_bytes.decode("utf-8"))

    # codegen: schema.json -> schema.md (the cell-generated human spec)
    generated = regenerate(schema_obj)
    for filename, content in generated.items():
        path = schema_dir / filename
        if not path.exists():
            path.write_bytes(content.encode("utf-8"))  # bootstrap
        elif path.read_bytes() != content.encode("utf-8"):
            raise GateFailure(
                "codegen-drift",
                f"{filename} on disk is not byte-regenerable from schema.json — "
                f"the artifact was hand-edited or the generator changed")
    codegen_ref = bus.emit("graph-model.schema.codegen", STAGE, "value",
                           {"from": "schema.json", "to": "schema.md", "generated": True},
                           cause=in_ref)

    # graph-schema.ts is byte-SYNCED from the canonical projection — the cell's
    # rival generator silently missed the v0.1 amendment, so the drift gate now
    # points at packages/schema/gen/graph-schema.ts itself. Any amendment that
    # reaches canonical but not this mirror fails here loudly (cluster-U1).
    canonical_ts = cell.cell_root.parent / "schema" / "gen" / "graph-schema.ts"
    if not canonical_ts.exists():
        raise GateFailure(
            "codegen-drift",
            f"canonical TS projection not found at {canonical_ts} — the cell "
            f"cannot verify its schema surface is in sync with the assembly")
    canonical_ts_bytes = canonical_ts.read_bytes()
    ts_path = schema_dir / "graph-schema.ts"
    ts_bootstrapped = not ts_path.exists()
    if ts_bootstrapped:
        ts_path.write_bytes(canonical_ts_bytes)  # bootstrap: mirror canonical
    elif ts_path.read_bytes() != canonical_ts_bytes:
        raise GateFailure(
            "codegen-drift",
            "schema/graph-schema.ts drifted from the canonical projection "
            "packages/schema/gen/graph-schema.ts — regenerate canonical then "
            "re-mirror (a schema amendment reached canonical but not this cell)")
    ts_bytes = ts_path.read_bytes()
    md_bytes = (schema_dir / "schema.md").read_bytes()
    load_json_ref = bus.emit("graph-model.schema.load.json", STAGE, "value",
                             {"path": "schema/schema.json",
                              "bytes": json_bytes.decode("utf-8"),
                              "sha256": sha256_hex(json_bytes)}, cause=in_ref)
    # load.ts carries the canonical bytes verbatim — its sha256 equals the
    # canonical projection's, so the byte-mirror is observable in the stream.
    bus.emit("graph-model.schema.load.ts", STAGE, "value",
             {"path": "schema/graph-schema.ts", "bytes": ts_bytes.decode("utf-8"),
              "sha256": sha256_hex(ts_bytes)}, cause=codegen_ref)
    bus.emit("graph-model.schema.load.md", STAGE, "value",
             {"path": "schema/schema.md", "bytes": md_bytes.decode("utf-8"),
              "sha256": sha256_hex(md_bytes)}, cause=codegen_ref)

    version = schema_obj["schemaVersion"]
    shash = schema_hash(schema_obj)
    bus.emit("graph-model.schema.version", STAGE, "value",
             {"schemaVersion": version}, cause=load_json_ref)
    hash_ref = bus.emit("graph-model.schema.hash", STAGE, "value",
                        {"schemaHash": shash}, cause=load_json_ref)

    json_kinds = {"node": node_kinds_of(schema_obj), "edge": edge_kinds_of(schema_obj)}
    ts_kinds = _parse_ts_kinds(ts_bytes.decode("utf-8"))
    md_kinds = _parse_md_kinds(md_bytes.decode("utf-8"))
    nk_ref = bus.emit("graph-model.schema.nodeKinds", STAGE, "value",
                      json_kinds["node"], cause=load_json_ref)
    bus.emit("graph-model.schema.edgeKinds", STAGE, "value",
             json_kinds["edge"], cause=load_json_ref)

    agree = ts_kinds == json_kinds == md_kinds
    diff = {} if agree else {
        "ts_vs_json": {"node": sorted(set(ts_kinds["node"]) ^ set(json_kinds["node"])),
                       "edge": sorted(set(ts_kinds["edge"]) ^ set(json_kinds["edge"]))},
        "md_vs_json": {"node": sorted(set(md_kinds["node"]) ^ set(json_kinds["node"])),
                       "edge": sorted(set(md_kinds["edge"]) ^ set(json_kinds["edge"]))},
    }
    bus.emit("graph-model.schema.crosscheck", STAGE, "decision",
             {"tsKinds": ts_kinds, "jsonKinds": json_kinds, "mdKinds": md_kinds,
              "agree": agree, "diff": diff}, cause=nk_ref)
    if not agree:
        raise GateFailure("schema-drift",
                          f"the three schema artifacts enumerate different kinds: {diff}")

    artifacts = [
        {"name": "schema.json", "path": "schema/schema.json", "sha256": sha256_hex(json_bytes)},
        {"name": "graph-schema.ts", "path": "schema/graph-schema.ts", "sha256": sha256_hex(ts_bytes)},
        {"name": "schema.md", "path": "schema/schema.md", "sha256": sha256_hex(md_bytes)},
    ]
    bus.emit("graph-model.schema.freeze.result", STAGE, "state",
             {"frozen": True, "version": version, "hash": shash, "artifacts": artifacts},
             cause=hash_ref)

    ctx["freeze"] = {
        "schemaVersion": version,
        "schemaHash": shash,
        "artifacts": artifacts,
        "nodeKinds": json_kinds["node"],
        "edgeKinds": json_kinds["edge"],
        "schema": schema_obj,
        "frozen": True,
    }
