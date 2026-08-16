# wall.py section 1 of 3 — failure classes, the wall probe leads, and the
# private-bus refusal emitter.  NOT an importable module: wall.py (the
# facade) execs the three section files, in order, into ITS OWN namespace,
# so this file relies on the names wall.py defines (_probes, sys, json, ...)
# exactly as the original single-file wall did.  (Comment header, not a
# docstring, so the exec never overwrites the wall module's __doc__.)

from __future__ import annotations

# ---------------------------------------------------------------------------
# Failure classes
# ---------------------------------------------------------------------------

class WallRefusal(Exception):
    """A named wall rejection.  .failureClass carries the class string."""

    def __init__(self, failure_class: str, message: str):
        super().__init__(f"failure-class={failure_class}: {message}")
        self.failureClass = failure_class


class WallRefusalNotice:
    """Typed refusal RETURNED (not raised) for languages outside the profile
    set — never a fabricated tier, never a crash.  tier is None by
    construction: unknown surfaces unknown.

    (A plain class, not a dataclass, so wall.py stays loadable by the
    file-read + exec canonical-as-data pattern the conformance test uses.)"""

    def __init__(self, *, known: bool, failureClass: str, honestCeiling: str,
                 lang: str):
        self.known = known
        self.failureClass = failureClass
        self.honestCeiling = honestCeiling
        self.lang = lang
        self.tier = None
        self.wallVersion = WALL_VERSION

    def __repr__(self):
        return (f"WallRefusalNotice(known={self.known!r}, "
                f"failureClass={self.failureClass!r}, lang={self.lang!r}, "
                f"tier=None, honestCeiling={self.honestCeiling!r})")


# ---------------------------------------------------------------------------
# Wall probe leads — catalog extended (additive; the bus rejects uncatalogued
# emits, so registration here is what makes wall leads legal to fire).
# ---------------------------------------------------------------------------

_probes.register(
    "capability.wall.construct", "value",
    "{wallVersion,lang,tier,schemaVersion,schemaHash}",
    "wall face constructed over a finished capability() run: the declared tier "
    "and the schema PIN the wall stands on")
_probes.register(
    "capability.wall.refusal", "branch",
    "{failureClass,lang,reason}",
    "a named wall refusal (unknown-language / schema-pin-mismatch / "
    "concurrent-run-unsupported) — refusals are leads, never silent")
_probes.register(
    "capability.wall.shutdown", "state",
    "{lang,alive,terminated}",
    "wall shutdown(): the live LSP child terminated (the cell's known leak, "
    "closed at the wall)")


def _emit_refusal(failure_class: str, lang: str, reason: str) -> dict:
    """Refusals happen with no run in flight: emit on a private ProbeBus so no
    other run's history() is polluted.  tap() observers still see the event."""
    bus = _probes.ProbeBus()
    bus.emit("capability.wall.refusal", "branch",
             {"failureClass": failure_class, "lang": lang, "reason": reason},
             stage="wall")
    return bus.history()[-1]
