from .bus import (
    CELL_ID,
    CatalogEntry,
    ProbeBus,
    ProbeEvent,
    ProbeKindMismatchError,
    StageTimer,
    UncataloguedProbeError,
)
from .catalog import CATALOG


def make_bus() -> ProbeBus:
    """A fresh bus with the full §6 catalog registered."""
    bus = ProbeBus()
    bus.register_all(CATALOG)
    return bus


__all__ = [
    "CELL_ID", "CatalogEntry", "ProbeBus", "ProbeEvent", "StageTimer",
    "ProbeKindMismatchError", "UncataloguedProbeError", "CATALOG", "make_bus",
]
