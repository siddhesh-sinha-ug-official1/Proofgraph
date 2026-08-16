"""system_pins.py — the OUTERMOST diagnostic surface (cellId system.outerwall).

    pins = system_pins(analyze_session(...))
    pins.probeCatalog()   # every cell wall's catalog + hub catalog + the
                          # outer wall's own — one outermost header
    pins.dump()           # aggregated dumps, payload-BOUNDED (bounds LOGGED)
    pins.history()        # aggregated histories, per-stream tail bound LOGGED
    pins.tap(id, fn)      # routed to the owning stream (outerwall / hub /
                          # graph-model / structure-extractor)
    pins.trace(nodeId)    # the V4 TRACE mechanism, read + EXTENDED: every
                          # byte-identical appearance of one Node.id at every
                          # hop, with pin refs (vessels/TRACE-node.json is the
                          # recorded seed and is verified when it applies)

Aggregated sources:
  outerwall            the OuterLog analyze() wrote (own emissions)
  hub                  the HubLog the pipeline ran under
  structure-extractor  extractor wall pins (quartet, live)
  graph-model          model wall pins (quartet, live)
  capability-layer     per-lang pin-stream SNAPSHOTS taken by analyze()
                       BEFORE feed.shutdown() (cell 2's quartet is module-
                       global last-run state — the V1 report's bound 4;
                       snapshotting is the honest fix, and it is recorded)

Bounds (never silent — every application logged via outerwall.bound.logged):
  * per-stream TAIL bound (default 2000 events, hub idiom): history()'s
    streams AND the history streams dump() embeds (outerwall / hub /
    capability-layer);
  * per-payload byte bound (default 16384 canonical-json bytes): every
    history event payload, plus each whole cell dump dump() embeds
    (structure-extractor / graph-model) bounded as ONE payload — an
    oversized payload is REPLACED by {"truncated": true, sha256, byteLen}
    so evidence stays checkable.

SUB200 restructure: this module stays the FACADE (SystemPins + the
system_pins factory, unchanged surface); dump()/history()/bounds moved to
pins_streams.py (StreamsMixin) and trace() to pins_trace.py (TraceMixin),
both composed into SystemPins here.  Behavior identical.
"""
from __future__ import annotations

from . import (CELL_ID, OUTERWALL_VERSION, OuterwallError,
               SCHEMA_PIN_HASH, SCHEMA_PIN_VERSION)
from .pins_streams import StreamsMixin, _canon                 # noqa: F401
from .pins_trace import TRACE_SEED_PATH, TraceMixin            # noqa: F401

STREAM_TAIL_BOUND_DEFAULT = 2000
PAYLOAD_BYTE_BOUND_DEFAULT = 16384


class SystemPins(StreamsMixin, TraceMixin):
    """The aggregated quartet + trace().  Construct via system_pins()."""

    def __init__(self, session: dict,
                 stream_tail_bound: int = STREAM_TAIL_BOUND_DEFAULT,
                 payload_byte_bound: int = PAYLOAD_BYTE_BOUND_DEFAULT):
        self._session = session
        self._outer = session["outerLog"]
        self._hub = session["hubLog"]
        self._model = session["modelWall"]
        self._extractor = session["extractorWall"]
        self._capability = session.get("capabilityStreams") or {}
        self._tail = max(1, int(stream_tail_bound))
        self._payload_bound = max(64, int(payload_byte_bound))

    # ---- header --------------------------------------------------------------
    def _header(self) -> dict:
        return {"cellId": CELL_ID, "outerwallVersion": OUTERWALL_VERSION,
                "schemaPin": {"schemaVersion": SCHEMA_PIN_VERSION,
                              "schemaHash": SCHEMA_PIN_HASH}}

    # ---- catalog ---------------------------------------------------------------
    def probeCatalog(self) -> dict:
        sources = {
            "outerwall": self._outer.catalog(),
            "hub": self._hub.catalog(),
            "structure-extractor": self._extractor.pins.probeCatalog(),
            "graph-model": self._model.pins.probeCatalog(),
            "capability-layer": {
                lang: s["catalog"] for lang, s in self._capability.items()
            } if self._capability else {
                "available": False,
                "reason": "no live capability wall stood up this run "
                          "(stub mode or no measured language)"},
        }
        entries = []
        for src_name, cat in sources.items():
            rows = cat if isinstance(cat, list) else []
            if src_name == "capability-layer" and isinstance(cat, dict):
                rows = [r for v in cat.values() if isinstance(v, list)
                        for r in v]
            for row in rows:
                entries.append({"source": src_name,
                                "probeId": row.get("probeId"),
                                "kind": row.get("kind")})
        out = {**self._header(), "sources": sources, "entries": entries,
               "entryCount": len(entries)}
        self._outer.emit("outerwall.system.catalog",
                         {"entryCount": len(entries),
                          "sources": sorted(sources)})
        return out

    # ---- tap -------------------------------------------------------------------
    def tap(self, probe_id: str, fn):
        """Route a tap to the stream that owns probe_id.  Returns the untap
        callable where the underlying surface provides one (outerwall, hub,
        graph-model), else None (structure-extractor's own tap contract).

        [Wave-B D3] capability.* leads are catalogued at this surface (from
        the per-lang capability_streams SNAPSHOTS taken by analyze() before
        feed.shutdown()) but not live-tappable at the outer wall: the cell
        bus is gone by the time analyze() returns.  Rather than reject them
        as 'uncatalogued lead is a bug' (misleading — they ARE catalogued),
        we surface a TYPED failure class capability-tap-snapshot-only that
        names the honest reason.  Live capability taps must be registered
        BEFORE analyze() runs, at the cell (capability.tap(...)) — those
        continue to fire during the run, they just cannot be attached
        post-hoc through this aggregated surface."""
        from . import OUTERWALL_PROBE_CATALOG
        if probe_id in OUTERWALL_PROBE_CATALOG:
            owner, res = "outerwall", self._outer.tap(probe_id, fn)
        elif probe_id.startswith("hub."):
            owner, res = "hub", self._hub.tap(probe_id, fn)
        elif probe_id.startswith("graph-model."):
            owner, res = "graph-model", self._model.pins.tap(probe_id, fn)
        elif probe_id.startswith("extractor."):
            owner, res = ("structure-extractor",
                          self._extractor.pins.tap(probe_id, fn))
        elif probe_id.startswith("capability."):
            # Named typed refusal (D3): capability leads ARE catalogued at
            # this surface (as SNAPSHOTS taken pre-shutdown), so the old
            # "uncatalogued lead is a bug" message misled.  The bus is not
            # live at analyze() return; a live tap must be registered at
            # the cell (capability.tap) BEFORE analyze() runs — those
            # continue to fire during the run.
            raise OuterwallError(
                f"tap {probe_id!r}: failure-class="
                f"capability-tap-snapshot-only — capability-layer streams "
                f"are aggregated as SNAPSHOTS at the outer wall (taken "
                f"before feed.shutdown()); the cell bus is not live here. "
                f"Register the tap at the cell (capability.tap) BEFORE "
                f"analyze() runs to observe live capability.* leads.")
        else:
            raise OuterwallError(
                f"tap {probe_id!r}: no aggregated stream owns this probe — "
                f"an uncatalogued lead is a bug")
        self._outer.emit("outerwall.system.tap",
                         {"probeId": probe_id, "routedTo": owner})
        return res


def system_pins(session: dict, **bounds) -> SystemPins:
    """Factory face: system_pins(analyze_session(...)) -> SystemPins."""
    return SystemPins(session, **bounds)
