"""GENERATED from schema.json (schemaVersion "v0", schemaRevision "v0.1") by schemagen.py. Do not edit by hand.

Python constants mirroring gen/graph-schema.ts — single-source enum tuples plus
the shared OUTLINE worst-case policy (assembly ruling: an unrecognized worstOf
token must rank WORST and report the offending token; the fused token "none/green" is banned from data).
"""
SCHEMA_VERSION = "v0"
SCHEMA_REVISION = "v0.1"

NODE_KINDS = ("module", "function", "class", "theorem", "section", "label", "figure", "decl")
EDGE_KINDS = ("calls", "imports", "includes", "inherits", "references", "cites", "proof_uses")
LANGS = ("python", "go", "c", "cpp", "lean", "latex", "typst")
FILL_STATUSES = ("green", "amber", "red", "blue", "unknown")
ORIGINS = ("given", "assumed", "checked")
TIERS = ("T1", "T2", "T3")

NODE_ID_PATTERN = "^n_[0-9a-f]{16}$"
EDGE_ID_PATTERN = "^e_[0-9a-f]{16}$"

OUTLINE_WORST_ORDER = ("red", "amber", "blue", "definition", "lemma", "none", "green")
WORST_TOKEN_TO_STATUS = {"red": "red", "amber": "amber", "blue": "blue", "definition": "blue", "lemma": "green", "none": "green", "green": "green"}
BANNED_WORST_TOKENS = ("none/green",)

UNRESOLVED_PLACEHOLDER_PREFIX = "unresolved:"


def is_unresolved_placeholder(dst_id):
    """Placeholder form: prefix + rawRefName (the RAW name — never hashed)."""
    return dst_id.startswith(UNRESOLVED_PLACEHOLDER_PREFIX)


def rank_worst_token(token):
    """Single shared policy: an unrecognized worstOf token must rank WORST and report the offending token.
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
