"""The wall package: base (constants, failure classes, pins, refusals),
ingest (VERIFY-NOT-MINT + greenGuard), queries (query/project/verdictOf),
core (assembly + factory).  ../wall.py is the facade external consumers load;
it re-exports exactly this surface."""
from src.wall.base import (PROJECT_KINDS, QUERY_KINDS, SCHEMA_PIN_HASH,
                           SCHEMA_PIN_VERSION, UNRESOLVED_PREFIX, WALL_VERSION,
                           WallRejection, _WallPins)
from src.wall.core import GraphModelWall, create_wall

__all__ = ["WALL_VERSION", "SCHEMA_PIN_VERSION", "SCHEMA_PIN_HASH",
           "UNRESOLVED_PREFIX", "QUERY_KINDS", "PROJECT_KINDS",
           "WallRejection", "GraphModelWall", "create_wall"]
