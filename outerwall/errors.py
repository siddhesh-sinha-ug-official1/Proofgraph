"""errors.py — the outer wall's named failure classes.

SUB200 restructure: split out of outerwall/__init__.py (which stays the
facade re-exporting every class — importers see no change).  Catalogued in
ARCHITECTURE-PHASE2.md; behavior identical.
"""
from __future__ import annotations


class OuterwallError(RuntimeError):
    """Base of every outer-wall refusal; carries .failure_class."""
    failure_class = "outerwall-refusal"

    def __init__(self, detail: str):
        super().__init__(f"failure-class={self.failure_class}: {detail}")
        self.detail = detail


class OutlineVocabularyLeak(OuterwallError):
    """A worstOf string outside the frozen 7-token vocabulary (or a fill
    status outside the frozen enum feeding it).  BUILD-FAILING: analyze()
    never returns an outline carrying it."""
    failure_class = "outline-vocabulary-leak"


class OutlineClosureDisagreement(OuterwallError):
    """rustworkx and networkx disagree on a reflexive-transitive base —
    the two-library idiom refused to agree; nothing downstream stands."""
    failure_class = "outline-closure-disagreement"


class ProvenanceHole(OuterwallError):
    """An element of the analyzed graph has missing or incomplete provenance
    ({cell, tier, extractor, resolved}).  BUILD-FAILING, tested."""
    failure_class = "provenance-hole"


class BadSourceRoot(OuterwallError):
    """analyze() called on a path that does not exist."""
    failure_class = "bad-source-root"


class UnknownRootDeclared(OuterwallError):
    """A declared root resolves to no node (as id, unique decl name, or
    module name with decl members) — the outer wall never guesses."""
    failure_class = "unknown-root"
