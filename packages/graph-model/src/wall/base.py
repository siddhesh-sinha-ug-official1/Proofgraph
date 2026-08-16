"""Wall foundation: versions, the schema PIN, kind tables, the NAMED failure
classes, the pins accessor, and the probe-before-raise refusal mixin.

Every refusal carries a NAMED failure class (WallRejection.failure_class) and
is probed on the cell's own ProbeBus BEFORE it raises, so conformance can
assert declared behavior == probed behavior.
"""
import re
from copy import deepcopy

from src.errors import GateFailure

WALL_VERSION = "graph-model-wall/1.0.0"

# The canonical assembly PIN (packages/schema/PIN) — hard-coded on purpose:
# a wall pinned to the constitution fails fast, it does not re-read consent.
SCHEMA_PIN_VERSION = "v0"
SCHEMA_PIN_HASH = "3f3123699c45a8d906db0fe00f0830e0a9f25b9ce30586cfbf30337db6043d9c"

UNRESOLVED_PREFIX = "unresolved:"          # schema.json unresolvedPlaceholder
_NODE_ID_RE = re.compile(r"^n_[0-9a-f]{16}\Z")
_WALL_STAGE = "wall"

QUERY_KINDS = ("reachable", "unused", "sccs", "condensation")
PROJECT_KINDS = ("graph", "flat", "text")


class WallRejection(GateFailure):
    """A wall-level refusal.  failure_class is one of:
    schema-pin-mismatch, graphjson-nonconformant, lead-in-edges,
    lead-placeholder-violation, id-mismatch, id-collision, fake-green,
    unknown-root, roots-undeclared, no-graph-ingested, unknown-node,
    unknown-query, unknown-projection, projection-unavailable-no-source,
    t3-library-disagreement, condensation-not-dag."""


class _WallPins:
    """The pins accessor: the cell's existing diagnostic quartet, reachable
    THROUGH the wall (never replaced).  dump() delegates to the cell's dump
    and additively attaches the wall's own state under a 'wall' key."""

    def __init__(self, cell, wall):
        self._cell = cell
        self._wall = wall

    def probeCatalog(self):
        return self._cell.probeCatalog()

    def history(self):
        return self._cell.history()

    def tap(self, probe_id, callback):
        return self._cell.tap(probe_id, callback)

    def dump(self):
        d = self._cell.dump()
        d["wall"] = deepcopy({
            "wallVersion": WALL_VERSION,
            "schemaVersion": SCHEMA_PIN_VERSION,
            "schemaHash": SCHEMA_PIN_HASH,
            "ingested": self._wall._state,
        })
        return d


class _RefusalMixin:
    """internals: every refusal is probed BEFORE it raises."""

    def _reject_ingest(self, failure_class, detail):
        self._bus.emit("graph-model.wall.ingest.rejected", _WALL_STAGE, "decision",
                       {"failureClass": failure_class, "detail": detail},
                       cause=self._version_ref)
        raise WallRejection(failure_class, detail)

    def _reject_query(self, kind, failure_class, reason):
        self._bus.emit("graph-model.wall.query.rejected", _WALL_STAGE, "decision",
                       {"kind": kind, "failureClass": failure_class,
                        "reason": reason}, cause=self._version_ref)
        raise WallRejection(failure_class, f"query({kind!r}): {reason}")

    def _refuse_projection(self, kind, failure_class, reason):
        self._bus.emit("graph-model.wall.projection.refused", _WALL_STAGE,
                       "decision",
                       {"kind": kind, "failureClass": failure_class,
                        "reason": reason}, cause=self._version_ref)
        raise WallRejection(failure_class, f"project({kind!r}): {reason}")
