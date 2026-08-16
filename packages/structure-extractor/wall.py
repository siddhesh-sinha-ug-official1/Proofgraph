"""structure-extractor WALL — Phase 1 (WALL-CONVENTIONS.md; face frozen by SEAM-MAP.md).

The minimal, clean, versioned, typed face this cell presents to its neighbors,
promoted OVER the diagnostic pins — never replacing them:

    from wall import extract_wall, WALL_VERSION

    wall = extract_wall()
    env  = wall.extract(root)            # {schemaVersion:"v0", nodes, edges, leads,
                                         #  honestCeilings} — the canonical envelope
    wall.honestCeiling("python")         # the dock's declared ceiling (or typed refusal)
    wall.pins.probeCatalog()             # the full diagnostic quartet stays reachable:
    wall.pins.dump()                     #   probeCatalog / dump / history / tap
    wall.pins.history()                  #   ("10 Fitbit pins under the 2-pin charger")
    wall.pins.tap(id, fn)

Rules this module enforces (see MEMBRANE-SPEC.md for the one-page contract):
  * The wall asserts the schema PIN at construction AND before every extract():
    it refuses to stand on a drifted schema (failure class schema-pin-mismatch).
  * The face returns ONLY the canonical envelope + per-dock honest ceilings.
    t3/summary/decisions stay PINS (pins.dump()/history()) — the composed-graph
    gap analysis happens in Phase 3 over the whole organism, so the cell's
    internal t3 is diagnostic, not the wall face.
  * Honest ceiling propagates: an undeclared or unknown ceiling surfaces as
    such — the wall never fabricates a tier, a verdict, or green.
  * Every wall rejection is a NAMED failure class (FAILURE_CLASSES), and
    every wall decision is probed via catalogued extractor.wall.* leads.

V1 socket (capability wall -> extractor wall): `capability_fn` on extract() is
the formalized injection point; it defaults to the cell's local stub_capability.
KNOWN FRICTION, deliberately NOT fixed here (vessel work, not wall work):
CapabilityHandle.handle is never consumed by ExtractorCell._make_dock — the
python dock builds its own pyright backend from PipelineConfig.  Wiring Tree
2's real negotiated handle requires a Phase-2 adapter touching _make_dock.

SUB200 restructure: failure classes, the envelope guard, the pins accessor and
config merging live in extractor/wall_support.py; the schema-PIN assertion in
extractor/wall_pin.py; this module re-exports every one of them (facade —
`from wall import ...` is byte-for-byte the same surface).
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable

from extractor import schema as cell_schema
from extractor.assemble import (FakedEdgeError, TierInflationError,  # noqa: F401
                                UnbackedGreenError)
from extractor.capability import CapabilityHandle, stub_capability  # noqa: F401 (face re-export)
from extractor.pipeline import ExtractorCell, PipelineConfig
from extractor.wall_pin import assert_schema_pin
from extractor.wall_support import (FAILURE_CLASSES, IdMismatchError,  # noqa: F401
                                    LeadInEdgesError, UnknownLanguageError,
                                    WallPins, WallRefusal,
                                    WallSchemaPinMismatch, _merge_config,
                                    validate_envelope)

WALL_VERSION = "structure-extractor-wall/1.0.0"

_STAGE = "WALL"


class ExtractorWall:
    """The Phase-1 face of tree3.structure-extractor (see module docstring)."""

    WALL_VERSION = WALL_VERSION

    def __init__(self, config: PipelineConfig | dict | None = None):
        self._base_config = _merge_config(config, None, None)
        self._cell = ExtractorCell(self._base_config)
        self.pins = WallPins(self)
        self._cell.bus.emit("extractor.wall.version", _STAGE, "state", {
            "wallVersion": WALL_VERSION,
            "pinnedSchemaVersion": cell_schema.PINNED_SCHEMA_VERSION,
            "pinnedSchemaHash": cell_schema.PINNED_SCHEMA_HASH})
        self._assert_schema_pin()

    # ---- schema PIN (wall convention rule 4; wall_support.assert_schema_pin)
    def _assert_schema_pin(self) -> None:
        assert_schema_pin(self._cell.bus)

    # ---- the face ------------------------------------------------------------
    def extract(self, root: str | Path,
                capability_fn: Callable[[str], CapabilityHandle] | None = None,
                out_dir: str | Path | None = None,
                config: PipelineConfig | dict | None = None) -> dict:
        """Run the cell over `root`, return the canonical Graph envelope
        {schemaVersion:"v0", nodes, edges, leads} + per-dock honestCeilings.

        `capability_fn` is the formalized V1 socket (defaults to the local
        stub_capability; Phase 2 plugs Tree 2's real function).  t3/summary
        do NOT cross the face — they stay pins (pins.dump()/history())."""
        base = config if config is not None else self._base_config
        cfg = _merge_config(base, capability_fn, out_dir)
        cell = self._cell
        cell.config = cfg
        self._assert_schema_pin()   # re-asserted before EVERY run, not just birth
        cell.bus.emit("extractor.wall.extract.call", _STAGE, "call", {
            "root": str(root),
            "capabilityFnInjected": capability_fn is not None,
            "outDir": str(cfg.out_dir) if cfg.out_dir is not None else None})
        result = cell.run(Path(root))
        envelope = {
            "schemaVersion": result["schemaVersion"],
            "nodes": result["nodes"],
            "edges": result["edges"],
            "leads": result["leads"],
            "honestCeilings": result["honestCeilings"],
        }
        try:
            validate_envelope(envelope)
        except WallRefusal as exc:
            cell.bus.emit("extractor.wall.refusal", _STAGE, "error",
                          {"failureClass": exc.failure_class, "detail": str(exc)})
            raise
        cell.bus.emit("extractor.wall.extract.return", _STAGE, "output", {
            "nodes": len(envelope["nodes"]), "edges": len(envelope["edges"]),
            "leads": len(envelope["leads"]),
            "docks": sorted(envelope["honestCeilings"])})
        return envelope

    def honestCeiling(self, lang: str) -> dict:
        """The dock's declared ceiling for `lang`, VERBATIM from the pin
        surface (== extractor.output.honest_ceiling.report perDock[lang]).

        * lang outside the Frozen-Schema set -> UnknownLanguageError (typed
          refusal, consistent with the capability wall's vocabulary: no depth
          tier CT/S/G/P exists for it and none is fabricated).
        * lang known but no dock ceiling declared in the last extract()
          (no run yet / no sources / no dock this round) -> an explicit
          undeclared surface {declared: False, tier: None, ...} — reduced
          surfaces as reduced, never green."""
        bus = self._cell.bus
        if lang not in cell_schema.LANGS:
            err = UnknownLanguageError(
                f"lang {lang!r} is outside the Frozen-Schema language set "
                f"{list(cell_schema.LANGS)}: no capability tier (CT/S/G/P) is "
                f"negotiated for it and the wall will not fabricate one "
                f"(unknown != green)")
            bus.emit("extractor.wall.honest_ceiling.request", _STAGE, "call",
                     {"lang": lang, "outcome": "refused-unknown-language"})
            bus.emit("extractor.wall.refusal", _STAGE, "error",
                     {"failureClass": err.failure_class, "detail": str(err)})
            raise err
        state = self._cell.dump()
        declared = {c["lang"]: c for c in state["honestCeilings"]}
        if lang in declared:
            bus.emit("extractor.wall.honest_ceiling.request", _STAGE, "call",
                     {"lang": lang, "outcome": "declared"})
            return declared[lang]
        sourcesets = state["sourcesets"]
        if not sourcesets:
            reason = "no extract() has run through this wall yet"
        elif lang not in sourcesets:
            reason = f"the last extract() ingested no {lang} sources"
        else:
            reason = (f"{lang} had sources but no T2 dock this round "
                      f"(Go/C/C++ are T1-only: structure nodes, zero resolved edges)")
        bus.emit("extractor.wall.honest_ceiling.request", _STAGE, "call",
                 {"lang": lang, "outcome": "undeclared"})
        return {
            "lang": lang,
            "declared": False,
            "tier": None,   # never fabricated: an unknown tier surfaces as unknown
            "resolves": [],
            "cannotResolve": ["everything — no dock ceiling was declared for this "
                              "language by the wall's last extract()"],
            "resolverGrade": "none (undeclared — an unknown ceiling is surfaced as "
                             "unknown, never fabricated)",
            "blindSpots": [reason],
        }


def extract_wall(config: PipelineConfig | dict | None = None) -> ExtractorWall:
    """Wall factory — the exported constructor neighbors use."""
    return ExtractorWall(config)


__all__ = [
    "WALL_VERSION", "ExtractorWall", "extract_wall", "WallPins",
    "PipelineConfig", "CapabilityHandle", "stub_capability",
    "validate_envelope", "FAILURE_CLASSES",
    "WallRefusal", "WallSchemaPinMismatch", "UnknownLanguageError",
    "LeadInEdgesError", "IdMismatchError", "TierInflationError", "FakedEdgeError",
    "UnbackedGreenError",
]
