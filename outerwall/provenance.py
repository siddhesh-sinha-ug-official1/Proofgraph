"""provenance.py — every element of the analyzed graph names its origin.

Shape (OUTERWALL-CONTRACT.md):
  provenance["nodes"][nodeId]  -> {cell, tier, extractor, resolved, lang,
                                   kind, origin, capabilityRef}
  provenance["edges"][edgeId]  -> {cell, tier, extractor, resolved, kind,
                                   resolver}   (leads included: resolved False)
  provenance["capability"][lang] -> V1's measurement provenance VERBATIM:
       measuredBy ('capability-layer' | 'local-stub' | 'refused'),
       tier, and the evidence pin refs (measuredTierPin / constructPin
       snapshots for real measurements; the typed refusal record incl.
       cell 2's refusal pin events for stub fallbacks) — feed.provenance,
       stamped at capability_fn time, snapshotted before shutdown().
       (Diagnostic runs under config capability='stub' carry measuredBy
       'extractor-stub' instead — no feed, no measurement, and the record
       says so; see analyze_capability.capability_provenance.)
  provenance["honestCeilings"]  -> the extract envelope's per-dock ceilings,
                                   verbatim (per-lang honest ceilings).
  provenance["refusals"]        -> typed refusals: files the extractor saw
       but no language claimed (failureClass unknown-language), plus cell
       2's refusal records carried by the V1 feed.
  provenance["bounds"]          -> V1 feed bounds (duplicated-subprocess,
                                   no-grammar-floor, ...) — logged, never silent.
  provenance["staging"]         -> the root-normalization record, if any.

MISSING provenance on any element of the analyzed graph is the named,
BUILD-FAILING class provenance-hole — assert_no_holes() raises, tested.
"""
from __future__ import annotations

from . import OuterLog, ProvenanceHole

CELL_EXTRACTOR = "structure-extractor"

_REQUIRED = ("cell", "tier", "extractor", "resolved")


def build(graph: dict, honest_ceilings: dict, capability: dict,
          capability_bounds: list, refusals: list, staging,
          log: OuterLog) -> dict:
    """Assemble the provenance surface from the analyzed graph + the V1
    capability feed's records.  Never invents: a node/edge row without its
    own provenance material becomes a HOLE (raised by assert_no_holes)."""
    nodes: dict[str, dict] = {}
    for n in graph["nodes"]:
        p = n.get("provenance") or {}
        nodes[n["id"]] = {
            "cell": CELL_EXTRACTOR,
            "tier": p.get("tier"),
            "extractor": p.get("extractor"),
            "resolved": p.get("resolved"),
            "lang": n.get("lang"),
            "kind": n.get("kind"),
            "origin": n.get("origin"),
            # per-lang capability measurement provenance lives once under
            # provenance["capability"]; nodes point at their language's record
            "capabilityRef": (n.get("lang")
                              if n.get("lang") in capability else None),
        }

    edges: dict[str, dict] = {}
    for row in list(graph["edges"]) + list(graph["leads"]):
        p = row.get("provenance") or {}
        edges[row["id"]] = {
            "cell": CELL_EXTRACTOR,
            "tier": p.get("tier"),
            "extractor": p.get("extractor"),
            "resolved": row.get("resolved"),
            "kind": row.get("kind"),
            "resolver": row.get("resolver"),
        }

    prov = {
        "nodes": nodes,
        "edges": edges,
        "capability": capability,          # V1 feed.provenance, verbatim
        "capabilityBounds": list(capability_bounds),
        "honestCeilings": dict(honest_ceilings or {}),
        "refusals": list(refusals),
        "staging": staging,
    }
    log.emit("outerwall.provenance.record", {
        "nodes": len(nodes), "edges": len(edges),
        "capabilityLangs": sorted(capability),
        "refusals": len(refusals),
        "bounds": [b.get("bound") for b in capability_bounds]})
    return prov


def assert_no_holes(graph: dict, prov: dict, log: OuterLog) -> None:
    """BUILD-FAILING gate: every node and every edge/lead of the analyzed
    graph must carry a complete {cell, tier, extractor, resolved} record.
    A missing element or a None field is the named class provenance-hole."""
    holes: list[str] = []

    for n in graph["nodes"]:
        rec = prov.get("nodes", {}).get(n["id"])
        if rec is None:
            holes.append(f"node {n['id']}: no provenance record at all")
            continue
        for field in _REQUIRED:
            if rec.get(field) is None:
                holes.append(f"node {n['id']}: provenance field "
                             f"{field!r} missing/None")

    for row in list(graph["edges"]) + list(graph["leads"]):
        rec = prov.get("edges", {}).get(row["id"])
        if rec is None:
            holes.append(f"edge {row['id']}: no provenance record at all")
            continue
        for field in _REQUIRED:
            if rec.get(field) is None:
                holes.append(f"edge {row['id']}: provenance field "
                             f"{field!r} missing/None")

    if holes:
        log.emit("outerwall.provenance.hole",
                 {"failureClass": "provenance-hole", "holes": holes})
        raise ProvenanceHole(
            f"{len(holes)} element(s) with missing provenance — "
            f"first: {holes[0]}")


def unclaimed_file_refusals(extractor_wall, log: OuterLog) -> list[dict]:
    """Typed refusals for files the extractor SAW (extractor.ingest.file pin)
    but no language sourceset claimed — unknown-language inputs surface as
    refusals in provenance, never as fabricated nodes, never green."""
    seen = [e["payload"]["path"] for e in extractor_wall.pins.history()
            if e["probeId"] == "extractor.ingest.file"]
    claimed: set[str] = set()
    for ss in (extractor_wall.pins.dump().get("sourcesets") or {}).values():
        claimed.update(ss.get("files", []))
    refusals = []
    for path in seen:
        if path not in claimed:
            refusals.append({
                "file": path,
                "failureClass": "unknown-language",
                "detail": (f"file {path!r} was seen by the extractor but no "
                           f"language claimed it — no tier, no nodes, no "
                           f"verdict is fabricated (unknown != green)"),
            })
    if refusals:
        log.emit("outerwall.provenance.refusal",
                 {"failureClass": "unknown-language",
                  "files": [r["file"] for r in refusals]})
    return refusals
