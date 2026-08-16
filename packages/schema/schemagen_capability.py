"""Generators for gen/capability_constants.{py,ts} — capability.json projections.

Templates + generators moved verbatim from schemagen.py (SUB200 restructure);
schemagen.py remains the facade and the CLI.
"""
import json

try:
    from .schemagen_common import _fill, _py_str_tuple, _py_value, _ts_str_array
except ImportError:  # imported flat (packages/schema on sys.path)
    from schemagen_common import _fill, _py_str_tuple, _py_value, _ts_str_array


# ── gen/capability_constants.{py,ts} ─────────────────────────────────────────

_CAPABILITY_PY = '''"""GENERATED from capability.json by schemagen.py. Do not edit by hand.

Depth tiers (CT|S|G|P — how deep the TOOLING sees) are ORTHOGONAL to
provenance tiers (T1|T2|T3 — what KIND of graph element).  Assembly ruling:
S-tier may NOT emit resolved edges (the seam owner's table wins).
"""
CAPABILITY_VERSION = "@CAP_VERSION@"

DEPTH_TIERS = @DEPTH_TIERS@
DEPTH_ALLOWS_RESOLVED_EDGES = @ALLOWS@
DEPTH_TO_MAX_PROVENANCE = @MAX_PROV@

HONEST_CEILINGS = {
@CEILING_LINES@
}
'''

_CAPABILITY_TS = '''// GENERATED from capability.json by schemagen.py. Do not edit by hand.
// Depth tiers (CT|S|G|P — how deep the TOOLING sees) are ORTHOGONAL to
// provenance tiers (T1|T2|T3 — what KIND of graph element).  Assembly ruling:
// S-tier may NOT emit resolved edges (the seam owner's table wins).
export const CAPABILITY_VERSION = "@CAP_VERSION@" as const;

export const DEPTH_TIERS = @DEPTH_TIERS@ as const;
export type DepthTier = (typeof DEPTH_TIERS)[number];

export const DEPTH_ALLOWS_RESOLVED_EDGES: Record<DepthTier, boolean> = @ALLOWS@;
export const DEPTH_TO_MAX_PROVENANCE: Record<DepthTier, string> = @MAX_PROV@;

export const HONEST_CEILINGS: Record<DepthTier, string> = {
@CEILING_LINES@
};
'''


def generate_capability_constants_py(capability_obj):
    allows = "{" + ", ".join(
        f"{json.dumps(k)}: {_py_value(v)}"
        for k, v in capability_obj["depthAllowsResolvedEdges"].items()) + "}"
    max_prov = "{" + ", ".join(
        f"{json.dumps(k)}: {json.dumps(v)}"
        for k, v in capability_obj["depthToMaxProvenance"].items()) + "}"
    ceilings = "\n".join(
        f"    {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},"
        for k, v in capability_obj["honestCeilings"].items())
    return _fill(_CAPABILITY_PY, {
        "CAP_VERSION": capability_obj["capabilityVersion"],
        "DEPTH_TIERS": _py_str_tuple(capability_obj["depthTiers"]),
        "ALLOWS": allows,
        "MAX_PROV": max_prov,
        "CEILING_LINES": ceilings,
    })


def generate_capability_constants_ts(capability_obj):
    allows = "{ " + ", ".join(
        f"{k}: {json.dumps(v)}"
        for k, v in capability_obj["depthAllowsResolvedEdges"].items()) + " }"
    max_prov = "{ " + ", ".join(
        f"{k}: {json.dumps(v)}"
        for k, v in capability_obj["depthToMaxProvenance"].items()) + " }"
    ceilings = "\n".join(
        f"  {k}: {json.dumps(v, ensure_ascii=False)},"
        for k, v in capability_obj["honestCeilings"].items())
    return _fill(_CAPABILITY_TS, {
        "CAP_VERSION": capability_obj["capabilityVersion"],
        "DEPTH_TIERS": _ts_str_array(capability_obj["depthTiers"]),
        "ALLOWS": allows,
        "MAX_PROV": max_prov,
        "CEILING_LINES": ceilings,
    })
