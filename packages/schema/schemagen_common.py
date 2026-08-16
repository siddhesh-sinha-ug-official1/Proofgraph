"""Shared interpolation helpers for the schemagen_* generator modules.

schema.json is the ONE source of truth; every generator module (schemagen_ts_*,
schemagen_py_constants, schemagen_capability, schemagen_md) turns the parsed
JSON into one derived artifact.  _schema_facts below is the single place that
pulls every templated value out of the parsed schema — never hand-maintained in
parallel (the fused-vs-split token drift happened exactly because the worst
order lived only in prose).
"""
import json


def _fill(template, mapping):
    out = template
    for key, value in mapping.items():
        out = out.replace(f"@{key}@", value)
    return out


def _ts_str_array(values):
    return "[" + ", ".join(json.dumps(v, ensure_ascii=False) for v in values) + "]"


def _py_str_tuple(values):
    inner = ", ".join(json.dumps(v, ensure_ascii=False) for v in values)
    if len(values) == 1:
        inner += ","
    return "(" + inner + ")"


def _py_value(value):
    if isinstance(value, bool):
        return "True" if value else "False"
    return json.dumps(value, ensure_ascii=False)


def _schema_facts(schema_obj):
    """Everything the templates interpolate, pulled from the parsed schema."""
    defs = schema_obj["$defs"]
    node_props = defs["Node"]["properties"]
    ids = schema_obj["idScheme"]
    return {
        "version": schema_obj["schemaVersion"],
        "revision": schema_obj["schemaRevision"],
        "node_kinds": node_props["kind"]["enum"],
        "edge_kinds": defs["Edge"]["properties"]["kind"]["enum"],
        "langs": node_props["lang"]["enum"],
        "fills": node_props["fill"]["properties"]["status"]["enum"],
        "origins": node_props["origin"]["enum"],
        "tiers": node_props["provenance"]["properties"]["tier"]["enum"],
        "node_pattern": node_props["id"]["pattern"],
        "edge_pattern": defs["Edge"]["properties"]["id"]["pattern"],
        "resolved_desc": node_props["provenance"]["properties"]["resolved"]["description"],
        "order": schema_obj["outlineWorstOrder"],
        "wts": schema_obj["worstTokenToStatus"],
        "policy": schema_obj["outlinePolicy"]["unrecognizedToken"],
        "banned": schema_obj["outlinePolicy"]["bannedTokens"],
        "placeholder_prefix": schema_obj["unresolvedPlaceholder"]["prefix"],
        "placeholder_form": schema_obj["unresolvedPlaceholder"]["form"],
        "hash_length": ids["hashLength"],
        "delimiter": ids["delimiter"],
        "node_id_prefix": ids["node"]["prefix"],
        "edge_id_prefix": ids["edge"]["prefix"],
        "node_tag": ids["node"]["domainTag"],
        "edge_tag": ids["edge"]["domainTag"],
        "node_fields": ids["node"]["preimageFields"],
        "edge_fields": ids["edge"]["preimageFields"],
        "normalized_span": ids["normalizedSpan"],
    }
