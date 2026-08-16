"""Frozen Schema v0 — VERIFIED-IN-SYNC with the canonical package.

The single source of truth for the assembly is packages/schema (schema.json +
ids.py + gen/*).  This cell stays independently runnable, so it carries a local
mirror of the constants and the canonical mint — and the membrane test
(selftest/test_schema_sync.py) asserts value-equality with packages/schema and
checks the schema PIN, so any drift explodes loudly instead of forking the
schema.  Swap pattern (b) of the assembly rules: verified-in-sync.

Hard invariants enforced at this layer:
  * fill.status = "green" ONLY from a real compiler/kernel verdict.  Since the
    LEAN-DOCK round the lean dock CAN mint green — but only origin="checked"
    with a fill.source carrying a registered checker attestation prefix
    (GREEN_ATTESTED_PREFIXES).  Any other green is the failure class
    unbacked-green (unknown != green, and unattested == unbacked).
  * outline is computed LAST (gap analysis) — this cell always emits None.
  * resolved=false is a LEAD, not an edge; its dstId is an explicit
    "unresolved:" placeholder that can never collide with a real Node.id, and
    SchemaEdge.validate REQUIRES the placeholder form (assembly ruling 6).
  * Every node and edge carries provenance — no anonymous data in the graph.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ---- enum constants (mirrors packages/schema/gen/schema_constants.py) ------
SCHEMA_VERSION = "v0"

NODE_KINDS = ("module", "function", "class", "theorem", "section", "label", "figure", "decl")
EDGE_KINDS = ("calls", "imports", "includes", "inherits", "references", "cites", "proof_uses")
LANGS = ("python", "go", "c", "cpp", "lean", "latex", "typst")
TIERS = ("T1", "T2", "T3")
FILL_STATUSES = ("green", "amber", "red", "blue", "unknown")
ORIGINS = ("given", "assumed", "checked")

# Worst-case-wins order for OUTLINE (computed by the LAST gap-analysis round,
# not by this cell — mirrored here so the constitution is complete).
# Assembly ruling 4: the tokens are SPLIT — "none" and "green" are separate
# entries; the fused spelling "none/green" is BANNED from data.
OUTLINE_WORST_ORDER = ("red", "amber", "blue", "definition", "lemma", "none", "green")
WORST_TOKEN_TO_STATUS = {"red": "red", "amber": "amber", "blue": "blue",
                         "definition": "blue", "lemma": "green", "none": "green",
                         "green": "green"}
BANNED_WORST_TOKENS = ("none/green",)

# The pinned schema identity this cell was built against (packages/schema/PIN).
# The membrane test recomputes the canonical schema.json hash and runs
# check_pin against this pair — schema drift fails the suite, fast.
PINNED_SCHEMA_VERSION = "v0"
PINNED_SCHEMA_HASH = "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c"


class SchemaViolation(ValueError):
    pass


# ---- content-addressed IDs: the CANONICAL MINT (assembly ruling 5) ---------
# Lives in schema_ids.py since the SUB200 restructure; re-exported here so
# `extractor.schema` stays the single import surface for the mint (facade).
from .schema_ids import (ID_TRUNCATE, EDGE_DOMAIN_TAG,  # noqa: F401,E402
                         NODE_DOMAIN_TAG, US, US_ESCAPED,
                         canonical_name_for, compute_node_identity,
                         edge_id, edge_preimage, node_id, node_preimage,
                         sha256_hex, structural_path_for)


# The ONLY fill.source prefixes that may back a green fill (LEAN-DOCK round).
# A green whose source does not carry a registered checker attestation is the
# failure class unbacked-green — this list grows one real checker at a time,
# never speculatively ("green only from a real checker").
GREEN_ATTESTED_PREFIXES: tuple[str, ...] = ("lean-kernel:",)


def green_fill_attested(fill: dict, origin: str) -> bool:
    """The cell's own green-attestation predicate (also what graph-model's
    wall greenGuard requires downstream: origin=='checked' + a non-empty,
    non-default fill.source)."""
    src = fill.get("source", "")
    return (origin == "checked" and isinstance(src, str)
            and src.startswith(GREEN_ATTESTED_PREFIXES))


UNRESOLVED_PREFIX = "unresolved:"


def unresolved_placeholder(raw_ref_name: str) -> str:
    """Stable, queryable, collision-free placeholder for a lead's target.
    Assembly ruling 6: "unresolved:" + rawRefName — the RAW referenced name,
    never hashed (the placeholder feeds the edge-id preimage, so its spelling
    is identity-bearing).  A lead's placeholder is never a real node."""
    return UNRESOLVED_PREFIX + raw_ref_name


