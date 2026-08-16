"""S2 · Typst DOCK — DESIGN/STUB this round.

Deeper than LaTeX at T2 when live (real compiler), but single-language: no SCIP
indexer, no persisted graph export.  All backends Apache-2.0.

DESIGNED PIPELINE (§5.3 seven stages — exact backends, wired in a later round):
  1. acquire  — typst-ide (the official reusable analysis engine tinymist
     wraps): `definition` (goto-def/name resolution), `analyze_labels`,
     `analyze_import`; or tinymist (v0.15.x, replaced the deprecated
     typst-lsp) for the served equivalent; plus `typst eval` on the COMPILED
     document: select `ref` elements -> each ref's `target` -> reconstruct
     @ref→<label> edges from the flat JSON/YAML list.
     ⚠ D4 (VERIFIED 2026): the `typst query` SUBCOMMAND was DEPRECATED in
     Typst 0.15.0 (15 Jun 2026, PR #7362) in favor of `typst eval`; the
     in-document query() FUNCTION is NOT deprecated.  Never `typst query`.
     ⚠ Never build on typst-lsp — deprecated/archived Nov 2024; use tinymist.
  2. candidate — every Ref (carries its target label text) -> references;
     every ModuleImport (carries the path) -> imports.
  3. resolve  — bind @ref -> the <label> element's Node.id (grade:
     name-resolution).  ⚠ cross-file labels need a pinned main
     (tinymist.pinMain).  A dangling @ref is a HARD COMPILE ERROR — free
     dangling-edge detection (surfaces as unresolved + the compiler's error).
  4. provenance-tag — {tier:"T2", extractor:"typst-ide"|"typst-eval"}.
  5. reject   — dedup; refs into non-ingested modules.
  6. emit     — resolved references/imports; leads for dangling refs.
  7. honest-ceiling — grade "name-resolution"; blind spots: NO unused-label
     detection, NO cross-file reference-graph export (Typst T3 is a BUILD on
     typst-ide/`typst eval`).

THIS ROUND: typst-ide/`typst eval` are not wired; Tree 2 reports tier G.
Candidates come from T1 anchors (ref / import) and every candidate is a LEAD.
"""
from __future__ import annotations

from ..capability import CapabilityHandle
from ..ingest import SourceSet
from ..probe import ProbeBus, ProbeEvent
from ..schema import SchemaNode
from ..t1 import Anchor
from . import reasons as R
from .base import (CandidateEdge, Dock, DockResult, HonestCeiling,
                   decide_rejected, decide_unresolved, edges_from_decisions,
                   innermost_owner)

STAGE = "S2.dock.typst"


class TypstDock(Dock):
    lang = "typst"

    def extract(self, source: SourceSet, handle: CapabilityHandle,
                nodes: list[SchemaNode], anchors: list[Anchor],
                bus: ProbeBus, cause: ProbeEvent | None = None) -> DockResult:
        decisions: list = []
        ty_nodes = [n for n in nodes if n.lang == "typst"]
        labels = {n.name: n for n in ty_nodes if n.kind == "label"}
        ty_anchors = [a for a in anchors if a.lang == "typst"]

        # D4 — logged so nobody re-adds `typst query`:
        bus.emit("extractor.t2.typst.query.deprecated", STAGE, "decision", {
            "reason": ("typst query subcommand DEPRECATED in Typst 0.15.0 (15 Jun 2026, "
                       "PR #7362) → use 'typst eval'; the in-document query() function "
                       "is NOT deprecated")}, cause=cause)
        bus.emit("extractor.t2.typst.pinmain.warning", STAGE, "state", {
            "reason": ("cross-file label resolution needs a pinned main entry "
                       "(tinymist.pinMain)")}, cause=cause)
        bus.emit("extractor.t2.typst.syntax.parse", STAGE, "value", {
            "syntaxKinds": sorted({a.anchor_kind for a in ty_anchors} |
                                  {n.kind for n in ty_nodes})}, cause=cause)

        seen: set[tuple[str, str, str]] = set()
        for a in ty_anchors:
            if a.anchor_kind not in ("ref", "import"):
                continue
            span = {"file": a.file, "byteStart": a.byte_start, "byteEnd": a.byte_end}
            owner = innermost_owner(ty_nodes, a.file, a.byte_start)
            if owner is None:
                # a @ref/#import before the first heading has no owning node —
                # never a silent drop (review C2): probed rejection
                kind = "references" if a.anchor_kind == "ref" else "imports"
                cand = CandidateEdge(kind, "<no-owner>", a.target_text, None, span, "typst-eval")
                d = decide_rejected(cand, R.X_NO_OWNER, note=f"{a.file}@{a.byte_start}")
                decisions.append(d)
                bus.emit("extractor.t2.typst.ref.resolve.decision", STAGE, "decision",
                         d.to_dict(), cause=cause)
                continue
            if a.anchor_kind == "ref":
                kind = "references"
                hint = {"designedResolver": "typst-ide label resolution",
                        "syntacticLabelFound": a.target_text in labels}
                ev = bus.emit("extractor.t2.typst.ref.candidate", STAGE, "edge",
                              {"refSpan": span, "targetLabel": a.target_text}, cause=cause)
            else:
                kind = "imports"
                hint = {"designedResolver": "typst-ide analyze_import"}
                ev = bus.emit("extractor.t2.typst.import.edge", STAGE, "edge",
                              {"srcModule": a.file, "dstModule": a.target_text}, cause=cause)
            cand = CandidateEdge(kind, owner.id, a.target_text, hint, span, "typst-eval")
            key = (kind, owner.id, a.target_text)
            if key in seen:
                d = decide_rejected(cand, R.X_DUP)
                bus.emit("extractor.t2.typst.edge.rejected", STAGE, "edge",
                         {"candidate": cand.to_dict(), "reason": d.reason}, cause=ev)
            else:
                seen.add(key)
                d = decide_unresolved(cand, R.U_STUB)
            decisions.append(d)
            bus.emit("extractor.t2.typst.ref.resolve.decision", STAGE, "decision",
                     d.to_dict(), cause=ev)

        edges = edges_from_decisions(decisions)
        ceiling = HonestCeiling(
            lang="typst",
            resolves=["references (@ref→<label>)", "imports (ModuleImport)"],
            cannotResolve=["unused-label detection (NOT shipped)",
                           "cross-file reference-graph export (NOT shipped)"],
            resolverGrade="name-resolution (typst-ide/tinymist)",
            blindSpots=["Typst T3 is genuinely thin — 'unused/undefined labels across a "
                        "multi-file project' is a BUILD on top of typst-ide/typst eval",
                        "never build on typst-lsp (deprecated/archived Nov 2024) — use tinymist"],
            extra={"status": "design-stub (typst-ide/typst eval not wired; tier G — all "
                             "candidates are leads)",
                   "tier": handle.tier})
        bus.emit("extractor.t2.typst.honest_ceiling", STAGE, "state", ceiling.to_dict(), cause=cause)
        return DockResult(edges=edges, decisions=decisions, ceiling=ceiling)
