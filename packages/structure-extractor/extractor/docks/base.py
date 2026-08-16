"""The Dock contract (§5.4) — one seam for every language.

T2 is irreducibly per-language: you cannot unify the tool, so you unify the
seam.  Every dock — shipped or design-stub — implements exactly:

    extract(source, handle, nodes, anchors) -> { edges, decisions, ceiling }

The §5.4 invariant the tests enforce: the count of resolved edges equals the
count of resolved decisions, and no resolved edge exists without a matching
resolved decision.  An edge without a decision is a faked relationship.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from ..capability import CapabilityHandle
from ..ingest import SourceSet
from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaEdge, SchemaNode, edge_id, unresolved_placeholder
from ..t1 import Anchor


@dataclass
class CandidateEdge:
    kind: str                 # EdgeKind
    srcId: str                # a resolved Node.id (the use-site's owning decl)
    dstName: str              # a NAME at a use-site — not yet a Node.id
    dstHint: dict | None
    useSiteSpan: dict         # {file, byteStart, byteEnd}
    extractor: str            # "grimp" | "pyright" | "latexml" | "typst-eval" | "lean-infotree" | ...

    def to_dict(self) -> dict:
        return {"kind": self.kind, "srcId": self.srcId, "dstName": self.dstName,
                "dstHint": self.dstHint, "useSiteSpan": self.useSiteSpan,
                "extractor": self.extractor}


@dataclass
class ResolverDecision:
    candidate: CandidateEdge
    outcome: str              # "resolved" | "unresolved" | "rejected"
    boundDstId: str | None    # Node.id | "unresolved:" placeholder | None (rejected)
    reason: str               # ALWAYS a VERBATIM taxonomy string (reasons.py) —
                              # the histogram buckets by it, so no per-candidate text
    resolver: str             # "" when unresolved/rejected
    note: str = ""            # per-candidate detail lives HERE, never in reason

    def to_dict(self) -> dict:
        return {"candidate": self.candidate.to_dict(), "outcome": self.outcome,
                "boundDstId": self.boundDstId, "reason": self.reason,
                "resolver": self.resolver, "note": self.note}


@dataclass
class HonestCeiling:
    lang: str
    resolves: list[str]
    cannotResolve: list[str]
    resolverGrade: str
    blindSpots: list[str]
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = {"lang": self.lang, "resolves": self.resolves,
             "cannotResolve": self.cannotResolve, "resolverGrade": self.resolverGrade,
             "blindSpots": self.blindSpots}
        d.update(self.extra)
        return d


@dataclass
class DockResult:
    edges: list[SchemaEdge]
    decisions: list[ResolverDecision]
    ceiling: HonestCeiling


def decide_resolved(cand: CandidateEdge, dst_id: str, reason: str, resolver: str,
                    note: str = "") -> ResolverDecision:
    return ResolverDecision(cand, "resolved", dst_id, reason, resolver, note)


def decide_unresolved(cand: CandidateEdge, reason: str, note: str = "") -> ResolverDecision:
    # Assembly ruling 6: the placeholder is "unresolved:" + the RAW referenced
    # name (never hashed) — its spelling feeds the edge-id preimage.
    return ResolverDecision(cand, "unresolved",
                            unresolved_placeholder(cand.dstName), reason, "", note)


def decide_rejected(cand: CandidateEdge, reason: str, note: str = "") -> ResolverDecision:
    return ResolverDecision(cand, "rejected", None, reason, "", note)


def edges_from_decisions(decisions: list[ResolverDecision], tier: str = "T2") -> list[SchemaEdge]:
    """provenance-tag + emit stages (§5.3 steps 4/6), shared by every dock.
    resolved -> real edge; unresolved -> lead (resolved=false, placeholder dst);
    rejected -> nothing.  This is the ONLY place dock edges are built, which is
    what makes 'every resolved edge has a matching resolved decision' true by
    construction — and the assemble audit re-checks it anyway (verify, don't trust)."""
    edges: list[SchemaEdge] = []
    for d in decisions:
        if d.outcome == "rejected":
            continue
        eid, _ = edge_id(d.candidate.kind, d.candidate.srcId, d.boundDstId)
        e = SchemaEdge(
            id=eid, kind=d.candidate.kind, srcId=d.candidate.srcId, dstId=d.boundDstId,
            resolved=(d.outcome == "resolved"),
            resolver=d.resolver if d.outcome == "resolved" else "",
            provenance={"tier": tier, "extractor": d.candidate.extractor},
        )
        e.validate()
        edges.append(e)
    return edges


class Dock(ABC):
    lang: str = ""

    @abstractmethod
    def extract(self, source: SourceSet, handle: CapabilityHandle,
                nodes: list[SchemaNode], anchors: list[Anchor],
                bus: ProbeBus, cause: ProbeEvent | None = None) -> DockResult:
        ...


# ---- shared owner/target lookup helpers ------------------------------------

# Wave D E3 (pre-GitHub): per-file sorted span index, built ONCE per nodes
# list, keyed by id(nodes) — turns innermost_owner from O(anchors × nodes)
# into O(anchors × log nodes_in_file + spans_touching_offset).  Cache is a
# process-local map that self-invalidates when the nodes list identity or
# length changes; docks build a fresh SchemaNode list per extract so the
# lifetime aligns with the dock's own call scope.
import bisect as _bisect

_SPAN_INDEX_CACHE: dict[int, dict[str, object]] = {}


def _span_index_for(nodes: list[SchemaNode]) -> dict[str, list[tuple[int, int, SchemaNode]]]:
    key = id(nodes)
    cached = _SPAN_INDEX_CACHE.get(key)
    if cached is not None and cached.get("_len") == len(nodes):
        return cached["_by_file"]        # type: ignore[return-value]
    by_file: dict[str, list[tuple[int, int, SchemaNode]]] = {}
    for n in nodes:
        by_file.setdefault(n.span.file, []).append(
            (n.span.byteStart, n.span.byteEnd, n))
    for entries in by_file.values():
        entries.sort(key=lambda e: (e[0], -(e[1] - e[0])))     # start asc; wider first at same start
    _SPAN_INDEX_CACHE[key] = {"_len": len(nodes), "_by_file": by_file}
    return by_file


def innermost_owner(nodes: list[SchemaNode], file: str, byte_off: int,
                    exclude_kinds: tuple[str, ...] = ("label",)) -> SchemaNode | None:
    """The use-site's owning decl: the innermost node whose span contains the
    offset (labels can't own use-sites; module/file-spanning nodes lose to
    tighter spans).  E3: per-file sorted span index + bisect."""
    entries = _span_index_for(nodes).get(file)
    if not entries:
        return None
    # bisect_right gives first entry with byteStart > byte_off; walk left.
    hi = _bisect.bisect_right(entries, (byte_off, 1 << 62))
    best = None
    best_size = 0
    for i in range(hi - 1, -1, -1):
        bs, be, n = entries[i]
        if be <= byte_off:
            continue                     # ends at/before offset — not covering
        if n.kind in exclude_kinds:
            continue
        size = be - bs
        if best is None or size < best_size:
            best, best_size = n, size
    return best


def node_at(nodes: list[SchemaNode], file: str, byte_off: int) -> SchemaNode | None:
    return innermost_owner(nodes, file, byte_off, exclude_kinds=())
