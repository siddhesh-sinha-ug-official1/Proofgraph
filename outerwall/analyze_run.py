"""analyze_run.py — analyze()/analyze_session(): the session assembly.

SUB200 restructure: split out of outerwall/analyze.py (which stays the
facade; its module docstring carries the full contract).  Behavior
identical — same probes in the same order, same finally-block feed
shutdown, same re-ingest/validation/gap/provenance sequence.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from . import (BadSourceRoot, OUTERWALL_VERSION, OuterLog, OuterwallError,
               SCHEMA_PIN_HASH, SCHEMA_PIN_VERSION,
               ensure_assembly_paths, json_scrub, validate_graph)
from . import gap as gap_mod
from . import outline as outline_mod
from . import provenance as prov_mod
from .analyze_capability import (capability_provenance, open_capability,
                                 snapshot_streams)
from .analyze_roots import _normalize_root, _resolve_roots, cleanup_staging


def _hub_pipeline():
    ensure_assembly_paths()
    import pipeline as hub_pipeline   # hub's own flat-import convention
    return hub_pipeline


def analyze(source_root, roots=None, config=None) -> dict:
    """OUTERWALL-CONTRACT.md programmatic face.  Pure-JSON result."""
    return analyze_session(source_root, roots=roots, config=config)["analysis"]


def analyze_session(source_root, roots=None, config=None) -> dict:
    """analyze() plus the live diagnostic companion:
    {"analysis", "modelWall", "extractorWall", "hubLog", "outerLog",
     "pipeline", "capabilityStreams", "declaredRoots", "staging",
     "feed", "shutdownPins"} — what system_pins() aggregates."""
    hub_pipeline = _hub_pipeline()
    config = dict(config or {})
    olog = OuterLog()
    hublog = hub_pipeline.HubLog()
    olog.emit("outerwall.version", {
        "outerwallVersion": OUTERWALL_VERSION,
        "schemaPin": {"schemaVersion": SCHEMA_PIN_VERSION,
                      "schemaHash": SCHEMA_PIN_HASH}})
    olog.emit("outerwall.analyze.call", {
        "sourceRoot": str(source_root), "roots": list(roots or []),
        "configKeys": sorted(config)})

    src = Path(source_root)
    if not src.exists():
        olog.emit("outerwall.analyze.rejected",
                  {"failureClass": "bad-source-root", "path": str(src)})
        raise BadSourceRoot(f"source root {src} does not exist")

    extraction_root, staging = _normalize_root(src, olog)
    try:
        return _analyze_session_body(extraction_root, staging, config,
                                     roots, olog, hublog, hub_pipeline)
    finally:
        # [H8] outerwall-stage-* mkdtemp cleanup — must outlive the pipeline
        # but never the return: extractor is done, gap/provenance work on
        # in-memory envelope only, and the staging record's sha256 dict is
        # already computed (physical files no longer needed).
        cleanup_staging(staging)


def _analyze_session_body(extraction_root, staging, config, roots,
                          olog, hublog, hub_pipeline):
    extractor_config = dict(config.get("extractor") or {})

    # ---- capability: the REAL V1 feed by default ---------------------------
    feed, cap_fn = open_capability(config, olog)

    capability_streams: dict[str, dict] = {}
    shutdown_pins: list = []
    try:
        result = hub_pipeline.run_pipeline(
            extraction_root, roots=None, capability_fn=cap_fn,
            extractor_config=extractor_config, log=hublog)
        # snapshot cell 2's pin streams BEFORE shutdown (module-global
        # last-run state would rot otherwise — the V1 report's bound 4)
        capability_streams = snapshot_streams(feed)
    finally:
        if feed is not None:
            shutdown_pins = feed.shutdown()
            olog.emit("outerwall.capability.shutdown",
                      {"pins": shutdown_pins})

    envelope = result["envelope"]
    model_wall = result["modelWall"]
    extractor_wall = result["extractorWall"]

    capability_prov, capability_bounds, feed_refusals = (
        capability_provenance(feed, extractor_wall, olog))

    # ---- roots (outer vocabulary) — resolved here, INSTALLED by the single
    #      outline-filled verify ingest below (Wave D E1 pre-GitHub: the
    #      former intermediate root-declaration ingest was redundant — the
    #      outline pass reads nodes/edges/leads from the pin surface and does
    #      not consult roots; the final verify ingest carries roots + filled
    #      outlines together, one pass through the wall).
    declared = _resolve_roots(envelope, roots, olog)

    # ---- outline (ruling 8) over the wall's PIN surface ---------------------
    state = model_wall.pins.dump()["wall"]["ingested"]
    outline_result = outline_mod.fill_outlines(state, olog)
    outlines = outline_result["outlines"]

    filled_nodes = deepcopy(state["nodes"])
    for n in filled_nodes:
        n["outline"] = dict(outlines[n["id"]])

    # INGEST the outline-filled graph with declared roots (full wall
    # re-verification: schema, ids, segregation, fake-green) so face == pins
    # == served everywhere.  This is the SINGLE outer-side ingest — hub's
    # run_pipeline did the initial ingest; the intermediate roots-only ingest
    # was dropped (E1) as it re-verified the same rows for no new bytes.
    model_wall.ingest(filled_nodes, state["edges"], state["leads"],
                      roots=declared)
    olog.emit("outerwall.outline.reingest", {
        "nodes": len(filled_nodes), "roots": declared,
        "note": "outline-filled graph re-verified by the model wall "
                "(single outer ingest; E1 pre-GitHub — the intermediate "
                "roots-only ingest was redundant and was dropped)"})

    graph = model_wall.project("graph")
    conforms, errors = validate_graph(graph)
    if not conforms:
        olog.emit("outerwall.analyze.rejected",
                  {"failureClass": "graphjson-nonconformant",
                   "errors": errors})
        raise OuterwallError(
            f"outline-filled graph violates the canonical schema: {errors}")

    verdicts = {n["id"]: model_wall.verdictOf(n["id"]) for n in graph["nodes"]}

    # ---- gap analysis + provenance ------------------------------------------
    gap = gap_mod.build(model_wall, extractor_wall, declared,
                        outline_result, olog)
    gap["outlineClosure"] = outline_result["closure"]

    refusals = (prov_mod.unclaimed_file_refusals(extractor_wall, olog)
                + [{"failureClass": r.get("failureClass"),
                    "lang": r.get("lang"),
                    "detail": "capability-layer typed refusal (V1 feed)",
                    "record": r} for r in feed_refusals])
    prov = prov_mod.build(graph, envelope.get("honestCeilings"),
                          capability_prov, capability_bounds, refusals,
                          staging, olog)
    prov_mod.assert_no_holes(graph, prov, olog)

    analysis = json_scrub({
        "graph": graph,
        "verdicts": verdicts,
        "provenance": prov,
        "gapAnalysis": gap,
    })
    olog.emit("outerwall.analyze.return", {
        "nodes": len(graph["nodes"]), "edges": len(graph["edges"]),
        "leads": len(graph["leads"]), "declaredRoots": declared,
        "outlineStatuses": sorted({o["status"] for o in outlines.values()}),
        "unused": len(gap["unused"]), "undeclared": gap["undeclared"]})

    return {
        "analysis": analysis,
        "modelWall": model_wall,
        "extractorWall": extractor_wall,
        "hubLog": hublog,
        "outerLog": olog,
        "pipeline": result,
        "capabilityStreams": capability_streams,
        "declaredRoots": declared,
        "staging": staging,
        "feed": feed,
        "shutdownPins": shutdown_pins,
    }