@dataclass
class Span:
    file: str
    byteStart: int
    byteEnd: int

    def to_dict(self) -> dict:
        return {"file": self.file, "byteStart": self.byteStart, "byteEnd": self.byteEnd}


@dataclass
class SchemaNode:
    id: str
    kind: str
    lang: str
    name: str
    signature: str | None
    span: Span
    # fill is the node's OWN compiler verdict.  Default: unknown.  Since the
    # LEAN-DOCK round the lean dock's CT path DOES write kernel verdicts here
    # (green only attested, guarded below); every other language stays
    # unknown. unknown != green, always.
    fill: dict = field(default_factory=lambda: {
        "status": "unknown",
        "source": "tree3: fill not computed (owned by capability-handle diagnostics)",
    })
    # outline is the transitive trust base — computed LAST (gap analysis). Always None here.
    outline: None = None
    # origin: unverified structure is debt until a verdict arrives.
    origin: str = "assumed"
    provenance: dict = field(default_factory=dict)

    def validate(self) -> None:
        if self.kind not in NODE_KINDS:
            raise SchemaViolation(f"node kind {self.kind!r} not in Frozen Schema")
        if self.lang not in LANGS:
            raise SchemaViolation(f"node lang {self.lang!r} not in Frozen Schema")
        if self.fill["status"] not in FILL_STATUSES:
            raise SchemaViolation(f"fill status {self.fill['status']!r} invalid")
        if self.fill["status"] == "green" and not green_fill_attested(self.fill, self.origin):
            # LEAN-DOCK round: green is now MINTABLE, but only kernel-backed —
            # origin "checked" + a registered checker attestation in source.
            raise SchemaViolation(
                f"unbacked-green: node {self.id} carries a green fill without a "
                f"kernel attestation (origin={self.origin!r}, "
                f"source={self.fill.get('source')!r}) — green may never be faked")
        if self.origin not in ORIGINS:
            raise SchemaViolation(f"origin {self.origin!r} invalid")
        if not self.provenance or "tier" not in self.provenance or "extractor" not in self.provenance:
            raise SchemaViolation(f"anonymous node {self.id}: provenance is mandatory")
        if self.provenance["tier"] not in TIERS:
            raise SchemaViolation(f"provenance tier {self.provenance['tier']!r} invalid")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "kind": self.kind, "lang": self.lang, "name": self.name,
            "signature": self.signature, "span": self.span.to_dict(), "fill": self.fill,
            "outline": self.outline, "origin": self.origin, "provenance": self.provenance,
        }


@dataclass
class SchemaEdge:
    id: str
    kind: str
    srcId: str
    dstId: str          # a Node.id, or an explicit "unresolved:" placeholder
    resolved: bool      # TRUE only if a resolver actually bound dst
    resolver: str       # "" if unresolved
    provenance: dict = field(default_factory=dict)

    def validate(self) -> None:
        if self.kind not in EDGE_KINDS:
            raise SchemaViolation(f"edge kind {self.kind!r} not in Frozen Schema")
        if self.resolved and self.dstId.startswith(UNRESOLVED_PREFIX):
            raise SchemaViolation(f"edge {self.id}: resolved=true but dst is a placeholder (faked edge)")
        if not self.resolved and not self.dstId.startswith(UNRESOLVED_PREFIX):
            # Assembly ruling 6 closes this cell's own triage gap: an
            # unresolved dst MUST be the explicit placeholder form — a bare
            # name (or worse, a real-looking Node.id) on a lead is a
            # mislabeled relationship.
            raise SchemaViolation(
                f"edge {self.id}: resolved=false requires an explicit "
                f"{UNRESOLVED_PREFIX!r} placeholder dstId (got {self.dstId!r})")
        if self.resolved and not self.resolver:
            raise SchemaViolation(f"edge {self.id}: resolved=true requires a named resolver")
        if not self.resolved and self.resolver:
            raise SchemaViolation(f"edge {self.id}: resolved=false must carry resolver=\"\"")
        if not self.provenance or "tier" not in self.provenance or "extractor" not in self.provenance:
            raise SchemaViolation(f"anonymous edge {self.id}: provenance is mandatory")
        if self.provenance["tier"] not in TIERS:
            raise SchemaViolation(f"provenance tier {self.provenance['tier']!r} invalid")

    def to_dict(self) -> dict:
        return {
            "id": self.id, "kind": self.kind, "srcId": self.srcId, "dstId": self.dstId,
            "resolved": self.resolved, "resolver": self.resolver, "provenance": self.provenance,
        }
