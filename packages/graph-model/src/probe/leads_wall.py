"""Catalog section: wall leads (Phase-1 wall decisions; ADDITIVE — consumed
by ../../wall.py).  The wall promotes a minimal face OVER these pins; every
wall decision lands here so conformance can assert face == pin truth.
Baseline catalog entries (leads_pipeline/leads_analysis + boundaries) are
frozen; this section only ever GROWS (walls never shrink catalogs).
"""

# (probeId, kind, payloadType, description)
WALL_LEADS = [
    ("graph-model.wall.version", "state", "{wallVersion,schemaVersion,schemaHash}",
     "the wall stood up: WALL_VERSION plus the schema PIN it asserted at construction"),
    ("graph-model.wall.ingest.verify.nodeIds", "decision",
     "{checked,formatViolations,duplicates,pass}",
     "node-id format (^n_[0-9a-f]{16}$) + uniqueness verification; full preimage "
     "verification is IMPOSSIBLE from Node fields alone — a documented honest bound, "
     "closed by the Phase-2 seam test via extractor.t1.node.id probes"),
    ("graph-model.wall.ingest.verify.edgeIds", "decision", "{checked,mismatches,pass}",
     "verify-not-mint: every edge AND lead id recomputed from its own "
     "(kind,srcId,dstId) via the canonical mint and byte-compared"),
    ("graph-model.wall.ingest.verify.leads", "decision", "{checked,violations,pass}",
     "every lead dstId must carry the canonical 'unresolved:' placeholder prefix"),
    ("graph-model.wall.ingest.greenGuard", "decision",
     "{nodeId,requestedGreen,allowedGreen,reason}",
     "the wall's fake-green policy: a green fill is rejected unless origin=checked "
     "AND fill.source attests a real verdict source (reuses S4 green_guard semantics)"),
    ("graph-model.wall.ingest.accepted", "decision",
     "{nodeCount,edgeCount,leadCount,rootIds}",
     "the envelope passed validation + verification and is now the wall's ingested graph"),
    ("graph-model.wall.ingest.rejected", "decision", "{failureClass,detail}",
     "the envelope was refused, with the NAMED failure class (emitted before the raise)"),
    ("graph-model.wall.query", "value", "{kind,args,result}",
     "one wall query answered — the result must equal pin-level T3 truth (conformance)"),
    ("graph-model.wall.query.rejected", "decision", "{kind,failureClass,reason}",
     "a query honestly refused (e.g. unused with no declared roots — roots are "
     "DECLARED, never inferred; no roots means no unused claim)"),
    ("graph-model.wall.verdict", "value", "{nodeId,fill,outline}",
     "verdictOf pass-through: the stored node's fill/outline, never invented "
     "(outline may be null — passed through as such)"),
    ("graph-model.wall.project", "value", "{kind,available}",
     "a projection served from ingested data ('graph' or 'flat')"),
    ("graph-model.wall.projection.refused", "decision", "{kind,failureClass,reason}",
     "a projection honestly refused (e.g. 'text' needs byte-source/manifest material "
     "that ingest(nodes,edges) does not carry — never faked)"),
]
