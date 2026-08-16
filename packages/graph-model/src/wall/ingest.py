"""The wall's ingest face — VERIFY-NOT-MINT (including the greenGuard gate).

Accepts a canonical {nodes, edges, leads} envelope, verifying — never
minting — identities.  Every verification decision is probed under the
additive `graph-model.wall.ingest.*` catalog section.
"""
from copy import deepcopy

from src.ids import compute_edge_identity
from src.stages.s2_node import HONEST_FILL
from src.stages.s4_fill import green_guard
from src.validate import validate_graph
from src.wall.base import (SCHEMA_PIN_VERSION, UNRESOLVED_PREFIX, WALL_VERSION,
                           _NODE_ID_RE, _WALL_STAGE)


class _IngestFace:
    # ---- face: ingest (VERIFY-NOT-MINT) ----
    def ingest(self, nodes, edges, leads=None, roots=None):
        """Accept a canonical {nodes, edges, leads} envelope, verifying —
        never minting — identities.  roots are DECLARED node ids (never
        inferred); with no roots the wall makes no reachable/unused claims."""
        nodes = deepcopy(list(nodes))
        edges = deepcopy(list(edges))
        leads = deepcopy(list(leads)) if leads else []
        roots = list(roots) if roots else []

        # (0) leads segregation pre-scan: a lead is not an edge, ever.
        for i, e in enumerate(edges):
            if isinstance(e, dict) and e.get("resolved") is False:
                self._reject_ingest("lead-in-edges",
                                    f"edges[{i}] carries resolved=false — a lead, "
                                    f"never carried in edges[]")
        for i, l in enumerate(leads):
            if isinstance(l, dict) and l.get("resolved") is True:
                self._reject_ingest("lead-in-edges",
                                    f"leads[{i}] carries resolved=true — an edge, "
                                    f"never carried in leads[]")

        # (1) canonical envelope validation (cell's own validate.py).
        graph = {"schemaVersion": SCHEMA_PIN_VERSION, "nodes": nodes,
                 "edges": edges, "leads": leads}
        conforms, errors = validate_graph(graph, self._schema)
        if not conforms:
            self._reject_ingest("graphjson-nonconformant",
                                f"envelope violates schema.json: {errors}")

        # (2) NODE ids: format + uniqueness.  Full node-preimage verification
        # is IMPOSSIBLE from Node fields alone (preimage needs canonicalName +
        # structural path, which Node.name does not reliably carry) — an
        # honest wall-level bound, documented in MEMBRANE-SPEC.md and closed
        # by the Phase-2 seam test via extractor.t1.node.id probes.
        format_violations = [n["id"] for n in nodes
                             if not _NODE_ID_RE.match(n.get("id", ""))]
        seen, duplicates = set(), []
        for n in nodes:
            if n["id"] in seen:
                duplicates.append(n["id"])
            seen.add(n["id"])
        node_ok = not format_violations and not duplicates
        self._bus.emit("graph-model.wall.ingest.verify.nodeIds", _WALL_STAGE,
                       "decision",
                       {"checked": len(nodes), "formatViolations": format_violations,
                        "duplicates": duplicates, "pass": node_ok},
                       cause=self._version_ref)
        if format_violations:
            self._reject_ingest("id-mismatch",
                                f"node ids not of form n_<16 hex>: {format_violations}")
        if duplicates:
            self._reject_ingest("id-collision",
                                f"duplicate node ids — two nodes would silently "
                                f"merge: {duplicates}")

        # (3) EDGE ids (edges AND leads): recompute every preimage from the
        # edge's own fields via the canonical mint; reject byte-mismatch.
        mismatches = []
        for e in edges + leads:
            ident = compute_edge_identity(e["kind"], e["srcId"], e["dstId"])
            if ident["edgeId"] != e["id"]:
                mismatches.append({"claimed": e["id"], "recomputed": ident["edgeId"],
                                   "kind": e["kind"], "srcId": e["srcId"],
                                   "dstId": e["dstId"]})
        self._bus.emit("graph-model.wall.ingest.verify.edgeIds", _WALL_STAGE,
                       "decision",
                       {"checked": len(edges) + len(leads),
                        "mismatches": mismatches, "pass": not mismatches},
                       cause=self._version_ref)
        if mismatches:
            self._reject_ingest("id-mismatch",
                                f"edge ids do not match their recomputed "
                                f"preimages: {mismatches}")

        # (4) unresolved leads carry the canonical placeholder prefix.
        lead_violations = [l["id"] for l in leads
                           if not str(l.get("dstId", "")).startswith(UNRESOLVED_PREFIX)]
        self._bus.emit("graph-model.wall.ingest.verify.leads", _WALL_STAGE,
                       "decision",
                       {"checked": len(leads), "violations": lead_violations,
                        "pass": not lead_violations}, cause=self._version_ref)
        if lead_violations:
            self._reject_ingest("lead-placeholder-violation",
                                f"lead dstIds missing the {UNRESOLVED_PREFIX!r} "
                                f"placeholder prefix: {lead_violations}")

        # (5) honest-fill gate (S4 green_guard semantics at the wall): a green
        # fill on an ingested node whose provenance does not attest a checked
        # origin is exactly the fake-green S4 forbids.  Policy: green requires
        # origin == "checked" AND a fill.source that is neither empty nor the
        # skeleton's no-compiler default.
        for n in nodes:
            if n["fill"]["status"] != "green":
                continue  # non-green fills pass through untouched (honest ceiling)
            attested = (n.get("origin") == "checked"
                        and n["fill"].get("source", "") not in
                        ("", HONEST_FILL["source"]))
            guard = green_guard("green", verdict_source_available=attested)
            self._bus.emit("graph-model.wall.ingest.greenGuard", _WALL_STAGE,
                           "decision", {"nodeId": n["id"], **guard},
                           cause=self._version_ref)
            if not guard["allowedGreen"]:
                self._reject_ingest(
                    "fake-green",
                    f"node {n['id']} carries a green fill without an attested "
                    f"verdict source (origin={n.get('origin')!r}, "
                    f"fill.source={n['fill'].get('source')!r})")

        # (6) roots are DECLARED node ids; each must be a decl (non-module) node.
        universe = {n["id"] for n in nodes if n["kind"] != "module"}
        for r in roots:
            if r not in universe:
                self._reject_ingest("unknown-root",
                                    f"declared root {r!r} is not a decl node in "
                                    f"the ingested graph")

        self._state = {"nodes": nodes, "edges": edges, "leads": leads,
                       "roots": roots}
        self._bus.emit("graph-model.wall.ingest.accepted", _WALL_STAGE, "decision",
                       {"nodeCount": len(nodes), "edgeCount": len(edges),
                        "leadCount": len(leads), "rootIds": list(roots)},
                       cause=self._version_ref)
        return {"wallVersion": WALL_VERSION, "accepted": True,
                "nodeCount": len(nodes), "edgeCount": len(edges),
                "leadCount": len(leads), "rootIds": list(roots)}
