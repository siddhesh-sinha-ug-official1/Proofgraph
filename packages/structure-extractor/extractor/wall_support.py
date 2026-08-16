"""Wall support — named failure classes, the face-level envelope guard, the
pins accessor, and config merging (the schema-PIN assertion is wall_pin.py).

Split from wall.py (SUB200 restructure).  wall.py stays the promoted face and
re-exports every name here, so `from wall import ...` is unchanged.  This
module lives INSIDE the extractor package (not at the cell root) so vessel
pathing's top-package shadowing guarantees cover it — the cell root only ever
contributes `wall.py` + the `extractor` package to sys.path.
"""
from __future__ import annotations

from dataclasses import replace as _dc_replace
from pathlib import Path
from typing import Callable

from extractor import schema as cell_schema
from extractor.assemble import (FakedEdgeError, TierInflationError,
                                UnbackedGreenError)
from extractor.capability import CapabilityHandle
from extractor.pipeline import PipelineConfig
from extractor.probe import ProbeEvent


# ---- named failure classes (wall convention rule 7) -------------------------

class WallRefusal(RuntimeError):
    """Base of every wall-raised refusal; carries .failure_class."""
    failure_class = "wall-refusal"

    def __init__(self, detail: str):
        super().__init__(f"failure-class={self.failure_class}: {detail}")
        self.detail = detail


class WallSchemaPinMismatch(WallRefusal):
    """The wall refuses to stand on a drifted (or unverifiable) schema."""
    failure_class = "schema-pin-mismatch"


class UnknownLanguageError(WallRefusal):
    """honestCeiling(lang) for a language outside the Frozen-Schema set —
    consistent with the capability wall's vocabulary: no depth tier (CT/S/G/P)
    exists for it and the wall will not fabricate one (unknown != green)."""
    failure_class = "unknown-language"


class LeadInEdgesError(WallRefusal):
    """A lead (resolved=false / placeholder dst) surfaced in edges[], a
    resolved row surfaced in leads[], or a lead lost its placeholder prefix."""
    failure_class = "lead-in-edges"


class IdMismatchError(WallRefusal):
    """An envelope edge id does not recompute under the canonical mint."""
    failure_class = "id-mismatch"


#: Every failure class the wall can raise or let propagate, by name.
#: tier-inflation / faked-edge / unbacked-green are raised by the CELL's
#: assemble guards and propagate through extract() unwrapped — the wall never
#: swallows them.  (unbacked-green: LEAN-DOCK round — a green fill without a
#: kernel attestation, origin != "checked", or a non-CT tier.)
FAILURE_CLASSES: dict[str, type] = {
    "schema-pin-mismatch": WallSchemaPinMismatch,
    "unknown-language": UnknownLanguageError,
    "lead-in-edges": LeadInEdgesError,
    "id-mismatch": IdMismatchError,
    "tier-inflation": TierInflationError,
    "faked-edge": FakedEdgeError,
    "unbacked-green": UnbackedGreenError,
}


# ---- face-level envelope guard ----------------------------------------------

def validate_envelope(envelope: dict) -> None:
    """The wall's own honesty check on the face it is about to declare:
    edges[] is resolved-only, leads[] is placeholder-prefixed unresolved-only,
    and every id recomputes under the canonical mint.  Raises named classes."""
    if envelope.get("schemaVersion") != cell_schema.SCHEMA_VERSION:
        raise WallSchemaPinMismatch(
            f"envelope schemaVersion {envelope.get('schemaVersion')!r} != "
            f"{cell_schema.SCHEMA_VERSION!r}")
    for e in envelope["edges"]:
        if e["resolved"] is not True or e["dstId"].startswith(cell_schema.UNRESOLVED_PREFIX):
            raise LeadInEdgesError(
                f"edge {e['id']} in edges[] is a lead (resolved={e['resolved']!r}, "
                f"dstId={e['dstId']!r}) — resolved=false is a lead, never an edge")
        _check_edge_id(e)
    for l in envelope["leads"]:
        if l["resolved"] is not False:
            raise LeadInEdgesError(
                f"lead {l['id']} in leads[] claims resolved={l['resolved']!r}")
        if not l["dstId"].startswith(cell_schema.UNRESOLVED_PREFIX):
            raise LeadInEdgesError(
                f"lead {l['id']} dstId {l['dstId']!r} lacks the "
                f"{cell_schema.UNRESOLVED_PREFIX!r} placeholder prefix")
        _check_edge_id(l)


def _check_edge_id(e: dict) -> None:
    eid, _ = cell_schema.edge_id(e["kind"], e["srcId"], e["dstId"])
    if eid != e["id"]:
        raise IdMismatchError(
            f"edge {e['id']}: canonical mint recomputes {eid} for "
            f"({e['kind']!r}, {e['srcId']!r}, {e['dstId']!r})")


# ---- pins accessor (wall convention rule 3) ----------------------------------

class WallPins:
    """The cell's existing diagnostic quartet, reachable THROUGH the wall.
    Delegates to the wall's single underlying cell: one wall = one probe
    stream (construction pin-check + every extract, causally ordered)."""

    def __init__(self, wall):
        self._wall = wall

    def probeCatalog(self) -> list[dict]:
        return self._wall._cell.probeCatalog()

    def dump(self) -> dict:
        return self._wall._cell.dump()

    def history(self, strip_wall: bool = False) -> list[dict]:
        return self._wall._cell.history(strip_wall=strip_wall)

    def tap(self, probe_id: str, fn: Callable[[ProbeEvent], None]) -> None:
        self._wall._cell.tap(probe_id, fn)


# ---- config merging -----------------------------------------------------------

def _merge_config(config: PipelineConfig | dict | None,
                  capability_fn: Callable[[str], CapabilityHandle] | None,
                  out_dir: str | Path | None) -> PipelineConfig:
    if config is None:
        cfg = PipelineConfig()
    elif isinstance(config, PipelineConfig):
        cfg = _dc_replace(config)
    elif isinstance(config, dict):
        cfg = PipelineConfig(**config)   # unknown keys fail loudly (typed face)
    else:
        raise TypeError(
            f"config must be PipelineConfig | dict | None, got {type(config).__name__}")
    if capability_fn is not None:
        cfg.capability_fn = capability_fn
    if out_dir is not None:
        cfg.out_dir = Path(out_dir)
    return cfg
