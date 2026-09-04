"""vessels/v1_feed.py — V1CapabilityFeed: the capability_fn factory over
cell 2's wall, in cell 3's expected shape.

SUB200 restructure: split out of vessels/v1_capability_extractor.py (which
remains the facade, keeps the V1-invariants docstring, and re-exports this
class).  Behavior unchanged; see the facade for the full seam documentation.
"""
from __future__ import annotations

from v1_walls import (EXTRACTOR_LANGS, CapabilityHandle,
                      SilentTierUpgradeError, UnknownLanguageError,
                      UnrecordedStubFallback, WallRefusalNotice,
                      cap_probes, capability_wall, stub_capability)


class FeedShutdownError(RuntimeError):
    """[H11] Named failure class `feed-shutdown`: capability_fn was called
    after the vessel's shutdown() — the cached CapabilityHandle references
    dead LSP children (cell 2 owned them; the vessel terminated them at
    shutdown), so handing it out would deliver a stale handle.  Callers
    must construct a fresh V1CapabilityFeed to re-measure."""
    failure_class = "feed-shutdown"


class V1CapabilityFeed:
    """capability_fn factory over cell 2's wall, in cell 3's expected shape."""

    def __init__(self):
        self._walls: dict[str, object] = {}     # lang -> live CapabilityWall
        self._handles: dict[str, CapabilityHandle] = {}
        self.provenance: dict[str, dict] = {}   # lang -> provenance record
        self.refusals: list[dict] = []          # cell-2 refusal pin events
        self.bounds: list[dict] = []            # logged bounds (never silent)
        self.shutdown_pins: list[dict] = []     # capability.wall.shutdown payloads
        self._down = False

    # -- the injected socket -------------------------------------------------
    def capability_fn(self, lang: str) -> CapabilityHandle:
        if self._down:
            # [H11] refuse LOUDLY after shutdown — never serve a cached
            # handle whose underlying LSP child was terminated by shutdown()
            raise FeedShutdownError(
                f"vessel V1: capability_fn({lang!r}) called after "
                f"shutdown() — cached handles reference dead LSP children; "
                f"construct a fresh V1CapabilityFeed to re-measure")
        if lang in self._handles:
            return self._handles[lang]

        captured: list[dict] = []
        untap = cap_probes.tap("capability.wall.refusal", captured.append)
        try:
            result = capability_wall(lang)
        finally:
            untap()

        if isinstance(result, WallRefusalNotice):
            refusal = {
                "lang": lang,
                "failureClass": result.failureClass,
                "honestCeiling": result.honestCeiling,
                "wallVersion": result.wallVersion,
                "pinEvents": [e["payload"] for e in captured],
            }
            self.refusals.append(refusal)
            if lang not in EXTRACTOR_LANGS:
                self.provenance[lang] = {
                    "lang": lang, "measuredBy": "refused", "tier": None,
                    "refusal": refusal,
                }
                raise UnknownLanguageError(
                    f"vessel V1: capability-layer returned a typed "
                    f"unknown-language refusal for {lang!r} and the extractor "
                    f"has no dock vocabulary for it either — no tier is "
                    f"fabricated (unknown != green)")
            # the extractor's own stub, used ONLY as an explicitly recorded
            # fallback (writing the record BEFORE returning the handle is what
            # makes `unrecorded-stub-fallback` structurally unreachable).
            stub = stub_capability(lang)
            record = {
                "lang": lang, "measuredBy": "local-stub", "tier": stub.tier,
                "refusal": refusal, "handleKind": None,
            }
            self.provenance[lang] = record
            handle = CapabilityHandle(
                lang, stub.tier,
                f"{stub.handle_kind} [local-stub FALLBACK, recorded by vessel "
                f"V1 — capability-layer typed refusal: "
                f"{result.failureClass}]",
                None)
            record["handleKind"] = handle.handle_kind
            if record["refusal"] is None:
                raise UnrecordedStubFallback(
                    f"stub answer for {lang!r} without a recorded refusal")
            self._handles[lang] = handle
            return handle

        # known language: cell 2 MEASURED it.  Face vs pin, byte-equal.
        wall = result
        hist = wall.pins.history()
        measured = [e for e in hist
                    if e["probeId"] == "capability.probe.measuredTier"]
        construct = [e for e in hist
                     if e["probeId"] == "capability.wall.construct"]
        if not measured:
            raise SilentTierUpgradeError(
                f"no capability.probe.measuredTier pin for {lang!r} — the "
                f"tier has no measurement to stand on")
        pin_tier = measured[-1]["payload"]["measuredTier"]
        if (wall.tier != pin_tier
                or wall.tier.encode("utf-8") != pin_tier.encode("utf-8")):
            raise SilentTierUpgradeError(
                f"face tier {wall.tier!r} != measured pin {pin_tier!r} for "
                f"{lang!r} — refusing to carry an unmeasured tier")
        self._walls[lang] = wall
        self.provenance[lang] = {
            "lang": lang, "measuredBy": "capability-layer",
            "tier": wall.tier,
            "measuredTierPin": dict(measured[-1]["payload"]),
            "constructPin": (dict(construct[-1]["payload"])
                             if construct else None),
            "paperTier": wall.paperTier,
            "honestCeiling": wall.honestCeiling,
            "extractor": wall.provenance["extractor"],
            "wallVersion": wall.wallVersion,
        }
        handle = CapabilityHandle(
            lang, wall.tier,
            f"capability-layer:{wall.provenance['extractor']} "
            f"[MEASURED tier {wall.tier}; {wall.wallVersion}]",
            wall.handle)
        self._handles[lang] = handle

        if wall.handle.kind == "lsp":
            # the documented V1 friction, kept + logged (never silent):
            self.bounds.append({
                "bound": "duplicated-subprocess",
                "lang": lang,
                "detail": ("cell 3's dock builds its own backend from "
                           "PipelineConfig (CapabilityHandle.handle is not "
                           "consumed by _make_dock); cell 2's measured "
                           f"{wall.provenance['extractor']} child stays alive "
                           "under this vessel until shutdown() — two live "
                           "subprocess trees during a python extract"),
            })
        if lang == "python":
            self.bounds.append({
                "bound": "no-grammar-floor",
                "lang": lang,
                "detail": ("cell 2's stub tree-sitter runtime has no .py "
                           "grammar: if pyright dies the fallback tier is P, "
                           "not G (visible in the discovery grammar lead)"),
            })
        return handle

    # -- lifecycle -------------------------------------------------------------
    def shutdown(self) -> list[dict]:
        """Terminate every live LSP child cell 2 handed over (idempotent).
        Returns the capability.wall.shutdown pin payloads as proof.

        [H11] After shutdown the handle/wall caches are CLEARED so a later
        capability_fn() cannot serve a stale reference; capability_fn also
        raises FeedShutdownError on _down."""
        if self._down:
            return list(self.shutdown_pins)
        self._down = True
        captured: list[dict] = []
        untap = cap_probes.tap("capability.wall.shutdown", captured.append)
        errors: list[str] = []
        try:
            for lang, wall in list(self._walls.items()):
                try:
                    wall.shutdown()
                except Exception as exc:  # noqa: BLE001 — each wall shuts down independently
                    errors.append(f"{lang}: {exc}")
        finally:
            untap()
            self.shutdown_pins = [e["payload"] for e in captured]
            # [H11] invalidate — capability_fn now refuses, live_clients
            # returns []; anyone holding the pre-shutdown handles has an
            # explicit stale reference (typed by _down + FeedShutdownError
            # on the next fetch).
            self._handles.clear()
            self._walls.clear()
        if errors:
            print(f"[V1Feed] shutdown errors (walls shut down independently, "
                  f"all attempted): {'; '.join(errors)}", flush=True)
        return list(self.shutdown_pins)

    def live_clients(self):
        """(lang, LspClient) for every wall-held live LSP child (test surface)."""
        out = []
        for lang, wall in self._walls.items():
            client = getattr(wall.handle, "_client", None)
            if client is not None:
                out.append((lang, client))
        return out
