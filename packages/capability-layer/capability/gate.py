"""Stage B — Maintenance & license gate (runbook step 2).

Drops archived/known-dead candidates outright; drops stale ones unless nothing
else exists (then kept WITH the reason on the lead), and classifies licenses:
embed-safe / subprocess-only / veto.
S5/S6 gate SHIPPABILITY, not depth — a compiler-deep server that is archived or
license-locked is not a usable answer.
"""

from __future__ import annotations

import datetime

from . import fixtures

STAGE = "gate"

STALE_DAYS = 365  # "released/committed within ~6–12 months"


def _parse_date(s):
    if not s:
        return None
    return datetime.date.fromisoformat(s)


def classify_license(spdx):
    if spdx in fixtures.PERMISSIVE:
        return "embed-safe", f"{spdx} is permissive"
    if spdx in fixtures.COPYLEFT_SUBPROCESS_ONLY:
        return "subprocess-only", (f"{spdx} is copyleft — usable ONLY as an "
                                   f"out-of-process subprocess whose text/JSON we "
                                   f"consume (Operating Contract rule 10)")
    if spdx in fixtures.VETO or spdx is None:
        return "veto", (f"license {spdx!r} is closed/BUSL/unknown — cannot ship; "
                        f"depth alone is not shippability")
    return "veto", f"unrecognized license {spdx!r} — stop and report (rule 10)"


def run(bus, disc: dict, config: dict) -> list[dict]:
    now = datetime.date.fromisoformat(config["now"])
    survivors = []
    candidates = disc["candidates"]
    for cand in candidates:
        if cand.get("archived") or cand["name"] in fixtures.ARCHIVED_SERVERS:
            bus.emit("capability.gate.archived", "branch",
                     {"candidate": cand["name"],
                      "reason": "archived/known-dead — candidate excluded"},
                     stage=STAGE)
            continue

        last = max(filter(None, [_parse_date(cand.get("lastRelease")),
                                 _parse_date(cand.get("lastCommit"))]),
                   default=None)
        stale = last is None or (now - last).days > STALE_DAYS
        sole_option = len(candidates) == 1 or all(
            (c is cand or c.get("archived") or c["name"] in fixtures.ARCHIVED_SERVERS)
            for c in candidates)
        if stale and not sole_option:
            verdict, reason = "drop", (f"stale (last activity {last}) and "
                                       f"alternatives exist")
        elif stale:
            verdict, reason = "keep", (f"stale (last activity {last}) but nothing "
                                       f"else exists — kept with this caveat")
        else:
            verdict, reason = "keep", f"alive (last activity {last})"
        bus.emit("capability.gate.maintenance", "decision",
                 {"candidate": cand["name"], "lastRelease": cand.get("lastRelease"),
                  "lastCommit": cand.get("lastCommit"), "verdict": verdict,
                  "reason": reason}, stage=STAGE)
        if verdict == "drop":
            continue

        lic_verdict, lic_reason = classify_license(cand.get("license"))
        bus.emit("capability.gate.license", "decision",
                 {"candidate": cand["name"], "spdx": cand.get("license"),
                  "verdict": lic_verdict, "reason": lic_reason}, stage=STAGE)
        if lic_verdict == "veto":
            continue

        out = dict(cand)
        out["licenseVerdict"] = lic_verdict
        out["maintenanceNote"] = reason
        survivors.append(out)

    # full survivor records — the catalog declares [CandidateServer]
    bus.emit("capability.gate.output", "output", survivors, stage=STAGE)
    return survivors
