"""proofgraph outer wall — Phase 3 programmatic face (assembly code, NOT a cell).

One membrane around the assembled system.  This package is the Python face
frozen by OUTERWALL-CONTRACT.md:

    from outerwall import analyze, analyze_session, system_pins

    analysis = analyze(source_root, roots=None, config=None)
      -> {"graph", "verdicts", "provenance", "gapAnalysis"}   (canonical, JSON-pure)

    session  = analyze_session(...)   # analysis + the live walls/logs companion
    pins     = system_pins(session)   # the outermost diagnostic surface
                                      # (cellId "system.outerwall")

Composition (walls only, per the binding rules):
  * hub/pipeline.run_pipeline (extract -> ingest) with the REAL V1
    capability_fn (vessels/v1_capability_extractor.V1CapabilityFeed) for
    python; languages cell 2 refuses use the extractor's stub as V1's
    RECORDED fallback — provenance carries measuredBy for every language.
  * the emergent layer: outline.py (RULING 8), gap.py (model-wall query()
    only), provenance.py (no element without provenance), system_pins.py.

This package facade holds what every sibling needs without importing them
(so the package initializes bottom-up, no cycles).  SUB200 restructure: the
implementations moved to focused submodules — wallconst.py (version/paths/
schema pin), errors.py (named failure classes), probelog.py (the outer probe
log + catalog), loaders.py (canonical schema artifact loaders) — and THIS
module re-exports every original name, so `from outerwall import X` and
`from . import X` (siblings) are unchanged.

Named failure classes minted HERE (catalogued in ARCHITECTURE-PHASE2.md):
  outline-vocabulary-leak      a string outside the frozen 7-token vocabulary
                               in any worstOf — BUILD-FAILING, never served
  outline-closure-disagreement rustworkx and networkx disagree on a node's
                               reflexive-transitive base — BUILD-FAILING
  provenance-hole              an element of the analyzed graph with missing/
                               incomplete provenance — BUILD-FAILING
  bad-source-root              analyze() called on a path that does not exist
  unknown-root                 (reused vocabulary) a declared root that
                               resolves to nothing — the outer wall never
                               guesses
  no-analysis-computed         (hub-side) GET /analysis before any analyze()
"""
from __future__ import annotations

from .wallconst import (CELL_ID, HUB_DIR, OUTERWALL_DIR,      # noqa: F401
                        OUTERWALL_VERSION, PACKAGES, PROOFGRAPH_ROOT,
                        SCHEMA_PIN_HASH, SCHEMA_PIN_VERSION, VESSELS_DIR)
from .errors import (BadSourceRoot, OuterwallError,           # noqa: F401
                     OutlineClosureDisagreement, OutlineVocabularyLeak,
                     ProvenanceHole, UnknownRootDeclared)
from .probelog import OUTERWALL_PROBE_CATALOG, OuterLog       # noqa: F401
from .loaders import (ensure_assembly_paths, json_scrub,      # noqa: F401
                      schema_constants, validate_graph)

# Re-exports (bottom of the file on purpose: siblings import the names above).
from .analyze import analyze, analyze_session          # noqa: E402,F401
from .system_pins import SystemPins, system_pins       # noqa: E402,F401

__all__ = [
    "OUTERWALL_VERSION", "CELL_ID", "SCHEMA_PIN_VERSION", "SCHEMA_PIN_HASH",
    "OuterwallError", "OutlineVocabularyLeak", "OutlineClosureDisagreement",
    "ProvenanceHole", "BadSourceRoot", "UnknownRootDeclared",
    "OUTERWALL_PROBE_CATALOG", "OuterLog",
    "schema_constants", "validate_graph", "json_scrub",
    "analyze", "analyze_session", "SystemPins", "system_pins",
]
