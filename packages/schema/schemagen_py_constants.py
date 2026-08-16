"""Generator for gen/schema_constants.py — the Python constants projection.

Template + generator moved verbatim from schemagen.py (SUB200 restructure);
schemagen.py remains the facade and the CLI.
"""
import json

try:
    from .schemagen_common import _fill, _py_str_tuple, _schema_facts
except ImportError:  # imported flat (packages/schema on sys.path)
    from schemagen_common import _fill, _py_str_tuple, _schema_facts


# ── gen/schema_constants.py ──────────────────────────────────────────────────

_SCHEMA_CONSTANTS_PY = '''"""GENERATED from schema.json (schemaVersion "@VERSION@", schemaRevision "@REVISION@") by schemagen.py. Do not edit by hand.

Python constants mirroring gen/graph-schema.ts — single-source enum tuples plus
the shared OUTLINE worst-case policy (assembly ruling: an unrecognized worstOf
token must @POLICY@; the fused token @BANNED@ is banned from data).
"""
SCHEMA_VERSION = "@VERSION@"
SCHEMA_REVISION = "@REVISION@"

NODE_KINDS = @NODE_KINDS@
EDGE_KINDS = @EDGE_KINDS@
LANGS = @LANGS@
FILL_STATUSES = @FILLS@
ORIGINS = @ORIGINS@
TIERS = @TIERS@

NODE_ID_PATTERN = @NODE_PATTERN@
EDGE_ID_PATTERN = @EDGE_PATTERN@

OUTLINE_WORST_ORDER = @ORDER@
WORST_TOKEN_TO_STATUS = @WTS@
BANNED_WORST_TOKENS = @BANNED_TUPLE@

UNRESOLVED_PLACEHOLDER_PREFIX = "@PLACEHOLDER_PREFIX@"


def is_unresolved_placeholder(dst_id):
    """Placeholder form: @PLACEHOLDER_FORM@ (the RAW name — never hashed)."""
    return dst_id.startswith(UNRESOLVED_PLACEHOLDER_PREFIX)


def rank_worst_token(token):
    """Single shared policy: an unrecognized worstOf token must @POLICY@.
    Rank -1 = worst (lower = worse) — it can never silently yield a green ring."""
    if token in OUTLINE_WORST_ORDER:
        return {"rank": OUTLINE_WORST_ORDER.index(token), "recognized": True}
    return {"rank": -1, "recognized": False}


def worst_of_verdict(worst_of):
    """Worst-case-wins verdict over a worstOf array; empty worstOf = "none"
    (nothing to distrust).  Mirrors gen/graph-schema.ts worstOfVerdict."""
    unrecognized = [t for t in worst_of if not rank_worst_token(t)["recognized"]]
    if not worst_of:
        return {"worstToken": "none",
                "status": WORST_TOKEN_TO_STATUS["none"],
                "unrecognized": unrecognized}
    worst = worst_of[0]
    for token in worst_of[1:]:
        if rank_worst_token(token)["rank"] < rank_worst_token(worst)["rank"]:
            worst = token
    status = (WORST_TOKEN_TO_STATUS[worst]
              if rank_worst_token(worst)["recognized"] else "unknown")
    return {"worstToken": worst, "status": status, "unrecognized": unrecognized}
'''


def generate_schema_constants_py(schema_obj):
    f = _schema_facts(schema_obj)
    wts = "{" + ", ".join(f"{json.dumps(k)}: {json.dumps(v)}" for k, v in f["wts"].items()) + "}"
    return _fill(_SCHEMA_CONSTANTS_PY, {
        "VERSION": f["version"],
        "REVISION": f["revision"],
        "NODE_KINDS": _py_str_tuple(f["node_kinds"]),
        "EDGE_KINDS": _py_str_tuple(f["edge_kinds"]),
        "LANGS": _py_str_tuple(f["langs"]),
        "FILLS": _py_str_tuple(f["fills"]),
        "ORIGINS": _py_str_tuple(f["origins"]),
        "TIERS": _py_str_tuple(f["tiers"]),
        "NODE_PATTERN": json.dumps(f["node_pattern"]),
        "EDGE_PATTERN": json.dumps(f["edge_pattern"]),
        "ORDER": _py_str_tuple(f["order"]),
        "WTS": wts,
        "BANNED_TUPLE": _py_str_tuple(f["banned"]),
        "PLACEHOLDER_PREFIX": f["placeholder_prefix"],
        "PLACEHOLDER_FORM": f["placeholder_form"],
        "POLICY": f["policy"],
        "BANNED": " / ".join(json.dumps(b) for b in f["banned"]),
    })
