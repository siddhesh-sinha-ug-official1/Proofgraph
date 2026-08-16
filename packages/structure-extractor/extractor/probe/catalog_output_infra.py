"""Probe catalog section: S5 OUTPUT, backend req/resp pairs, provenance & tier
discipline, reason taxonomy, honest gaps, and the Phase-1 WALL leads
(spec §6.10–§6.14 + §7.8).

One section of the exhaustive §6 enumeration — aggregated, IN ORDER, by
catalog.py (the probeCatalog() source of truth).  Entry shape:
(probeId, kind, payloadType, description).
"""

from __future__ import annotations

CATALOG_OUTPUT_INFRA: list[tuple[str, str, str, str]] = [
    # ---- §6.10 S5 OUTPUT ----------------------------------------------------
    ("extractor.output.honest_ceiling.report", "state", "{perDock}",
     "Aggregated honest ceiling across all docks — the single artifact a reviewer reads."),
    ("extractor.output.summary", "output", "{nodes, edges, resolved, leads, cycles, unused, twoLibAgree}",
     "The run summary."),

    # ---- §6.11 backend call request/response pairs --------------------------
    ("extractor.backend.grimp.req", "call", "{package}", "grimp request."),
    ("extractor.backend.grimp.resp", "call", "{modules, importPairs}", "grimp in-memory import graph response."),
    ("extractor.backend.pyright.req", "call", "{file, position, method}", "Pyright name-resolution request."),
    ("extractor.backend.pyright.resp", "call", "{result, mode}", "Pyright JSON answer (live-lsp or recorded-replay)."),
    ("extractor.backend.leanInfotree.req", "call", "{module}", "DORMANT: InfoTree extractor request."),
    ("extractor.backend.leanInfotree.resp", "call", "{decls, imports}", "DORMANT: InfoTree JSON (you define the shape)."),
    ("extractor.backend.lakeGraph.req", "call", "{cmd}", "DORMANT: lake exe graph request."),
    ("extractor.backend.lakeGraph.resp", "call", "{nodes, edges}", "DORMANT: xdot-json import DAG."),
    ("extractor.backend.latexml.req", "call", "{cmd}", "DORMANT: latexml subprocess request."),
    ("extractor.backend.latexml.resp", "call", "{elementsWithXmlId, idrefs, undefinedRefs}", "DORMANT: LaTeXML XML parsed."),
    ("extractor.backend.texlab.req", "call", "{method, params}", "DORMANT: texlab LSP request (subprocess only, GPL-3.0)."),
    ("extractor.backend.texlab.resp", "call", "{result}", "DORMANT: texlab JSON-RPC result."),
    ("extractor.backend.typstEval.req", "call", "{cmd}", "DORMANT: typst eval subprocess request."),
    ("extractor.backend.typstEval.resp", "call", "{refs, labels, imports}", "DORMANT: typst eval flat element list."),
    ("extractor.backend.timeout", "error", "{backend, cmd, ms}",
     "Any backend subprocess/LSP timeout, logged as a cap (no silent drop)."),

    # ---- §6.12 provenance & tier discipline ---------------------------------
    ("extractor.provenance.node.stamp", "value", "{nodeId, tier, extractor, resolved}",
     "Every node carries provenance; resolved = 'extractor successfully bound this element's identity' "
     "— true for every well-formed structural node (assembly ruling 7)."),
    ("extractor.provenance.edge.stamp", "value", "{edgeId, tier, extractor, resolver, resolved}",
     "Every edge carries provenance."),
    ("extractor.provenance.anonymous.violation", "error", "{itemId, missingField}",
     "Any node/edge missing provenance. Must NEVER fire; asserted zero in tests."),

    # ---- §6.13 reason taxonomy ---------------------------------------------
    ("extractor.resolve.reason.histogram", "value", "{perDock}",
     "Aggregated ceiling-by-category: resolved / unresolved{reason:count} / rejected{reason:count}."),

    # ---- §7.8 honest gaps (emitted as state so never silently assumed away) --
    ("extractor.gaps.honest", "state", "{gaps:[...]}",
     "The dossier's honest gaps carried verbatim: no uniform T2 index across 7 langs; no code<->doc unified graph; T3-as-product is a build; Typst T3 thin; Lean dep-graph research-grade; LaTeX graph emitter nearly a gap; unused-completeness caveat."),

    # ---- §6.14 Phase-1 WALL — the promoted face's own decisions -------------
    # (additive: the wall never deletes a pin; these leads only fire when the
    # cell is driven THROUGH wall.py — plain ExtractorCell runs never emit them)
    ("extractor.wall.version", "state", "{wallVersion, pinnedSchemaVersion, pinnedSchemaHash}",
     "The wall's identity at construction: WALL_VERSION plus the schema PIN it stands on."),
    ("extractor.wall.pin.check", "decision", "{pinnedVersion, pinnedHash, canonicalVersion, canonicalHash, ok}",
     "The wall's schema-PIN assertion (cell mirror vs packages/schema PIN vs recomputed schema.json hash); ok=false is immediately followed by a schema-pin-mismatch refusal — a wall refuses to stand on a drifted schema."),
    ("extractor.wall.extract.call", "call", "{root, capabilityFnInjected, outDir}",
     "The wall face extract() was driven; capabilityFnInjected=true when a caller plugs the V1 capability socket (Phase 2: Tree 2's real function)."),
    ("extractor.wall.extract.return", "output", "{nodes, edges, leads, docks}",
     "The face's declared envelope counts — conformance asserts these equal the assemble-stage pins (declared may never diverge from probed)."),
    ("extractor.wall.honest_ceiling.request", "call", "{lang, outcome}",
     "honestCeiling(lang) served: outcome∈declared/undeclared/refused-unknown-language — an undeclared or unknown ceiling is surfaced as such, never fabricated."),
    ("extractor.wall.refusal", "error", "{failureClass, detail}",
     "A named wall refusal (schema-pin-mismatch | unknown-language | lead-in-edges | id-mismatch) — the wall fails loudly, never silently."),
]
