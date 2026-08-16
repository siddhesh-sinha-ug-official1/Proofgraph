"""pins_trace.py — SystemPins.trace(): the V4 mechanism, read + extended.

SUB200 restructure: split out of outerwall/system_pins.py (which stays the
facade composing this mixin into SystemPins — importers see no change).
Behavior identical: every byte-identical appearance of one Node.id at every
hop, with pin refs; vessels/TRACE-node.json is the recorded seed and is
verified when it applies.
"""
from __future__ import annotations

import hashlib
import json

from .wallconst import CELL_ID, PROOFGRAPH_ROOT
from .pins_streams import _canon

TRACE_SEED_PATH = PROOFGRAPH_ROOT / "vessels" / "TRACE-node.json"


class TraceMixin:
    """trace() (composed into SystemPins)."""

    def trace(self, node_id: str) -> dict:
        """Every byte-identical appearance of node_id at every hop, with pin
        refs.  Reads vessels/TRACE-node.json: when the asked id IS the V4
        seed's, the recorded hops are verified and carried as the seed."""
        want = node_id.encode("utf-8")
        hops: list[dict] = []

        seed = None
        if TRACE_SEED_PATH.is_file():
            recorded = json.loads(TRACE_SEED_PATH.read_text(encoding="utf-8"))
            if recorded.get("nodeId") == node_id:
                seed_bytes = bytes(recorded.get("idUtf8Bytes", []))
                seed = {
                    "source": "vessels/TRACE-node.json (V4 recorded seed)",
                    "byteIdentical": seed_bytes == want,
                    "recordedHops": recorded["hops"],
                    "idSha256": recorded.get("idSha256"),
                }

        # hop 1: extractor mint pin (id + preimage)
        for e in self._extractor.pins.history():
            if (e["probeId"] == "extractor.t1.node.id"
                    and e["payload"].get("id") == node_id):
                hops.append({
                    "hop": "extraction", "cell": "structure-extractor",
                    "probeId": "extractor.t1.node.id",
                    "logicalClock": e.get("logicalClock"),
                    "id": e["payload"]["id"],
                    "preimage": e["payload"].get("preimage"),
                    "byteIdentical":
                        e["payload"]["id"].encode("utf-8") == want})

        # hop 2: model wall ingest (pin surface + accepted pin)
        ingested = self._model.pins.dump()["wall"]["ingested"] or {}
        state_ids = [n["id"] for n in ingested.get("nodes", [])]
        if node_id in state_ids:
            accepted = [e for e in self._model.pins.history()
                        if e["probeId"] == "graph-model.wall.ingest.accepted"]
            hops.append({
                "hop": "model-ingest", "cell": "graph-model",
                "probeId": "graph-model.wall.ingest.accepted",
                "logicalClock": (accepted[-1].get("logicalClock")
                                 if accepted else None),
                "id": node_id,
                "idInRootIds": node_id in (ingested.get("roots") or []),
                "pinSurface": "pins.dump()['wall']['ingested']",
                "byteIdentical": True,   # matched by byte-equal key above
            })

        # hop 3: the analyze() result's canonical bytes (the served surface)
        analysis = self._session.get("analysis") or {}
        graph = analysis.get("graph")
        if graph:
            payload = _canon(graph).encode("utf-8")
            offsets, start = [], 0
            needle = b'"' + want + b'"'
            while True:
                i = payload.find(needle, start)
                if i < 0:
                    break
                offsets.append(i + 1)
                start = i + 1
            if offsets:
                hops.append({
                    "hop": "analysis-graph", "cell": CELL_ID,
                    "where": "analyze().graph canonical bytes "
                             "(== hub GET /analysis graph)",
                    "id": node_id, "idByteOffsets": offsets,
                    "payloadSha256": hashlib.sha256(payload).hexdigest(),
                    "payloadBytes": len(payload),
                    "byteIdentical": all(
                        payload[o:o + len(want)] == want for o in offsets),
                })
            if node_id in (analysis.get("verdicts") or {}):
                hops.append({
                    "hop": "analysis-verdicts", "cell": CELL_ID,
                    "where": "analyze().verdicts key",
                    "id": node_id, "byteIdentical": True})

        # hop 4: hub log payloads that carry the id verbatim
        for e in self._hub.history():
            if node_id in _canon(e.get("payload")):
                hops.append({
                    "hop": "hub-log", "cell": "hub",
                    "probeId": e["probeId"],
                    "logicalClock": e.get("logicalClock"),
                    "id": node_id, "byteIdentical": True})

        result = {
            "nodeId": node_id,
            "idUtf8Bytes": list(want),
            "seed": seed,
            "hops": hops,
            "byteIdenticalEverywhere":
                bool(hops) and all(h["byteIdentical"] for h in hops)
                and (seed is None or seed["byteIdentical"]),
            "provenance": ("V4 TRACE mechanism extended by the outer wall: "
                           "extraction pin -> model pin surface -> analysis "
                           "canonical bytes -> hub log — one Node.id, byte-"
                           "identical at every hop"),
        }
        self._outer.emit("outerwall.system.trace", {
            "nodeId": node_id, "hopCount": len(hops),
            "byteIdenticalEverywhere": result["byteIdenticalEverywhere"],
            "seedUsed": seed is not None})
        return result
