"""hub/server_surfaces.py — served state surfaces: /graph/truth (the pin-
surface leg), /analysis (attached canonical bytes), /fs/roots-candidates,
and the aggregated /pins/* diagnostic surface.

SUB200 restructure: split out of hub/server.py; SurfacesMixin is composed
into HubServer by the facade (hub/server.py — which itself keeps
render_graph_payload, the /graph serializer-seam leg).  Behavior unchanged.
"""
from __future__ import annotations

# hub is import-flat by design (no __init__.py) — flat imports only.
import pipeline as hub_pipeline

HubError = hub_pipeline.HubError
HUB_VERSION = hub_pipeline.HUB_VERSION
SCHEMA_PIN_VERSION = hub_pipeline.SCHEMA_PIN_VERSION


class SurfacesMixin:
    """HubServer's truth/analysis/roots/pins faces (state on HubServerCore)."""

    def roots_candidates(self) -> dict:
        """The root-picker's feed: decl-kind nodes of the CURRENT envelope
        {id, name, kind, file} — module nodes EXCLUDED (model-wall roots are
        DECL ids; a module offered here would refuse downstream as
        unknown-root — V3's root-vocabulary-mismatch lesson).  Read from the
        model wall's projection (the same wall /graph serves), never a cached
        copy.  Roots remain DECLARED — this lists candidates, it never picks."""
        pl = self._pipeline
        if pl is None:
            raise HubError("no-graph-ingested",
                           "no pipeline run has produced a graph yet")
        envelope = pl["modelWall"].project("graph")
        candidates = [{"id": n["id"], "name": n["name"], "kind": n["kind"],
                       "file": n["span"]["file"]}
                      for n in envelope["nodes"] if n["kind"] != "module"]
        candidates.sort(key=lambda c: (c["name"], c["id"]))
        self.log.emit("hub.serve.rootsCandidates",
                      {"count": len(candidates),
                       "excludedModules": len(envelope["nodes"]) - len(candidates)})
        return {"candidates": candidates, "count": len(candidates),
                "note": "roots are DECLARED, never inferred — module nodes "
                        "excluded (model-wall roots are decl ids)"}

    # ---- /graph/truth (V4: the model wall's PIN-SURFACE truth) ----------------
    def render_truth_payload(self) -> tuple[bytes, dict]:
        """The second leg of V4's three-way equality gate: the envelope rebuilt
        from modelWall.pins.dump()['wall']['ingested'] — the model wall's PIN
        surface, the same surface V3 asserted on in-process — and serialized
        DIRECTLY via the canonical serializer (hub_pipeline.canonical_json_bytes),
        deliberately BYPASSING the /graph serializer seam (self._graph_serializer).
        A cheap or tampered /graph path therefore cannot also corrupt this leg;
        the client-side gate (app/src/graphSource.ts) compares the two id-set-
        and byte-wise and names any divergence serializer-edge-drop."""
        pl = self._pipeline
        if pl is None:
            raise HubError("no-graph-ingested",
                           "no pipeline run has produced a graph yet")
        ingested = pl["modelWall"].pins.dump()["wall"]["ingested"]
        if not ingested:
            raise HubError("no-graph-ingested",
                           "the model wall's pin surface carries no ingested state")
        envelope = {"schemaVersion": SCHEMA_PIN_VERSION,
                    "nodes": ingested["nodes"], "edges": ingested["edges"],
                    "leads": ingested["leads"]}
        payload = hub_pipeline.canonical_json_bytes(envelope)
        counts = {key: len(ingested[key]) for key in ("nodes", "edges", "leads")}
        return payload, counts

    # ---- /analysis (Phase 3 additive: the outer wall's computed analysis) ----
    def attach_analysis(self, analysis: dict, note: str = "") -> bytes:
        """Store the outer wall's analyze() result as CANONICAL bytes.
        GET /analysis serves exactly these bytes (byte-for-byte equal to
        canonical_json(analyze(...)) — the outer-wall contract).  The hub
        adds no interpretation; attaching is explicit and logged."""
        payload = hub_pipeline.canonical_json_bytes(analysis)
        self._analysis_payload = payload
        self.log.emit("hub.analysis.attach", {
            "bytes": len(payload),
            "keys": sorted(analysis) if isinstance(analysis, dict) else None,
            "note": note})
        return payload

    def render_analysis_payload(self) -> bytes:
        if self._analysis_payload is None:
            raise HubError("no-analysis-computed",
                           "no analyze() result has been attached — the hub "
                           "never fabricates an analysis")
        return self._analysis_payload

    # ---- /pins aggregation ---------------------------------------------------
    def pins_catalog(self) -> dict:
        cells = {}
        pl = self._pipeline or {}
        for name, wall_key in (("structure-extractor", "extractorWall"),
                               ("graph-model", "modelWall")):
            wall = pl.get(wall_key)
            if wall is None:
                cells[name] = {"available": False,
                               "reason": "no pipeline run has stood this wall up yet"}
            else:
                catalog = wall.pins.probeCatalog()
                cells[name] = {"available": True, "catalogSize": len(catalog),
                               "catalog": catalog}
        if self._capability_pins is None:
            cells["capability-layer"] = {
                "available": False,
                "reason": "no capability wall attached this run (extractor "
                          "stub capability_fn in use; V1 plugs the real wall)"}
        else:
            catalog = self._capability_pins.probeCatalog()
            cells["capability-layer"] = {"available": True,
                                         "catalogSize": len(catalog),
                                         "catalog": catalog}
        out = {"hub": {"hubVersion": HUB_VERSION,
                       "catalogSize": len(hub_pipeline.HUB_PROBE_CATALOG),
                       "catalog": self.log.catalog()},
               "cells": cells}
        self.log.emit("hub.pins.catalog",
                      {"cells": {k: v.get("catalogSize") for k, v in cells.items()}})
        return out

    def pins_history(self, limit: int | None = None) -> dict:
        """Aggregated probe histories — {hub:{...}, cells:{...}}.  Each stream
        is tail-bounded to `limit` events; ANY truncation is flagged in the
        payload AND logged (hub.pins.history.truncated) — never silent."""
        limit = self._pins_stream_limit if limit is None else max(1, int(limit))
        truncations = {}

        def bounded(events: list) -> dict:
            total = len(events)
            truncated = total > limit
            return {"events": events[-limit:] if truncated else events,
                    "total": total, "truncated": truncated,
                    "bound": limit, "boundKind": "tail"}

        pl = self._pipeline or {}
        cells = {}
        for name, wall_key in (("structure-extractor", "extractorWall"),
                               ("graph-model", "modelWall")):
            wall = pl.get(wall_key)
            if wall is None:
                cells[name] = {"available": False,
                               "reason": "no pipeline run has stood this wall up yet"}
                continue
            section = bounded(wall.pins.history())
            section["available"] = True
            cells[name] = section
            if section["truncated"]:
                truncations[name] = section["total"]
        if self._capability_pins is None:
            cells["capability-layer"] = {
                "available": False,
                "reason": "no capability wall attached this run (extractor "
                          "stub capability_fn in use; V1 plugs the real wall)"}
        else:
            section = bounded(self._capability_pins.history())
            section["available"] = True
            cells["capability-layer"] = section
            if section["truncated"]:
                truncations["capability-layer"] = section["total"]

        hub_section = bounded(self.log.history())
        if hub_section["truncated"]:
            truncations["hub"] = hub_section["total"]
        if truncations:
            self.log.emit("hub.pins.history.truncated",
                          {"bound": limit, "streamsTruncated": truncations,
                           "note": "tail-bounded per stream; totals carried in "
                                   "the payload — truncation logged, not silent"})
        self.log.emit("hub.pins.history", {"bound": limit,
                                           "truncated": sorted(truncations)})
        return {"hub": hub_section, "cells": cells}
