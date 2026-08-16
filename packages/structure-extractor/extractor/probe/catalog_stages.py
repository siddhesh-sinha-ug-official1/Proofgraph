"""Probe catalog section: cross-cutting + S0 INGEST + S1 T1 STRUCTURE (spec §6.0–§6.2).

One section of the exhaustive §6 enumeration — aggregated, IN ORDER, by
catalog.py (the probeCatalog() source of truth).  Entry shape:
(probeId, kind, payloadType, description).
"""

from __future__ import annotations

CATALOG_STAGES: list[tuple[str, str, str, str]] = [
    # ---- §6.0 cross-cutting -------------------------------------------------
    ("extractor.boundary.import.check", "decision", "{importedModule, allowed, file}",
     "Import-boundary gate: proves the cell reached only its declared deps. Wired FIRST."),
    ("extractor.boundary.license.posture", "state", "{declaredDeps:{module:spdx}, subprocessOnly:{tool:spdx}}",
     "SPDX posture of every declared dep and every subprocess-only tool (license gate)."),
    ("extractor.stage.timing", "timing", "{stage, wallNanos}",
     "Per-stage wall time; NEVER used for ordering (that is logicalClock)."),
    ("extractor.error.caught", "error", "{stage, exception, sourceSpan|null}",
     "Every caught error/exception, tagged with where in the pipe."),
    ("extractor.cap.applied", "decision", "{capName, limit, actual, dropped}",
     "Any bound hit (node cap, cycle-length bound, top-N, exclusion list). No silent caps."),
    ("extractor.tier.enforcement.violation", "error", "{dock, tier, offendingResolvedCount}",
     "A dock claimed resolved edges beyond its Tree-2 tier (tier inflation guard §5.8). Must never fire."),

    # ---- §6.1 S0 INGEST -----------------------------------------------------
    ("extractor.ingest.file", "input", "{path, byteLen, sha}",
     "Every source file that entered the cell."),
    ("extractor.ingest.lang.detected", "value", "{path, lang, evidence}",
     "The language decided for a file (extension|shebang|content); drives dock dispatch."),
    ("extractor.ingest.sourceset.group", "value", "{lang, files, projectRoot}",
     "Files grouped into a SourceSet with the detected root."),
    ("extractor.ingest.projectroot.detect", "decision", "{lang, root, anchor, reason}",
     "Backend-specific project anchor (package|lake-project|main.tex|pinned-main); never guessed silently."),
    ("extractor.ingest.capability.request", "call", "{lang}",
     "The request to Tree 2's capability(lang). Tree 2 is a LOCAL STUB this round."),
    ("extractor.ingest.capability.response", "call", "{lang, tier, handleKind}",
     "Tree 2's answer; tier∈CT/S/G/P — the honest depth ceiling before any edge is extracted."),
    ("extractor.ingest.dock.selected", "decision", "{lang, dock, reason}",
     "Which dock will run (decision D1)."),
    ("extractor.ingest.dock.unavailable", "branch", "{lang, reason}",
     "No dock at this tier -> fall to T1-only; the branch NOT taken, with the reason."),

    # ---- §6.2 S1 T1 STRUCTURE ----------------------------------------------
    ("extractor.t1.parse.start", "input", "{path, lang, byteLen}",
     "Source handed to tree-sitter."),
    ("extractor.t1.parse.grammar", "value", "{lang, grammar, grammarVersion}",
     "Which grammar loaded (first-party vs community, via tree-sitter-language-pack)."),
    ("extractor.t1.parse.error", "error", "{path, errorNodeSpan}",
     "Every ERROR/MISSING node: the parse dropped structure — a lead."),
    ("extractor.t1.tagsscm.source", "value", "{lang, tagsScm, path}",
     "first-party vs DIY tags.scm — the moat caveat made visible (Lean/LaTeX/Typst are DIY)."),
    ("extractor.t1.tagsscm.diy.warning", "decision", "{lang, reason, captures}",
     "DIY tags.scm in use -> these T1 nodes are lower-confidence; records the hand-written captures."),
    ("extractor.t1.node.emit", "node", "{kind, lang, name, span, signature}",
     "Every structure node produced (one per top-level declaration) — the T2 resolution-target set."),
    ("extractor.t1.node.python", "node", "{capture, kind, name, span}",
     "Python function/class/module nodes (first-party captures)."),
    ("extractor.t1.node.go", "node", "{capture, kind, name, span}",
     "Go function/decl/module nodes (first-party captures)."),
    ("extractor.t1.node.c", "node", "{capture, kind, name, span}",
     "C function/class/decl nodes (first-party captures)."),
    ("extractor.t1.node.cpp", "node", "{capture, kind, name, span}",
     "C++ function/class/decl nodes (first-party captures)."),
    ("extractor.t1.node.lean", "node", "{capture, kind, name, span, diyTag}",
     "Lean decl/theorem/section/module nodes from the DIY tags.scm."),
    ("extractor.t1.node.latex", "node", "{capture, kind, name, span, diyTag}",
     "LaTeX section/theorem/label/figure nodes (DIY); reference captures recorded as T2 anchors."),
    ("extractor.t1.node.typst", "node", "{syntaxKind, kind, name, span, diyTag}",
     "Typst section/label/decl/figure nodes (DIY); Ref/ModuleImport recorded as T2 anchors."),
    ("extractor.t1.node.reject", "node", "{span, reason, lang}",
     "A matched syntax node NOT promoted to a schema node (anonymous/nested/below granularity) + why."),
    ("extractor.t1.node.id", "value", "{id, preimage}",
     "The content-addressed id and its exact hash preimage — proves reformat-stability."),
    ("extractor.t1.anchor.emit", "value", "{lang, anchorKind, targetText, useSiteSpan}",
     "A relationship-bearing T1 capture recorded as a candidate SEED for T2 — the tier boundary made visible."),
    ("extractor.t1.roundtrip.check", "value", "{path, reprintEqualsSource, firstDivergenceByte|null}",
     "Tree spans the full byte range and reprints to source; false = parse lost structure (C1 fixpoint at T1)."),
    ("extractor.t1.node.count", "value", "{lang, path, count}",
     "Node tally per language per file."),
]
