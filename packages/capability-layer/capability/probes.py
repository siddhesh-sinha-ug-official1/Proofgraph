"""Probe bus — the observability substrate of the Capability Layer cell (Tree 2).

Implements the PROBE DENSITY CONTRACT:
  * a uniform ProbeEvent shape (probeId/cellId/stage/kind/payload/logicalClock/causeId/wallNanos),
  * a self-describing catalog (probeCatalog()) — a lead that fires but is not catalogued
    raises ProbeError (contract: "a lead that exists but isn't in the catalog is a bug"),
  * tap() live subscriptions,
  * deterministic ordering by logicalClock (wallNanos is a SEPARATE field, never ordered on),
  * secrets are the one redaction (presence + last-4).

The bus is shared vasculature: every stage of the pipeline emits through one ProbeBus
instance created per capability(lang) run.
"""

# SUB200 restructure: this module is the FACADE over the split bus/catalog
# modules -- the full public surface is re-exported unchanged, and importing
# the two catalog section modules (in original source order) performs the
# exact same 89 registrations as the original single file.
from .probes_bus import (  # noqa: F401  (re-exported public surface)
    CELL_ID, SECRET_KEYS, VALID_KINDS, ProbeBus, ProbeError, catalog_entry,
    probeCatalog, register, tap)
from .probes_bus import (  # noqa: F401  (shared internals, same objects)
    _CATALOG, _TAPS, _TAPS_LOCK, _redact)
from . import probes_catalog_ae as _catalog_ae  # noqa: F401  (registers A-E)
from . import probes_catalog_fj as _catalog_fj  # noqa: F401  (registers F-J)
from .probes_catalog_fj import _PROBE_RESULT_T  # noqa: F401
