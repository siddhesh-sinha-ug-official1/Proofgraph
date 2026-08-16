"""S3 — ASSEMBLE: normalize candidates -> schema edges, dedup, bind dst to a
Node.id or an explicit unresolved placeholder, audit provenance.

This stage also enforces three failure-class guards (§9.1 + LEAN-DOCK round):
  * Faked edge  — a resolved edge without a matching resolved decision.
  * Tier inflation — a dock claiming resolved edges beyond its Tree-2 tier.
  * Unbacked green — a green fill without a kernel attestation (origin
    "checked" + a GREEN_ATTESTED_PREFIXES source) or at a non-CT tier.
All raise.  Tier-inflation and unbacked-green probe their violation before
raising; the faked-edge guard (and its post-dedup 1:1 backstop) raises
directly — its only probe trail is the pipeline-level extractor.error.caught
emitted during propagation.  (Doc fix, adversarial round refuter: the old
line claimed "all probe first".)
"""
from __future__ import annotations

from .capability import CapabilityHandle
from .docks import DockResult
from .docks import reasons as R
from .probe import ProbeBus, ProbeEvent
from .schema import (SchemaEdge, SchemaNode, SchemaViolation, UNRESOLVED_PREFIX,
                     edge_id, green_fill_attested)

STAGE = "S3.assemble"


class FakedEdgeError(RuntimeError):
    pass


class TierInflationError(RuntimeError):
    pass


class UnbackedGreenError(RuntimeError):
    """Failure class unbacked-green (LEAN-DOCK round): a node surfaced a green
    fill that no real checker attests — kernelAccepted evidence missing, origin
    not 'checked', a non-registered fill.source, or a non-CT capability tier.
    Green may never be faked; this guard makes the forged path raise loudly."""


