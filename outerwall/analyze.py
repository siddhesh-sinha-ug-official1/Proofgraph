"""analyze.py — the programmatic face of the big outer wall.

    analyze(source_root, roots=None, config=None) -> {
        "graph":       canonical envelope, every node's outline FILLED
                       (ruling 8) — still validates against
                       packages/schema/validate.py,
        "verdicts":    nodeId -> {fill, outline}  (== modelWall.verdictOf —
                       face equals pins),
        "provenance":  see provenance.py,
        "gapAnalysis": see gap.py,
    }

Composition (assembly code, walls only):
  1. hub/pipeline.run_pipeline (extract -> ingest) with the REAL V1
     capability feed (vessels/v1_capability_extractor.V1CapabilityFeed) for
     every language: python is MEASURED live by cell 2 (CT earned, never
     asserted); languages cell 2 refuses but the extractor knows (lean, ...)
     use the extractor stub as V1's RECORDED fallback (measuredBy:
     local-stub, refusal pinned); unknown-to-both stays a typed refusal.
     analyze() owns the feed's lifecycle: shutdown() in a finally block
     (the V1 ownership rule), shutdown pins recorded.
  2. Root re-declaration in the OUTER vocabulary: a declared root may be a
     canonical node id, a unique decl-node name, or a MODULE name — module
     names expand to the module's direct decl members (the V3
     root-vocabulary-mismatch translation, extended one honest step and
     LOGGED).  Roots are declared, never inferred.
  3. outline.fill_outlines (ruling 8) over the model wall's ingested pin
     surface; the FILLED graph is RE-INGESTED through the model wall (full
     re-verification: ids, leads segregation, schema, fake-green gate), so
     face == pins == served for outlines too.
  4. gap.py + provenance.py; provenance.assert_no_holes is build-failing.

Source-root normalization (every decision LOGGED via outerwall.root.staged):
  * source_root is a FILE -> staged alone into a scratch ingest root
    (the extractor walks directories; per-file sha256 pinned, byte-identity
    asserted — this staging is legitimate and stays).
  * source_root that is itself a python PACKAGE dir (has __init__.py) is
    extracted DIRECTLY (remediation round): the former copy-staging worked
    around cell 3's `package-root-uri-mismatch` bound (pyright wire uris
    minted by joining ingest-relative rels onto the detected package-PARENT
    project root -> live definition lookups returned [] and calls degraded
    to leads).  The cell fix is now applied (pyright_backend builds wire uris
    from the didOpen'd absolute paths and maps responses back into the
    dock's vocabulary), so bare-package-dir extraction resolves correctly
    with no staging.  The outerwall.root.staged probe STAYS and records the
    direct decision (mode: "direct").  NOTE the declared consequence: spans
    stay INGEST-root-relative, so a bare-dir extract mints span.file without
    the package prefix ("core.py", not "moatpkg/core.py") and node ids remint
    accordingly — root-sensitivity of the structural identity, declared
    since the master assembly, never smoothed away.  The relation set
    (names, edge kinds, resolution outcomes) is unchanged vs the staged
    extraction — asserted by the suite.

SUB200 restructure: this module stays the FACADE (hub/server_analyze.py and
the suites import `from outerwall.analyze import analyze, analyze_session`);
the implementation moved by cohesion to analyze_roots.py (root normalization
+ staging + root re-declaration), analyze_capability.py (capability feed
management), analyze_run.py (session assembly).  Behavior identical.
"""
from __future__ import annotations

from .analyze_roots import (_NODE_ID_RE, _normalize_root,      # noqa: F401
                            _resolve_roots, _sha256_file)
from .analyze_capability import _v1_feed_cls                   # noqa: F401
from .analyze_run import _hub_pipeline, analyze, analyze_session  # noqa: F401

__all__ = ["analyze", "analyze_session"]
