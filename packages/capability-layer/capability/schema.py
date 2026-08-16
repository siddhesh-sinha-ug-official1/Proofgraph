"""Shared Frozen-Schema v0 constants — VERIFIED-IN-SYNC with the canonical package.

ASSEMBLY SEAM (Phase 0 swap, pattern (b)): the single source of truth is
packages/schema (gen/capability_constants.py + gen/schema_constants.py, PIN
schemaVersion v0 / schemaHash 3f312369…).  This cell keeps these constants local
so it stays independently runnable, and tests/test_13_schema_sync.py asserts
extracted-constant equality with the canonical files plus a check_pin gate —
any drift on either side fails THIS cell's suite loudly.  Do not edit these
values without regenerating the canonical package first.

Assembly ruling 2 (canon, seam won by this cell): S-tier may NOT emit resolved
edges — DEPTH_ALLOWS_RESOLVED_EDGES is {CT:True, S:False, G:False, P:False}.

Two ORTHOGONAL "tier" vocabularies (keep them distinct — build prompt §4):
  * depth tier  (this cell's answer): CT | S | G | P  — how deep the TOOLING sees.
  * provenance tier (schema):         T1 | T2 | T3     — what KIND of graph element.

The enforcement point owned by this cell: fill.status = "green" is reachable ONLY
when the language's handle is tier CT AND probe P2 passed. unknown ≠ green.
"""

from __future__ import annotations

from pathlib import Path

DEPTH_TIERS = ("CT", "S", "G", "P")
PROVENANCE_TIERS = ("T1", "T2", "T3")

# What kind of schema elements a depth tier may feed:
#   CT: T1 nodes + T2 resolved edges (green permitted iff P2 passed)
#   S : T1 nodes; T2 edges are LEADS (resolved usually false); never green
#   G : T1 structure only; every edge resolved=false; fill at best "unknown"
#   P : text + cross-reference graph; everything unresolved/unknown
DEPTH_TO_MAX_PROVENANCE = {"CT": "T2", "S": "T2", "G": "T1", "P": "T1"}
DEPTH_ALLOWS_RESOLVED_EDGES = {"CT": True, "S": False, "G": False, "P": False}

HONEST_CEILINGS = {
    "CT": "as deep as the compiler's type-checker sees (compiler-truth; green permitted "
          "from real verdicts only)",
    "S": "structure only: real navigation, no type truth; green forbidden; edges are "
         "leads unless a gradual checker binds them",
    "G": "grammar floor: T1 structure only ('this span IS a def/loop'); every edge "
         "resolved=false; fill at best unknown; green forbidden",
    "P": "plaintext + links: text and a cross-reference graph; everything unresolved; "
         "green forbidden",
}


class HonestCeilingViolation(Exception):
    """Raised when a code path attempts to over-claim depth (e.g. CT without a P2 pass).

    'Green may never be faked' is enforced at the source: this exception existing —
    and being raised — is what makes the forbidden path unreachable.
    """


def green_allowed(tier: str, p2_verdict: str) -> bool:
    """The single rule: green ⇐ tier==CT ∧ P2 passed. Everything else: never."""
    return tier == "CT" and p2_verdict == "pass"


# D-dedup U7 (round-2026-08-16): read OUTLINE_WORST_ORDER from the canonical
# gen/schema_constants.py via file-read+exec — the same data-only pattern
# gate 13 uses (test_13_schema_sync._exec_canonical), so the import-boundary
# gate's ALLOWED lists stay unchanged and this cell can no longer STRUCTURALLY
# drift from the frozen 7-token order.  The absence of a hand-typed 4th copy
# is now the invariant; gate 13 keeps a value-equality assertion on top so a
# canonical mismatch still fails loudly instead of silently propagating.
_SCHEMA_PKG = Path(__file__).resolve().parents[2] / "schema"
_WORST_ORDER_CACHE: tuple | None = None


def _load_canonical_worst_order() -> tuple:
    """Exec packages/schema/gen/schema_constants.py in a fresh namespace and
    return its OUTLINE_WORST_ORDER as an immutable tuple."""
    path = _SCHEMA_PKG / "gen" / "schema_constants.py"
    ns: dict = {"__name__": "canonical_schema_constants", "__file__": str(path)}
    exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), ns)
    return tuple(ns["OUTLINE_WORST_ORDER"])


def worst_case_order() -> tuple:
    """OUTLINE worst-case-wins order (informational here; computed by the gap tree).

    Assembly ruling 4: canonical SPLIT 7-token order, index 0 worst; the fused
    "none/green" token is banned from data.  Reads OUTLINE_WORST_ORDER from
    packages/schema/gen/schema_constants.py via file-exec (D-dedup U7); the
    value is cached after the first successful load.  Gate 13
    (test_13_schema_sync) still value-equality-asserts the return against the
    canonical, and asserts the split 7-token red-first shape, so a canonical
    schema drift keeps failing this cell's suite loudly.
    """
    global _WORST_ORDER_CACHE
    if _WORST_ORDER_CACHE is None:
        _WORST_ORDER_CACHE = _load_canonical_worst_order()
    return _WORST_ORDER_CACHE
