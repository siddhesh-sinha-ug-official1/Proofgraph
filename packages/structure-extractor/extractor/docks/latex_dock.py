"""S2 · LaTeX DOCK — DESIGN/STUB this round.

LaTeX is Turing-complete → every tool is best-effort.  Two real resolvers:

DESIGNED PIPELINE (§5.3 seven stages — exact backends, wired in a later round):
  1. acquire  — DEFAULT: LaTeXML (`latexml --dest=out.xml main.tex`;
     CC0/public-domain, NIST — the most permissive tool in the whole dossier).
     Emulates TeX in Perl: macro expansion, counters, TWO-PASS label/ref/cite
     resolution across files → XML with explicit xml:id + resolved idref
     attributes (XPath: //*[@xml:id] = nodes, //*[@idref] = resolved reference
     edges).  Powers arXiv's HTML pipeline.  ⚠ tags infrequent (0.8.8, Feb
     2024) but actively developed; Perl.
     ALTERNATIVE: texlab over LSP — ⚠ GPL-3.0, SUBPROCESS ONLY, never linked;
     resolves \\ref→\\label, \\cite→BibTeX, follows \\input/\\include; since
     v5.8.0 reports unused/undefined/duplicate labels and unused BibTeX
     entries; ⚠ no persisted graph export (drive via Tree 2's handle).
  2. candidate — XPath the XML: every idref -> references; \\cite/bib key ->
     cites; \\input/\\include -> includes.
  3. resolve  — bind idref -> the xml:id element's Node.id (LaTeXML already
     resolved it — grade: compiler/TeX-emulation).  Unresolved = LaTeXML's
     undefined-ref list.
  4. provenance-tag — {tier:"T2", extractor:"latexml"|"texlab"}.
  5. reject   — auto-generated ids not promoted to nodes; duplicate \\label
     (texlab flags these); refs into non-ingested files.
  6. emit     — resolved references/cites/includes; leads for undefined refs.
  7. honest-ceiling — grade "compiler (TeX-emulation)" (LaTeXML) or
     "name-resolution" (texlab); blind spot: macro-generated refs best-effort.
  Cross-check (compiler-as-oracle): the real LaTeX run's .aux numbers vs
  LaTeXML resolution (extractor.t2.latex.aux.oracle) — the numbers must agree.

THIS ROUND: LaTeXML is not wired; Tree 2 reports tier G.  Candidates come from
the T1 anchors the grammar already types distinctly (label_reference, citation,
latex_include) and every candidate is emitted as a LEAD.
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

STAGE = "S2.dock.latex"


class LatexDock(Dock):
    lang = "latex"

    def extract(self, source: SourceSet, handle: CapabilityHandle,
                nodes: list[SchemaNode], anchors: list[Anchor],
                bus: ProbeBus, cause: ProbeEvent | None = None) -> DockResult:
        decisions: list = []
        tex_nodes = [n for n in nodes if n.lang == "latex"]
        labels = {n.name: n for n in tex_nodes if n.kind == "label"}

        # D3 — backend selection, recorded with the reason:
        bus.emit("extractor.t2.latex.backend.select", STAGE, "decision", {
            "chosen": "LaTeXML",
            "reason": ("public-domain (CC0), deepest (TeX emulation, two-pass cross-file "
                       "resolution), real graph out via xml:id/idref; texlab is GPL-3.0 "
                       "subprocess-only with no persisted export (D3)")}, cause=cause)

        seen: set[tuple[str, str, str]] = set()
        kind_by_anchor = {"labelref": ("references", "extractor.t2.latex.ref.candidate"),
                          "cite": ("cites", "extractor.t2.latex.cite.candidate"),
                          "include": ("includes", "extractor.t2.latex.include.candidate")}

        for a in [x for x in anchors if x.lang == "latex" and x.anchor_kind in kind_by_anchor]:
            kind, cand_probe = kind_by_anchor[a.anchor_kind]
            span = {"file": a.file, "byteStart": a.byte_start, "byteEnd": a.byte_end}
            owner = innermost_owner(tex_nodes, a.file, a.byte_start)
            if owner is None:
                # a \ref/\cite in the preamble (before any section) has no owning
                # node — never a silent drop (review C2): probed rejection
                cand = CandidateEdge(kind, "<no-owner>", a.target_text, None, span, "latexml")
                d = decide_rejected(cand, R.X_NO_OWNER, note=f"{a.file}@{a.byte_start}")
                decisions.append(d)
                bus.emit("extractor.t2.latex.ref.resolve.decision", STAGE, "decision",
                         d.to_dict(), cause=cause)
                continue
            hint = {"designedResolver": "LaTeXML idref→xml:id (two-pass)",
                    "syntacticLabelFound": a.target_text in labels if kind == "references" else None}
            cand = CandidateEdge(kind, owner.id, a.target_text, hint, span, "latexml")
            if kind == "references":
                ev = bus.emit(cand_probe, STAGE, "edge",
                              {"refSpan": span, "targetLabel": a.target_text}, cause=cause)
            elif kind == "cites":
                ev = bus.emit(cand_probe, STAGE, "edge",
                              {"citeSpan": span, "bibKey": a.target_text,
                               "resolved": False}, cause=cause)
            else:
                ev = bus.emit(cand_probe, STAGE, "edge",
                              {"includeSpan": span, "targetFile": a.target_text}, cause=cause)
            key = (kind, owner.id, a.target_text)
            if key in seen:
                d = decide_rejected(cand, R.X_DUP)
                bus.emit("extractor.t2.latex.edge.rejected", STAGE, "edge",
                         {"candidate": cand.to_dict(), "reason": d.reason}, cause=ev)
            else:
                seen.add(key)
                d = decide_unresolved(cand, R.U_STUB)
            decisions.append(d)
            bus.emit("extractor.t2.latex.ref.resolve.decision", STAGE, "decision",
                     d.to_dict(), cause=ev)

        # texlab-style unused-label finding, at the honesty grade we actually
        # have (syntactic, within the ingested set — probed as such):
        referenced = {a.target_text for a in anchors
                      if a.lang == "latex" and a.anchor_kind == "labelref"}
        for name in sorted(labels):
            if name not in referenced:
                n = labels[name]
                bus.emit("extractor.t2.latex.unused.label", STAGE, "value", {
                    "label": name,
                    "definedAt": {"file": n.span.file, "byteStart": n.span.byteStart},
                    "referenced": False,
                    "grade": "syntactic (grammar-tier, ingested set only — texlab/LaTeXML "
                             "would be authoritative)"}, cause=cause)

        edges = edges_from_decisions(decisions)
        ceiling = HonestCeiling(
            lang="latex",
            resolves=["references (\\ref→\\label)", "cites (\\cite→bib)",
                      "includes (\\input/\\include)"],
            cannotResolve=["arbitrary macro-generated refs (Turing-complete → best-effort)"],
            resolverGrade="TeX-emulation (LaTeXML, deepest) | LSP (texlab)",
            blindSpots=["texlab is GPL-3.0 → subprocess only, no persisted graph export"],
            extra={"status": "design-stub (LaTeXML not wired; tier G — all candidates are leads)",
                   "tier": handle.tier})
        bus.emit("extractor.t2.latex.honest_ceiling", STAGE, "state", ceiling.to_dict(), cause=cause)
        return DockResult(edges=edges, decisions=decisions, ceiling=ceiling)
