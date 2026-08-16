"""pins_streams.py — SystemPins' bounded dump()/history() surface.

SUB200 restructure: split out of outerwall/system_pins.py (which stays the
facade composing this mixin into SystemPins — importers see no change).
Behavior identical: every bound application logged via
outerwall.bound.logged, truncations carry sha256+byteLen, never silent.
"""
from __future__ import annotations

import hashlib
import json


def _canon(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, default=str)


class StreamsMixin:
    """dump()/history() + the bound helpers (composed into SystemPins)."""

    # ---- bounded payloads (logged, never silent) --------------------------------
    def _bound_payload(self, payload, truncations: list, where: str):
        text = _canon(payload)
        raw = text.encode("utf-8")
        if len(raw) <= self._payload_bound:
            return payload
        truncations.append({"where": where, "byteLen": len(raw),
                            "bound": self._payload_bound})
        return {"truncated": True,
                "sha256": hashlib.sha256(raw).hexdigest(),
                "byteLen": len(raw), "bound": self._payload_bound}

    def _bounded_events(self, events: list, truncations: list,
                        source: str) -> dict:
        total = len(events)
        tail_truncated = total > self._tail
        if tail_truncated:
            truncations.append({"where": f"{source}(stream-tail)",
                                "total": total, "bound": self._tail})
        kept = events[-self._tail:] if tail_truncated else list(events)
        out_events = []
        for i, e in enumerate(kept):
            e = dict(e)
            if "payload" in e:
                e["payload"] = self._bound_payload(
                    e["payload"], truncations, f"{source}[{i}].payload")
            out_events.append(e)
        return {"events": out_events, "total": total,
                "truncated": tail_truncated, "bound": self._tail,
                "boundKind": "tail"}

    def _log_bounds(self, op: str, truncations: list) -> None:
        if truncations:
            self._outer.emit("outerwall.bound.logged", {
                "op": op, "truncations": truncations,
                "payloadByteBound": self._payload_bound,
                "streamTailBound": self._tail,
                "note": "every truncation carries sha256+byteLen — bounded, "
                        "checkable, never silent"})

    # ---- dump -------------------------------------------------------------------
    def dump(self) -> dict:
        truncations: list = []
        sources = {
            "outerwall": {"history": self._bounded_events(
                self._outer.history(), truncations, "outerwall")},
            "hub": {"history": self._bounded_events(
                self._hub.history(), truncations, "hub")},
            "structure-extractor": self._bound_payload(
                self._extractor.pins.dump(), truncations,
                "structure-extractor.dump"),
            "graph-model": self._bound_payload(
                self._model.pins.dump(), truncations, "graph-model.dump"),
            "capability-layer": {
                lang: {"history": self._bounded_events(
                    s["history"], truncations, f"capability-layer[{lang}]")}
                for lang, s in self._capability.items()},
        }
        self._log_bounds("dump", truncations)
        out = {**self._header(), "sources": sources,
               "declaredRoots": list(self._session.get("declaredRoots") or []),
               "staging": self._session.get("staging"),
               "boundsApplied": truncations}
        self._outer.emit("outerwall.system.dump",
                         {"sources": sorted(sources),
                          "truncations": len(truncations)})
        return out

    # ---- history ------------------------------------------------------------------
    def history(self) -> dict:
        truncations: list = []
        streams = {
            "outerwall": self._bounded_events(self._outer.history(),
                                              truncations, "outerwall"),
            "hub": self._bounded_events(self._hub.history(),
                                        truncations, "hub"),
            "structure-extractor": self._bounded_events(
                self._extractor.pins.history(), truncations,
                "structure-extractor"),
            "graph-model": self._bounded_events(
                self._model.pins.history(), truncations, "graph-model"),
        }
        for lang, s in self._capability.items():
            streams[f"capability-layer[{lang}]"] = self._bounded_events(
                s["history"], truncations, f"capability-layer[{lang}]")
        self._log_bounds("history", truncations)
        out = {**self._header(), "streams": streams,
               "clockNote": ("logical clocks are PER-STREAM (each cell owns "
                             "its bus) — cross-stream order is not claimed"),
               "boundsApplied": truncations}
        self._outer.emit("outerwall.system.history",
                         {"streams": sorted(streams),
                          "truncations": len(truncations)})
        return out
