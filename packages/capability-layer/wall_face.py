# wall.py section 3 of 3 — the pins accessor, the battery summary, the
# CapabilityWall face and the capability_wall() factory.
# NOT an importable module: exec'd by wall.py into its namespace.
# (Comment header, not a docstring — see wall_refusals.py.)

from __future__ import annotations

# ---------------------------------------------------------------------------
# Pins accessor — the cell's diagnostic quartet, reachable through the wall.
# ---------------------------------------------------------------------------

# [ASSEMBLY CHANGE Wave-B D1] WallPins is bound to ONE run's own bus and
# state snapshot, not the cell's module-global _LAST.  Before this change
# every wall.pins.history()/dump() went through _cap_mod.dump/.history —
# module-global LAST-RUN state — so measuring a second language silently
# overwrote every earlier wall.pins.history() reader (analyze()'s
# snapshot_streams then attributed the SECOND language's stream to every
# feed._walls entry it iterated).  probeCatalog/tap stay module-global
# (both are process-wide by design); the cell's module-global
# _cap_mod.dump/_cap_mod.history remain untouched as the shim for
# standalone callers who genuinely want last-run global state.
class WallPins:
    """Diagnostic quartet bound to ONE wall run.  dump()/history() are the
    INSTANCE's own captured state + bus — a subsequent capability() run
    cannot silently overwrite them (see the concurrency bound above).
    probeCatalog() and tap() delegate to the cell's process-wide probe
    registry (catalog + taps are module-global by design)."""

    def __init__(self, bus, state):
        # bus is this run's ProbeBus; state is the dict capability() built
        # for this run (captured by the wall factory before any subsequent
        # capability() call can rebind _cap_mod._LAST).
        self._bus = bus
        self._state = state

    def probeCatalog(self) -> list[dict]:
        return _probes.probeCatalog()

    def dump(self) -> dict:
        # Same shape as _cap_mod.dump(), read from THIS wall's own state
        # (not _cap_mod._LAST["state"], which any later run rebinds).
        s = self._state
        return {
            "discovery": s.get("discovery"),
            "scorecard": s.get("scorecard"),
            "treewalk": s.get("treewalk"),
            "shimState": s.get("shimState"),
            "battery": s.get("battery"),
            "cache": s.get("cache"),
            "libInventory": s.get("libInventory"),
            "capability": s.get("capability"),
        }

    def history(self) -> list[dict]:
        # THIS wall's own bus events (a copy — bus.history() returns a copy
        # too, but reading .events directly avoids the extra list()).
        return list(self._bus.events)

    def tap(self, probe_id: str, fn):
        return _probes.tap(probe_id, fn)


# ---------------------------------------------------------------------------
# The wall object
# ---------------------------------------------------------------------------

def _summarize_battery(battery: dict, tier: str) -> dict:
    """The probeReport SUMMARY the face carries: per-probe verdicts + the
    green_allowed enforcement result.  Raw request/response/evidence stay
    pins (pins.dump()['battery'] / pins.history())."""
    return {
        "measuredTier": battery["measuredTier"],
        "paperTier": battery["paperTier"],
        "p2": battery["p2"],
        "greenAllowed": _green_allowed(tier, battery["p2"]),
        "coldStartNanos": battery["coldStartNanos"],
        "restartFast": battery["restartFast"],
        "probes": [{"id": r["id"], "ran": r["ran"], "verdict": r["verdict"]}
                   for r in battery["results"]],
    }


class CapabilityWall:
    """The face over one finished capability() run.  Every declared field is
    read from the cell's real return — conformance (test_15) asserts each one
    against the pins; declared may never diverge from probed."""

    known = True

    def __init__(self, cap, bus, state, schema_pin: dict):
        self.wallVersion = WALL_VERSION
        self.schemaPin = dict(schema_pin)
        self.lang = cap.lang
        self.tier = cap.tier                      # MEASURED, never paper
        self.paperTier = cap.paperTier
        self.honestCeiling = cap.honestCeiling
        self.provenance = dict(cap.provenance)
        self.probeReport = _summarize_battery(cap.probeReport, cap.tier)
        self.handle = cap.handle                  # UNWRAPPED live Handle
        # [Wave-B D1] pins bound to THIS run's own bus + state (was: static
        # shim over _cap_mod._LAST, silently overwritten by later runs).
        self.pins = WallPins(bus, state)
        self._bus = bus                           # this run's own bus
        self._down = False

    def shutdown(self) -> None:
        """Terminate the live LSP child (idempotent; emits once)."""
        if self._down:
            return
        self._down = True
        try:
            self.handle.shutdown()
        finally:
            client = getattr(self.handle, "_client", None)
            terminated = (client is None or client.proc is None
                          or client.proc.poll() is not None)
            self._bus.emit("capability.wall.shutdown", "state",
                           {"lang": self.lang, "alive": self.handle.alive,
                            "terminated": terminated}, stage="wall")


def capability_wall(lang: str, repo: str | None = None,
                    config: dict | None = None):
    """The wall factory.  Returns CapabilityWall (known language) or
    WallRefusalNotice (unknown language).  Raises WallRefusal for
    schema-pin-mismatch and concurrent-run-unsupported."""
    schema_pin = _check_schema_pin()

    if lang not in _fixtures.PROFILES:
        _emit_refusal("unknown-language", lang,
                      f"no profile for {lang!r} in fixtures.PROFILES — "
                      f"tier is UNKNOWN, not fabricated")
        return WallRefusalNotice(
            known=False, failureClass="unknown-language",
            honestCeiling="no profile — tier unknown", lang=lang)

    if not _RUN_LOCK.acquire(blocking=False):
        _emit_refusal("concurrent-run-unsupported", lang,
                      "a wall-mediated capability() run is already in flight; "
                      "dump()/history() are last-run-global — serialize runs")
        raise WallRefusal(
            "concurrent-run-unsupported",
            "one-capability-run-at-a-time: another wall-mediated run is in "
            "flight (the cell's dump()/history() are module-global)")
    try:
        cap = _cap_mod.capability(lang, repo, config)
        bus = _cap_mod._LAST["bus"]     # this run's bus (we hold the run lock)
        # [Wave-B D1] also capture this run's state so wall.pins.dump() reads
        # from the instance, not from _cap_mod._LAST["state"] (which any
        # subsequent capability() rebinds — misattributing evidence).
        state = _cap_mod._LAST["state"]
        bus.emit("capability.wall.construct", "value",
                 {"wallVersion": WALL_VERSION, "lang": lang, "tier": cap.tier,
                  "schemaVersion": schema_pin["schemaVersion"],
                  "schemaHash": schema_pin["schemaHash"]}, stage="wall")
        return CapabilityWall(cap, bus, state, schema_pin)
    finally:
        _RUN_LOCK.release()
