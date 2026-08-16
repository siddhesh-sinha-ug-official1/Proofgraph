"""GraphModelWall assembly: construction (the schema-PIN assertion), the pins
property, and the create_wall factory.

The wall asserts the canonical schema PIN at construction and refuses loudly
to stand on a drifted schema (failure class: schema-pin-mismatch).
"""
import json
from pathlib import Path

from src.cell import GraphModelCell
from src.schema_tools import SchemaPinMismatch, check_pin, schema_hash
from src.wall.base import (SCHEMA_PIN_HASH, SCHEMA_PIN_VERSION, WALL_VERSION,
                           WallRejection, _WallPins, _RefusalMixin, _WALL_STAGE)
from src.wall.ingest import _IngestFace
from src.wall.queries import _QueryFace

_CELL_ROOT = Path(__file__).resolve().parents[2]


class GraphModelWall(_IngestFace, _QueryFace, _RefusalMixin):
    def __init__(self, cell_root=None):
        self._cell = GraphModelCell(cell_root or _CELL_ROOT)
        self._bus = self._cell.bus
        self._state = None  # {"nodes","edges","leads","roots"} once ingested

        schema_path = self._cell.cell_root / "schema" / "schema.json"
        schema_obj = json.loads(schema_path.read_text(encoding="utf-8"))
        try:
            check_pin(SCHEMA_PIN_VERSION, SCHEMA_PIN_HASH,
                      schema_obj.get("schemaVersion"), schema_hash(schema_obj))
        except SchemaPinMismatch as exc:
            # refuse loudly to stand on a drifted schema; nothing else runs
            raise WallRejection("schema-pin-mismatch", str(exc)) from exc
        self._schema = schema_obj

        self._version_ref = self._bus.emit(
            "graph-model.wall.version", _WALL_STAGE, "state",
            {"wallVersion": WALL_VERSION, "schemaVersion": SCHEMA_PIN_VERSION,
             "schemaHash": SCHEMA_PIN_HASH})

    # ---- pins (the quartet stays reachable through the wall) ----
    @property
    def pins(self):
        return _WallPins(self._cell, self)


def create_wall(cell_root=None):
    """Factory face (WALL-CONVENTIONS: wall factory + WALL_VERSION)."""
    return GraphModelWall(cell_root)
