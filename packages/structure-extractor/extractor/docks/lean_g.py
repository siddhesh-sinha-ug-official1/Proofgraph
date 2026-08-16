"""S2 · Lean DOCK — the G-tier placeholder path (behavior byte-stable).

The stub consumes T1 anchors (imports) and syntactic name co-occurrence as
CANDIDATE SEEDS, and — because tier G grants no resolution rights — every
candidate is emitted as a LEAD.  Asserted by the tier-G regression golden.

Split from lean_dock.py (SUB200 restructure); lean_dock.py stays the facade.
"""
from __future__ import annotations

import re

from ..capability import CapabilityHandle
from ..ingest import SourceSet
from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode
from . import reasons as R
from .base import (CandidateEdge, DockResult, HonestCeiling, decide_rejected,
                   decide_unresolved, edges_from_decisions)
from .lean_common import STAGE


def extract_g(dock, source: SourceSet, handle: CapabilityHandle,
              nodes: list[SchemaNode], anchors: list,
              bus: ProbeBus, cause: ProbeEvent | None = None) -> DockResult:
    decisions: list = []
    lean_nodes = [n for n in nodes if n.lang == "lean"]
    modules = {n.name: n for n in lean_nodes if n.kind == "module"}
    decls = [n for n in lean_nodes if n.kind in ("decl", "theorem")]
    files = {f.path: f for f in source.files}

    # D7 — the branch NOT taken, with the reason (spec §5.3 / §6.5):
    dock._emit_lean_facts(bus, cause)

    seen: set[tuple[str, str, str]] = set()

    # imports candidates from T1 anchors
    n_imports = 0
    for a in [x for x in anchors if x.lang == "lean" and x.anchor_kind == "import"]:
        span = {"file": a.file, "byteStart": a.byte_start, "byteEnd": a.byte_end}
        # owner = the importing file's module node
        owner = next((m for m in modules.values() if m.span.file == a.file), None)
        if owner is None:
            # never a silent drop (review C2): probed rejection instead
            cand = CandidateEdge("imports", "<no-owner>", a.target_text, None,
                                 span, "lean-infotree")
            d = decide_rejected(cand, R.X_NO_OWNER, note=f"{a.file}@{a.byte_start}")
            decisions.append(d)
            bus.emit("extractor.t2.lean.const.resolve.decision", STAGE, "decision",
                     d.to_dict(), cause=cause)
            continue
        cand = CandidateEdge("imports", owner.id, a.target_text,
                             {"designedResolver": "lake exe graph (import-graph)"},
                             span, "lean-infotree")
        ev = bus.emit("extractor.t2.lean.import.edge", STAGE, "edge", {
            "srcModule": owner.name, "dstModule": a.target_text,
            "resolved": False}, cause=cause)
        key = ("imports", owner.id, a.target_text)
        if key in seen:
            d = decide_rejected(cand, R.X_DUP)
        else:
            seen.add(key)
            d = decide_unresolved(cand, R.U_TIER_G)
            n_imports += 1
        decisions.append(d)
        bus.emit("extractor.t2.lean.const.resolve.decision", STAGE, "decision",
                 d.to_dict(), cause=ev)

    # proof_uses candidate SEEDS: syntactic name co-occurrence inside decl spans.
    # This is NOT resolution evidence — every seed stays a lead, and says so.
    n_uses, n_rej = 0, 0
    names = {n.name.rsplit(".", 1)[-1]: n for n in decls}
    for src in sorted(decls, key=lambda n: (n.span.file, n.span.byteStart)):
        f = files.get(src.span.file)
        if f is None:
            continue
        body = f.data[src.span.byteStart:src.span.byteEnd].decode("utf8", "replace")
        for word in sorted(set(re.findall(r"[A-Za-z_][A-Za-z0-9_']*", body))):
            dst = names.get(word)
            if dst is None:
                continue
            span = {"file": src.span.file, "byteStart": src.span.byteStart,
                    "byteEnd": src.span.byteEnd}
            cand = CandidateEdge("proof_uses", src.id, dst.name,
                                 {"seed": "syntactic name co-occurrence",
                                  "designedResolver": "InfoTree resolved constant (kernel)"},
                                 span, "lean-infotree")
            ev = bus.emit("extractor.t2.lean.const.candidate", STAGE, "edge", {
                "srcDeclId": src.id, "usedConstant": dst.name}, cause=cause)
            if dst.id == src.id:
                d = decide_rejected(cand, R.X_SELF, note="self-reference")
                n_rej += 1
            else:
                key = ("proof_uses", src.id, dst.name)
                if key in seen:
                    d = decide_rejected(cand, R.X_DUP)
                    n_rej += 1
                else:
                    seen.add(key)
                    d = decide_unresolved(cand, R.U_STUB)
                    n_uses += 1
            decisions.append(d)
            bus.emit("extractor.t2.lean.const.resolve.decision", STAGE, "decision",
                     d.to_dict(), cause=ev)
            if d.outcome == "rejected":
                bus.emit("extractor.t2.lean.edge.rejected", STAGE, "edge",
                         {"candidate": cand.to_dict(), "reason": d.reason}, cause=ev)

    bus.emit("extractor.t2.lean.candidate.count", STAGE, "value", {
        "proofUses": n_uses, "imports": n_imports, "inherits": 0,
        "rejected": n_rej}, cause=cause)

    edges = edges_from_decisions(decisions)
    ceiling = HonestCeiling(
        lang="lean",
        resolves=["proof_uses (InfoTree resolved constants)",
                  "imports (lake exe graph)",
                  "axiom reachability (#print axioms)",
                  "inherits (structure parents)"],
        cannotResolve=["axioms nested in another axiom's type (#8840)"],
        resolverGrade="compiler/kernel (deepest)",
        blindSpots=["chases Lean's changing internal API — research-grade",
                    "no standard serialization; you emit JSON"],
        extra={"reusePatterns": ["lean-training-data", "LeanDojo-v2"],
               "status": "design-stub (backend not wired; tier G — all candidates are leads)",
               "tier": handle.tier})
    bus.emit("extractor.t2.lean.honest_ceiling", STAGE, "state", ceiling.to_dict(), cause=cause)
    return DockResult(edges=edges, decisions=decisions, ceiling=ceiling)