def assemble(bus: ProbeBus, nodes: list[SchemaNode],
             dock_results: dict[str, DockResult],
             capabilities: dict[str, CapabilityHandle],
             cause: ProbeEvent | None = None) -> tuple[list[SchemaEdge], dict]:
    edges: list[SchemaEdge] = []
    seen: dict[str, SchemaEdge] = {}
    tally: dict[str, dict] = {}

    for lang in sorted(dock_results):
        result = dock_results[lang]
        cap = capabilities[lang]
        resolved_decisions = [d for d in result.decisions if d.outcome == "resolved"]
        resolved_edges = [e for e in result.edges if e.resolved]

        # ---- guard: tier inflation (§5.8) — a dock may never upgrade its tier.
        # Assembly ruling 2: resolved edges are CT-only (S lost resolution
        # rights; the seam owner's DEPTH_ALLOWS_RESOLVED_EDGES table wins).
        if not cap.allows_resolution() and (resolved_decisions or resolved_edges):
            bus.emit("extractor.tier.enforcement.violation", STAGE, "error", {
                "dock": lang, "tier": cap.tier,
                "offendingResolvedCount": len(resolved_decisions) + len(resolved_edges)},
                cause=cause)
            raise TierInflationError(
                f"dock {lang!r} claimed {len(resolved_decisions)} resolved decisions at "
                f"tier {cap.tier} — resolution is forbidden at S/G/P (green may never be faked)")

        # ---- guard: faked edge (§5.4 invariant) — verify, don't trust
        if len(resolved_edges) != len(resolved_decisions):
            raise FakedEdgeError(
                f"dock {lang!r}: {len(resolved_edges)} resolved edges vs "
                f"{len(resolved_decisions)} resolved decisions — an edge without a "
                f"decision is a faked relationship")
        decision_keys = {(d.candidate.kind, d.candidate.srcId, d.boundDstId)
                         for d in resolved_decisions}
        for e in resolved_edges:
            if (e.kind, e.srcId, e.dstId) not in decision_keys:
                raise FakedEdgeError(
                    f"dock {lang!r}: resolved edge {e.id} ({e.kind} {e.srcId}->{e.dstId}) "
                    f"has no matching resolved decision — faked relationship")

        t = {"resolved": 0, "unresolved": 0, "rejected": 0}
        for d in result.decisions:
            t[d.outcome] += 1
        tally[lang] = t

        # ---- normalize every non-rejected decision into a schema edge -------
        for d in result.decisions:
            if d.outcome == "rejected":
                continue
            eid, preimage = edge_id(d.candidate.kind, d.candidate.srcId, d.boundDstId)
            e = SchemaEdge(
                id=eid, kind=d.candidate.kind, srcId=d.candidate.srcId,
                dstId=d.boundDstId, resolved=(d.outcome == "resolved"),
                resolver=d.resolver if d.outcome == "resolved" else "",
                provenance={"tier": "T2", "extractor": d.candidate.extractor})
            try:
                e.validate()
            except SchemaViolation as exc:
                bus.emit("extractor.provenance.anonymous.violation", STAGE, "error",
                         {"itemId": e.id, "missingField": str(exc)}, cause=cause)
                raise
            ev = bus.emit("extractor.assemble.edge.normalize", STAGE, "edge",
                          {"candidate": d.candidate.to_dict(), "schemaEdge": e.to_dict()},
                          cause=cause)
            bus.emit("extractor.assemble.edge.id", STAGE, "value",
                     {"edgeId": eid, "preimage": preimage}, cause=ev)
            if not e.resolved:
                bus.emit("extractor.assemble.edge.unresolved.placeholder", STAGE, "node", {
                    "placeholderId": e.dstId, "dstName": d.candidate.dstName,
                    "reason": d.reason}, cause=ev)
            if eid in seen:
                bus.emit("extractor.assemble.edge.dedup", STAGE, "decision",
                         {"keptEdgeId": eid, "droppedDuplicateOf": eid}, cause=ev)
                continue
            seen[eid] = e
            edges.append(e)
            bus.emit("extractor.provenance.edge.stamp", STAGE, "value", {
                "edgeId": eid, "tier": "T2", "extractor": e.provenance["extractor"],
                "resolver": e.resolver, "resolved": e.resolved}, cause=ev)

    # ---- post-dedup 1:1 backstop (review C10): after collapsing duplicates,
    # the kept resolved edges must still be exactly the unique resolved-decision
    # keys — a dock that emitted two resolved decisions for one edge already
    # violated the invariant upstream, and this catches any future regression.
    unique_resolved_keys = {
        (d.candidate.kind, d.candidate.srcId, d.boundDstId)
        for r in dock_results.values() for d in r.decisions if d.outcome == "resolved"}
    kept_resolved_keys = {(e.kind, e.srcId, e.dstId) for e in edges if e.resolved}
    if kept_resolved_keys != unique_resolved_keys:
        raise FakedEdgeError(
            f"post-dedup 1:1 broken: kept resolved edges {len(kept_resolved_keys)} != "
            f"unique resolved decision keys {len(unique_resolved_keys)}")

    # ---- guard: unbacked green (LEAN-DOCK round) ----------------------------
    # Every green fill is audited: origin must be "checked", fill.source must
    # carry a registered checker attestation, and the node's language must sit
    # at a resolution-granting (CT) tier.  A green that fails any leg is the
    # named failure class unbacked-green — probed, then raised.
    for n in nodes:
        if n.fill.get("status") != "green":
            continue
        cap = capabilities.get(n.lang)
        attested = green_fill_attested(n.fill, n.origin)
        tier_ok = cap is not None and cap.allows_resolution()
        bus.emit("extractor.assemble.green.audit", STAGE, "decision", {
            "nodeId": n.id, "lang": n.lang, "origin": n.origin,
            "source": n.fill.get("source"), "attested": attested,
            "tierAllows": tier_ok}, cause=cause)
        if not (attested and tier_ok):
            bus.emit("extractor.green.enforcement.violation", STAGE, "error", {
                "nodeId": n.id, "origin": n.origin,
                "source": n.fill.get("source"),
                "tier": cap.tier if cap is not None else None}, cause=cause)
            raise UnbackedGreenError(
                f"node {n.id} carries a green fill without a kernel attestation "
                f"(origin={n.origin!r}, source={n.fill.get('source')!r}, "
                f"tier={cap.tier if cap is not None else None!r}) — green may "
                f"never be faked (failure class unbacked-green)")

    # ---- provenance audit: no anonymous data in the graph -------------------
    n_with = sum(1 for n in nodes if n.provenance.get("tier") and n.provenance.get("extractor"))
    e_with = sum(1 for e in edges if e.provenance.get("tier") and e.provenance.get("extractor"))
    bus.emit("extractor.assemble.provenance.audit", STAGE, "value", {
        "totalNodes": len(nodes), "totalEdges": len(edges),
        "withProvenance": n_with + e_with}, cause=cause)
    for n in nodes:
        if not (n.provenance.get("tier") and n.provenance.get("extractor")):
            bus.emit("extractor.provenance.anonymous.violation", STAGE, "error",
                     {"itemId": n.id, "missingField": "provenance"}, cause=cause)
            raise SchemaViolation(f"anonymous node {n.id}")
    if n_with + e_with != len(nodes) + len(edges):
        raise SchemaViolation("provenance audit failed: anonymous edges present")

    bus.emit("extractor.assemble.resolved.tally", STAGE, "value",
             {"perDock": tally}, cause=cause)

    decisions_by_dock = {lang: r.decisions for lang, r in dock_results.items()}
    bus.emit("extractor.resolve.reason.histogram", STAGE, "value",
             R.histogram(decisions_by_dock), cause=cause)

    resolved_n = sum(1 for e in edges if e.resolved)
    leads_n = len(edges) - resolved_n
    bus.emit("extractor.assemble.graph.emit", STAGE, "output", {
        "nodeCount": len(nodes), "edgeCount": len(edges),
        "resolvedEdges": resolved_n, "unresolvedLeads": leads_n}, cause=cause)
    return edges, tally
