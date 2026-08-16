"""The probe catalog: every lead this cell can emit, enumerated (Contract 3.3).

A lead that fires but is absent from this catalog is a bug — the bus enforces
that at emit time (a `CatalogHoleError`).  No sampling, no gating, no silent
drop anywhere (Contract 3.5).

This module is the AGGREGATOR: the section lists live in leads_pipeline.py
(6.1–6.4), leads_analysis.py (6.5–6.9) and leads_wall.py (wall.*); they are
spliced here in the frozen order, element-for-element identical to the
original single-file catalog.
"""
from .leads_analysis import ANALYSIS_LEADS
from .leads_pipeline import PIPELINE_LEADS
from .leads_wall import WALL_LEADS

CELL_ID = "graph-model"

STAGES = ["schema", "ingest", "node", "edge", "fill", "t3", "project", "roundtrip"]

# (probeId, kind, payloadType, description) — sections spliced in frozen order
_SEMANTIC = PIPELINE_LEADS + ANALYSIS_LEADS

# ---- wall (Phase-1 wall decisions; ADDITIVE — consumed by ../../wall.py) ----
_WALL_SEMANTIC = WALL_LEADS

_BOUNDARY_KINDS = {"__in": "input", "__out": "output", "__timing": "timing"}
_BOUNDARY_DESC = {
    "__in": "uniform stage boundary: the typed object the stage received (the prior stage's output)",
    "__out": "uniform stage boundary: the typed object the stage produced; __in(n+1) MUST deep-equal __out(n)",
    "__timing": "uniform stage boundary: wall-clock timing; NEVER used for ordering or assertions (Contract 6)",
}


def _build_catalog():
    entries = []
    for probe_id, kind, ptype, desc in _SEMANTIC:
        entries.append({"probeId": probe_id, "kind": kind, "payloadType": ptype,
                        "description": desc})
    for stage in STAGES:
        for suffix, kind in _BOUNDARY_KINDS.items():
            ptype = ("{stage,wallNanosStart,wallNanosEnd,deltaNanos}"
                     if suffix == "__timing" else "PipelineCtx")
            entries.append({
                "probeId": f"{CELL_ID}.{stage}.{suffix}",
                "kind": kind,
                "payloadType": ptype,
                "description": _BOUNDARY_DESC[suffix],
            })
    baseline_size = len(entries)  # the pre-wall catalog (104) — frozen, never shrinks
    for probe_id, kind, ptype, desc in _WALL_SEMANTIC:
        entries.append({"probeId": probe_id, "kind": kind, "payloadType": ptype,
                        "description": desc})
    ids = [e["probeId"] for e in entries]
    assert len(ids) == len(set(ids)), "duplicate probeId in catalog"
    return entries, baseline_size


CATALOG, BASELINE_CATALOG_SIZE = _build_catalog()
CATALOG_BY_ID = {e["probeId"]: e for e in CATALOG}
