"""probeCatalog() source of truth: the exhaustive §6 enumeration of leads.

Every probe the cell can emit is registered here, grouped by stage exactly as
in the build spec §6.  A lead that fires but is not listed here raises
UncataloguedProbeError (Probe Density Contract §3).  Entries that are
catalogued but dormant (the live-backend calls of the latex/typst DESIGN/STUB
docks, plus the lean dock's unwired InfoTree/lake backends — the CT path uses
the kernel-driver leads instead) say so in their description — the catalog
documents the designed surface, and the dormancy is itself visible.

Entry shape: (probeId, kind, payloadType, description)
"""
from __future__ import annotations

from .catalog_docks import CATALOG_DOCKS
from .catalog_docs_graph import CATALOG_DOCS_GRAPH
from .catalog_output_infra import CATALOG_OUTPUT_INFRA
from .catalog_stages import CATALOG_STAGES

# Aggregated IN SPEC ORDER (§6.0 → §6.14): the assembled catalog is
# element-for-element the pre-split enumeration — same ids, same order,
# same count.  Catalogs never shrink.
CATALOG: list[tuple[str, str, str, str]] = [
    *CATALOG_STAGES,        # §6.0–§6.2  cross-cutting / ingest / T1
    *CATALOG_DOCKS,         # §6.3–§6.5b dispatch / python / lean (+CT driver)
    *CATALOG_DOCS_GRAPH,    # §6.6–§6.9  latex / typst / assemble / T3
    *CATALOG_OUTPUT_INFRA,  # §6.10–§6.14 output / backends / provenance / wall
]
