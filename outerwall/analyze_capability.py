"""analyze_capability.py — capability feed management for analyze().

SUB200 restructure: split out of outerwall/analyze.py (which stays the
facade).  Behavior identical: the REAL V1 feed by default (measured tiers
only), extractor-local stub for diagnostic runs (provenance says so),
per-lang pin-stream snapshots taken BEFORE shutdown (the V1 report's
bound 4), and the capability provenance/bounds/refusal collection —
every decision logged on the same probes in the same order.
"""
from __future__ import annotations

from . import OuterLog, OuterwallError, ensure_assembly_paths, json_scrub


def _v1_feed_cls():
    ensure_assembly_paths()
    from v1_capability_extractor import V1CapabilityFeed
    return V1CapabilityFeed


def open_capability(config: dict, olog: OuterLog):
    """Resolve config['capability'] -> (feed|None, cap_fn|None), logged."""
    capability_mode = config.get("capability", "v1")
    olog.emit("outerwall.capability.mode", {
        "mode": capability_mode,
        "note": ("v1: vessels/v1_capability_extractor.V1CapabilityFeed — "
                 "measured tiers only; stub: extractor-local stub "
                 "(diagnostic runs only, provenance says so)")})
    if capability_mode == "v1":
        feed = _v1_feed_cls()()
        return feed, feed.capability_fn
    elif capability_mode == "stub":
        return None, None               # extractor's own stub; recorded later
    else:
        raise OuterwallError(f"unknown capability mode {capability_mode!r}")


def snapshot_streams(feed) -> dict[str, dict]:
    """Snapshot cell 2's pin streams BEFORE shutdown (module-global
    last-run state would rot otherwise — the V1 report's bound 4)."""
    streams: dict[str, dict] = {}
    if feed is not None:
        for lang, wall in feed._walls.items():
            streams[lang] = {
                "catalog": wall.pins.probeCatalog(),
                "history": wall.pins.history(),
            }
    return streams


def capability_provenance(feed, extractor_wall, olog: OuterLog):
    """-> (capability_prov, capability_bounds, feed_refusals), logged."""
    if feed is not None:
        capability_prov = json_scrub(feed.provenance)
        capability_bounds = json_scrub(feed.bounds)
        feed_refusals = json_scrub(feed.refusals)
    else:
        capability_prov = {
            lang: {"lang": lang, "measuredBy": "extractor-stub",
                   "tier": cap["tier"],
                   "note": "capability mode 'stub' — no measurement, "
                           "diagnostic run only"}
            for lang, cap in (extractor_wall.pins.dump()
                              .get("capabilities") or {}).items()}
        capability_bounds, feed_refusals = [], []
    olog.emit("outerwall.capability.provenance", {
        "langs": {k: v.get("measuredBy") for k, v in capability_prov.items()},
        "bounds": [b.get("bound") for b in capability_bounds]})
    return capability_prov, capability_bounds, feed_refusals
