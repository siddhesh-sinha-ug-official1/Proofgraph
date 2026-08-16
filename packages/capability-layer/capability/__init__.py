"""ProofGraph Tree 2 — the Capability Layer cell.

Exports (build prompt §11):
  capability(lang, repo) -> Capability
  probeCatalog() / dump() / history() / tap(probeId, fn)
"""

from .capability import Capability, capability, dump, history
from .probes import probeCatalog, tap

__all__ = ["Capability", "capability", "dump", "history", "probeCatalog", "tap"]
